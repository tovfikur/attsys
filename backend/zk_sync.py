#!/usr/bin/env python3
"""
ZKTeco Device Sync Service for AttSystem
-----------------------------------------
This service connects to ZKTeco attendance devices via the pyzk library
and syncs attendance logs to the AttSystem backend.

Requirements:
    pip install pyzk requests

Usage:
    python zk_sync.py --device-id <device_id> --ip <ip> --port <port> --password <password> --api-url <backend_url> --secret <device_secret> [--mode last2days|all]

Environment variables (alternative to CLI args):
    ZK_DEVICE_ID, ZK_IP, ZK_PORT, ZK_PASSWORD, API_URL, DEVICE_SECRET
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

try:
    from zk import ZK
    from zk.exception import ZKError
except ImportError:
    print("Error: pyzk library not installed. Run: pip install pyzk", file=sys.stderr)
    sys.exit(1)

try:
    import requests
except ImportError:
    print("Error: requests library not installed. Run: pip install requests", file=sys.stderr)
    sys.exit(1)


class ZKTecoSync:
    """ZKTeco device sync handler for AttSystem"""
    
    def __init__(
        self,
        device_id: str,
        ip: str,
        port: int = 4370,
        password: int = 0,
        api_url: str = "http://localhost:8000",
        device_secret: str = "",
        timeout: int = 10
    ):
        self.device_id = device_id
        self.ip = ip
        self.port = port
        self.password = password
        self.api_url = api_url.rstrip('/')
        self.device_secret = device_secret
        self.timeout = timeout
        self.zk: Optional[ZK] = None
        self.conn = None
        
    def connect(self) -> bool:
        """Connect to the ZKTeco device"""
        try:
            self.zk = ZK(
                self.ip,
                port=self.port,
                timeout=self.timeout,
                password=self.password,
                force_udp=False,
                ommit_ping=True
            )
            self.conn = self.zk.connect()
            return True
        except Exception as e:
            print(f"Connection failed: {e}", file=sys.stderr)
            return False
    
    def disconnect(self):
        """Disconnect from the ZKTeco device"""
        if self.conn:
            try:
                self.conn.disconnect()
            except:
                pass
            self.conn = None
    
    def get_device_info(self) -> Dict[str, Any]:
        """Get device information"""
        if not self.conn:
            return {"error": "Not connected"}
        
        try:
            return {
                "connected": True,
                "device_name": self.conn.get_device_name() or "ZKTeco Device",
                "serial_number": self.conn.get_serialnumber() or "Unknown",
                "firmware_version": self.conn.get_firmware_version() or "Unknown",
                "platform": self.conn.get_platform() or "Unknown",
            }
        except Exception as e:
            return {"connected": True, "error": str(e)}
    
    def get_users(self) -> List[Dict[str, Any]]:
        """Get all users from the device"""
        if not self.conn:
            return []
        
        try:
            users = self.conn.get_users()
            return [
                {
                    "uid": u.uid,
                    "user_id": u.user_id,
                    "name": u.name,
                    "privilege": u.privilege,
                    "card": u.card,
                }
                for u in users
            ]
        except Exception as e:
            print(f"Failed to get users: {e}", file=sys.stderr)
            return []
    
    def get_attendance(self, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Get attendance logs from the device"""
        if not self.conn:
            return []
        
        try:
            # Disable device during read to prevent data corruption
            self.conn.disable_device()
            
            try:
                attendances = self.conn.get_attendance()
            finally:
                self.conn.enable_device()
            
            logs = []
            for a in attendances:
                # Filter by date if specified
                if since and a.timestamp < since:
                    continue
                
                logs.append({
                    "user_id": str(a.user_id),
                    "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                    "status": a.status,
                    "punch": a.punch,
                    "uid": a.uid,
                })
            
            return logs
        except Exception as e:
            print(f"Failed to get attendance: {e}", file=sys.stderr)
            return []
    
    def post_to_backend(self, employee_id: str, event: str, occurred_at: str) -> Dict[str, Any]:
        """Post an attendance event to the AttSystem backend"""
        url = f"{self.api_url}/api/devices/ingest"
        
        payload = {
            "device_id": self.device_id,
            "secret": self.device_secret,
            "employee_id": employee_id,
            "event": event,
            "occurred_at": occurred_at,
            "identifier": f"zk_{self.device_id}_{employee_id}_{occurred_at}",
            "payload": {
                "source": "zkteco",
                "device_ip": self.ip,
            }
        }
        
        try:
            response = requests.post(url, json=payload, timeout=30)
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def sync_attendance(self, mode: str = "last2days") -> Dict[str, Any]:
        """Sync attendance logs to the backend"""
        results = {
            "added": 0,
            "duplicates": 0,
            "errors": 0,
            "skipped_unknown_employee": 0,
            "unknown_employee_codes": [],
            "total_logs": 0,
        }
        
        # Determine date filter
        since = None
        if mode == "last2days":
            since = datetime.now() - timedelta(days=2)
        elif mode == "today":
            since = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        # mode == "all" means no filter
        
        # Get attendance logs
        logs = self.get_attendance(since=since)
        results["total_logs"] = len(logs)
        
        if not logs:
            return results
        
        unknown_codes = {}
        
        for log in logs:
            user_id = log.get("user_id", "")
            timestamp = log.get("timestamp")
            punch = log.get("punch", 0)
            
            if not user_id or not timestamp:
                results["errors"] += 1
                continue
            
            # Determine event type based on punch value
            # ZKTeco punch: 0=Check-In, 1=Check-Out, 2=Break-Out, 3=Break-In, 4=OT-In, 5=OT-Out
            if punch in [0, 3, 4]:  # Check-In, Break-In, OT-In
                event = "clockin"
            else:  # Check-Out, Break-Out, OT-Out
                event = "clockout"
            
            # Post to backend
            response = self.post_to_backend(user_id, event, timestamp)
            
            if "error" in response:
                error_msg = response.get("error", "")
                if "Unknown employee" in error_msg:
                    results["skipped_unknown_employee"] += 1
                    if user_id not in unknown_codes:
                        unknown_codes[user_id] = 0
                    unknown_codes[user_id] += 1
                else:
                    results["errors"] += 1
            elif "record" in response:
                results["added"] += 1
            else:
                # Likely a duplicate (INSERT IGNORE)
                results["duplicates"] += 1
        
        # Format unknown employee codes
        results["unknown_employee_codes"] = [
            {"code": code, "count": count}
            for code, count in sorted(unknown_codes.items(), key=lambda x: -x[1])
        ][:200]
        results["unknown_employee_codes_truncated"] = len(unknown_codes) > 200
        
        return results


def test_connection(args) -> Dict[str, Any]:
    """Test connection to ZKTeco device"""
    sync = ZKTecoSync(
        device_id=args.device_id,
        ip=args.ip,
        port=args.port,
        password=args.password,
        api_url=args.api_url,
        device_secret=args.secret,
    )
    
    if not sync.connect():
        return {"connected": False, "error": "Connection failed"}
    
    try:
        info = sync.get_device_info()
        users = sync.get_users()
        info["user_count"] = len(users)
        return info
    finally:
        sync.disconnect()


def sync_logs(args) -> Dict[str, Any]:
    """Sync attendance logs from ZKTeco device"""
    sync = ZKTecoSync(
        device_id=args.device_id,
        ip=args.ip,
        port=args.port,
        password=args.password,
        api_url=args.api_url,
        device_secret=args.secret,
    )
    
    if not sync.connect():
        return {"ok": False, "error": "Connection failed"}
    
    try:
        results = sync.sync_attendance(mode=args.mode)
        results["ok"] = True
        return results
    finally:
        sync.disconnect()


def main():
    parser = argparse.ArgumentParser(description="ZKTeco Device Sync for AttSystem")
    parser.add_argument("--device-id", default=os.getenv("ZK_DEVICE_ID", ""), help="AttSystem device ID")
    parser.add_argument("--ip", default=os.getenv("ZK_IP", ""), help="ZKTeco device IP address")
    parser.add_argument("--port", type=int, default=int(os.getenv("ZK_PORT", "4370")), help="ZKTeco device port")
    parser.add_argument("--password", type=int, default=int(os.getenv("ZK_PASSWORD", "0")), help="ZKTeco comm key")
    parser.add_argument("--api-url", default=os.getenv("API_URL", "http://localhost:8000"), help="AttSystem API URL")
    parser.add_argument("--secret", default=os.getenv("DEVICE_SECRET", ""), help="Device secret for authentication")
    parser.add_argument("--mode", choices=["last2days", "today", "all"], default="last2days", help="Sync mode")
    parser.add_argument("--action", choices=["test", "sync", "users"], default="sync", help="Action to perform")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    
    args = parser.parse_args()
    
    if not args.ip:
        print("Error: --ip is required", file=sys.stderr)
        sys.exit(1)
    
    if not args.device_id:
        print("Error: --device-id is required", file=sys.stderr)
        sys.exit(1)
    
    if args.action == "test":
        result = test_connection(args)
    elif args.action == "users":
        sync = ZKTecoSync(
            device_id=args.device_id,
            ip=args.ip,
            port=args.port,
            password=args.password,
            api_url=args.api_url,
            device_secret=args.secret,
        )
        if sync.connect():
            result = {"users": sync.get_users()}
            sync.disconnect()
        else:
            result = {"error": "Connection failed"}
    else:  # sync
        if not args.secret:
            print("Error: --secret is required for sync", file=sys.stderr)
            sys.exit(1)
        result = sync_logs(args)
    
    if args.json:
        print(json.dumps(result, indent=2, default=str))
    else:
        if "error" in result:
            print(f"Error: {result['error']}", file=sys.stderr)
            sys.exit(1)
        elif args.action == "test":
            print(f"Connected: {result.get('connected', False)}")
            print(f"Device: {result.get('device_name', 'Unknown')}")
            print(f"Serial: {result.get('serial_number', 'Unknown')}")
            print(f"Users: {result.get('user_count', 0)}")
        elif args.action == "users":
            for u in result.get("users", []):
                print(f"{u['user_id']}: {u['name']}")
        else:  # sync
            print(f"Sync complete:")
            print(f"  Added: {result.get('added', 0)}")
            print(f"  Duplicates: {result.get('duplicates', 0)}")
            print(f"  Unknown employees: {result.get('skipped_unknown_employee', 0)}")
            print(f"  Errors: {result.get('errors', 0)}")
    
    sys.exit(0)


if __name__ == "__main__":
    main()
