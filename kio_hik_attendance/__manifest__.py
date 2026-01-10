{
    "name": "Hik-Connect Attendance Integration",
    "version": "18.0.1.0.0",
    "summary": "Fetch attendance logs from Hik-Connect Cloud API",
    "author": "Kendroo Limited",
    "category": "Human Resources",
    "depends": ["base", "hr", "hr_attendance"],
    "data": [
        "security/security_groups.xml",
        "security/ir.model.access.csv",
        "views/menu_views.xml",
        "views/device_views.xml",
        "views/attendance_views.xml",
        "data/cron_download.xml",
    ],
    "installable": True,
    "application": True
}
