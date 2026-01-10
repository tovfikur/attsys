# -*- coding: utf-8 -*-
import re
import pytz
import requests
import unicodedata
from datetime import datetime, timedelta
from collections import defaultdict
from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
import logging
_logger = logging.getLogger(__name__)



class HikDevice(models.Model):
    _name = "hik.device"
    _description = "Hik-Connect Device Configuration"

    # ─────────────────────────────
    # Basic Config
    name = fields.Char(string="Device Name", required=True)
    app_key = fields.Char(string="App Key", required=True)
    secret_key = fields.Char(string="Secret Key", required=True)

    api_url = fields.Char(
        string="API URL",
        default="/api/hccgw/acs/v1/event/certificaterecords/search",
        help="Relative path appended to areaDomain returned by token API",
    )

    # Runtime info
    token = fields.Char(string="Access Token", readonly=True)
    area_domain = fields.Char(string="Area Domain", readonly=True)
    token_expire_time = fields.Datetime(string="Token Expire Time", readonly=True)

    active = fields.Boolean(default=True)

    # ─────────────────────────────
    def _clean_area_domain(self, area_domain):
        """Normalize malformed Hik areaDomain into a valid base URL."""
        if not area_domain:
            raise UserError(_("Empty area domain received."))

        match = re.search(r"https?://[a-zA-Z0-9\.\-]+", area_domain)
        if match:
            return match.group(0)

        if "hikcentralconnect.com" in area_domain:
            return "https://isgp-team.hikcentralconnect.com"

        raise UserError(_("Invalid area domain: %s") % area_domain)

    # ─────────────────────────────
    def _generate_token(self):
        """Fetch Hik token using appKey + secretKey"""
        self.ensure_one()
        token_url = "https://isgp-team.hikcentralconnect.com/api/hccgw/platform/v1/token/get"
        payload = {"appKey": self.app_key, "secretKey": self.secret_key}

        try:
            res = requests.post(token_url, json=payload, timeout=15)
            res.raise_for_status()
            data = res.json()
        except Exception as e:
            raise UserError(_("Failed to request token: %s") % e)

        if data.get("errorCode") != "0":
            raise UserError(_("Token API returned error: %s") % data)

        token_data = data.get("data", {})
        if not token_data:
            raise UserError(_("Token response missing data."))

        access_token = token_data.get("accessToken")
        expire_ts = token_data.get("expireTime")
        area_domain = token_data.get("areaDomain")

        if not access_token or not area_domain:
            raise UserError(_("Invalid token data: missing accessToken or areaDomain."))

        # Normalize domain
        area_domain = self._clean_area_domain(area_domain)

        try:
            expire_dt = datetime.utcfromtimestamp(float(expire_ts))
        except Exception:
            expire_dt = fields.Datetime.now()

        self.write({
            "token": access_token,
            "area_domain": area_domain,
            "token_expire_time": expire_dt,
        })
        return access_token, area_domain

    @api.onchange('name')
    def _onchange_name_validate_hik_device(self):
        """Check if entered device name exists in Hik-Connect device list"""
        for rec in self:
            if not rec.name or not rec.app_key or not rec.secret_key:
                return

            try:
                token, area_domain = rec._generate_token()
                base_url = rec._clean_area_domain(area_domain)
                url = f"{base_url.rstrip('/')}/api/hccgw/resource/v1/devices/get"

                payload = {"pageIndex": 1, "pageSize": 100, "areaID": ""}
                headers = {"Content-Type": "application/json", "Token": token}

                res = requests.post(url, json=payload, headers=headers, timeout=15)
                res.raise_for_status()
                data = res.json()

                if data.get("errorCode") != "0":
                    raise ValidationError(_("Device API returned error: %s") % data)

                device_list = data.get("data", {}).get("device", [])
                names = [d.get("name", "").strip().lower() for d in device_list]

                if rec.name.strip().lower() not in names:
                    rec.name = False
                    return {
                        'warning': {
                            'title': _('Device Not Found'),
                            'message': _('❌ No device named "%s" found in Hik-Connect list.') % rec.name,
                        }
                    }

            except Exception as e:
                raise ValidationError(_("Failed to validate device name: %s") % e)

    # ─────────────────────────────
    def action_test_connection(self):
        """Completely check Hik-Connect connection and device presence"""
        self.ensure_one()
        if not self.app_key or not self.secret_key:
            raise ValidationError(_("App Key and Secret Key are required."))

        # Step 1: Generate token
        try:
            token, area_domain = self._generate_token()
        except Exception as e:
            raise ValidationError(_("Failed to generate token: %s") % e)

        # Step 2: Validate area domain
        base_url = self._clean_area_domain(area_domain)
        url = f"{base_url.rstrip('/')}/api/hccgw/resource/v1/devices/get"

        payload = {"pageIndex": 1, "pageSize": 100, "areaID": ""}
        headers = {"Content-Type": "application/json", "Token": token}

        try:
            res = requests.post(url, json=payload, headers=headers, timeout=15)
            res.raise_for_status()
            data = res.json()
        except Exception as e:
            raise ValidationError(_("Failed to connect to Hik-Connect API:\n%s") % e)

        if data.get("errorCode") != "0":
            raise ValidationError(_("Device List API returned error: %s") % data)

        devices = data.get("data", {}).get("device", [])
        if not devices:
            raise ValidationError(_("No devices found in Hik-Connect account."))

        api_names = [d.get("name", "").strip().lower() for d in devices]
        if self.name and self.name.strip().lower() not in api_names:
            return {
                "effect": {
                    "fadeout": "slow",
                    "message": _("⚠️ Connection OK, but device '%s' not found!") % self.name,
                    "type": "rainbow_man",
                }
            }

        # Success
        return {
            "effect": {
                "fadeout": "slow",
                "message": _("✅ Connection successful! Device '%s' verified.") % self.name,
                "type": "rainbow_man",
            }
        }

    def action_download_all_logs(self):
        """Download and store punch logs (Device-wise: device, person_code, first_name, last_name, record_time)."""
        self.ensure_one()
        _logger = self.env['ir.logging']

        # ───────────── Token + API Setup ─────────────
        token, area = self._generate_token()
        base_url = self._clean_area_domain(area)
        url = f"{base_url.rstrip('/')}{self.api_url}"

        # Time range: current year
        current_year = datetime.now().year
        begin_time = f"{current_year}-01-01T00:00:00+08:00"
        end_time = f"{current_year}-12-31T23:59:59+08:00"

        headers = {"Content-Type": "application/json", "Token": token}
        page_index = 1
        page_size = 200
        total_count = 0
        matched_device = False

        logs_env = self.env["hik.attendance.log"]

        # ───────────── Pagination Loop ─────────────
        while True:
            payload = {
                "pageIndex": page_index,
                "pageSize": page_size,
                "beginTime": begin_time,
                "endTime": end_time,
            }

            try:
                res = requests.post(url, json=payload, headers=headers, timeout=30)
                res.raise_for_status()
                data = res.json()
            except Exception as e:
                raise UserError(_("API error: %s") % e)

            record_list = data.get("data", {}).get("recordList", [])
            if not record_list:
                break  # no more data

            for rec in record_list:
                # ───────────── Device Filter ─────────────
                api_device_name = (rec.get("deviceName") or "").strip().lower()
                odoo_device_name = self.name.strip().lower()

                if api_device_name != odoo_device_name:
                    continue
                matched_device = True

                # ───────────── Person Info ─────────────
                base_info = rec.get("personInfo", {}).get("personInfo", {}) or \
                            rec.get("personInfo", {}).get("baseInfo", {}) or {}
                person_code = base_info.get("personCode")
                first_name = base_info.get("firstName") or ""
                last_name = base_info.get("lastName") or ""

                if not person_code:
                    continue

                # ───────────── Record Time ─────────────
                record_time_raw = rec.get("recordTime")
                record_time = fields.Datetime.now()
                if record_time_raw:
                    try:
                        record_time = fields.Datetime.to_datetime(
                            record_time_raw.replace("T", " ").replace("Z", "")
                        )
                    except Exception:
                        pass

                # ───────────── Avoid Duplicates ─────────────
                existing = logs_env.search([
                    ("device_id", "=", self.id),
                    ("person_code", "=", person_code),
                    ("record_time", "=", record_time),
                ], limit=1)
                if existing:
                    continue

                # ───────────── Create Log Record ─────────────
                logs_env.create({
                    "device_id": self.id,
                    "person_code": person_code,
                    "first_name": first_name,
                    "last_name": last_name,
                    "record_time": record_time,
                })
                total_count += 1

            # ───────────── Pagination Control ─────────────
            total_records = data.get("data", {}).get("totalNum", 0)
            if page_index * page_size >= total_records:
                break
            page_index += 1

        # ───────────── Validation ─────────────
        if not matched_device:
            raise ValidationError(_(
                "⚠️ No matching device logs found for device: %s" % self.name
            ))

        # ───────────── Logging ─────────────
        _logger.create({
            'name': 'Hik Download',
            'type': 'server',
            'level': 'INFO',
            'dbname': self._cr.dbname,
            'message': f"Device: {self.name}, Total punch records added: {total_count}",
            'path': 'hik.device',
            'func': 'action_download_all_logs',
            'line': '0',
        })

        return {
            "effect": {
                "fadeout": "slow",
                "message": _("✅ %d punch records added for device %s" % (total_count, self.name)),
                "type": "rainbow_man",
            }
        }


    def action_last_two_days_logs_download(self):
        """Download and store punch logs (Device-wise: device, person_code, first_name, last_name, record_time)."""
        self.ensure_one()
        _logger = self.env['ir.logging']

        # ───────────── Token + API Setup ─────────────
        token, area = self._generate_token()
        base_url = self._clean_area_domain(area)
        url = f"{base_url.rstrip('/')}{self.api_url}"

        # Time range: Last 2 days from now
        now = datetime.now()
        two_days_ago = now - timedelta(days=2)

        begin_time = two_days_ago.strftime("%Y-%m-%dT%H:%M:%S+08:00")
        end_time   = now.strftime("%Y-%m-%dT%H:%M:%S+08:00")

        headers = {"Content-Type": "application/json", "Token": token}
        page_index = 1
        page_size = 200
        total_count = 0
        matched_device = False

        logs_env = self.env["hik.attendance.log"]

        # ───────────── Pagination Loop ─────────────
        while True:
            payload = {
                "pageIndex": page_index,
                "pageSize": page_size,
                "beginTime": begin_time,
                "endTime": end_time,
            }

            try:
                res = requests.post(url, json=payload, headers=headers, timeout=30)
                res.raise_for_status()
                data = res.json()
            except Exception as e:
                raise UserError(_("API error: %s") % e)

            record_list = data.get("data", {}).get("recordList", [])
            if not record_list:
                break  # no more data

            for rec in record_list:
                # ───────────── Device Filter ─────────────
                api_device_name = (rec.get("deviceName") or "").strip().lower()
                odoo_device_name = self.name.strip().lower()

                if api_device_name != odoo_device_name:
                    continue
                matched_device = True

                # ───────────── Person Info ─────────────
                base_info = rec.get("personInfo", {}).get("personInfo", {}) or \
                            rec.get("personInfo", {}).get("baseInfo", {}) or {}
                person_code = base_info.get("personCode")
                first_name = base_info.get("firstName") or ""
                last_name = base_info.get("lastName") or ""

                if not person_code:
                    continue

                # ───────────── Record Time ─────────────
                record_time_raw = rec.get("recordTime")
                record_time = fields.Datetime.now()
                if record_time_raw:
                    try:
                        record_time = fields.Datetime.to_datetime(
                            record_time_raw.replace("T", " ").replace("Z", "")
                        )
                    except Exception:
                        pass

                # ───────────── Avoid Duplicates ─────────────
                existing = logs_env.search([
                    ("device_id", "=", self.id),
                    ("person_code", "=", person_code),
                    ("record_time", "=", record_time),
                ], limit=1)
                if existing:
                    continue

                # ───────────── Create Log Record ─────────────
                logs_env.create({
                    "device_id": self.id,
                    "person_code": person_code,
                    "first_name": first_name,
                    "last_name": last_name,
                    "record_time": record_time,
                })
                total_count += 1

            # ───────────── Pagination Control ─────────────
            total_records = data.get("data", {}).get("totalNum", 0)
            if page_index * page_size >= total_records:
                break
            page_index += 1

        # ───────────── Validation ─────────────
        if not matched_device:
            raise ValidationError(_(
                "⚠️ No matching device logs found for device: %s" % self.name
            ))

        # ───────────── Logging ─────────────
        _logger.create({
            'name': 'Hik Download',
            'type': 'server',
            'level': 'INFO',
            'dbname': self._cr.dbname,
            'message': f"Device: {self.name}, Total punch records added: {total_count}",
            'path': 'hik.device',
            'func': 'action_download_all_logs',
            'line': '0',
        })

        return {
            "effect": {
                "fadeout": "slow",
                "message": _("✅ %d punch records added for device %s" % (total_count, self.name)),
                "type": "rainbow_man",
            }
        }
    
    # ─────────────────────────────
    @api.model
    def cron_download_all_devices(self):
        """Cron: Download and sync 2 days data for all active devices."""
        for device in self.search([("active", "=", True)]):
            try:
                device.action_last_two_days_logs_download()
            except Exception as e:
                self.env['ir.logging'].create({
                    'name': 'Hik Cron',
                    'type': 'server',
                    'level': 'ERROR',
                    'dbname': self._cr.dbname,
                    'message': f"{device.name}: {e}",
                    'path': 'hik.device',
                    'func': 'cron_download_all_devices',
                    'line': '0',
                })
