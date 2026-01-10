from odoo import models, fields, api

class HikAttendanceLog(models.Model):
    _name = "hik.attendance.log"
    _description = "Hik-Connect Attendance Log"
    _order = "record_time desc"
    _rec_name = "person_code"

    person_code = fields.Char(string="Person Code", index=True)
    record_time = fields.Datetime(string="Record Time", required=True)
    device_id = fields.Many2one("hik.device", string="Device")
    first_name = fields.Char(string="First Name")
    last_name = fields.Char(string="Last Name")







