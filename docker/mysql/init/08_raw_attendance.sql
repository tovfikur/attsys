CREATE TABLE IF NOT EXISTS raw_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  employee_id INT NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  occurred_at_utc DATETIME NOT NULL,
  raw_payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_raw (tenant_id, device_id, employee_id, event_type, occurred_at_utc)
);

CREATE TABLE IF NOT EXISTS attendance_days (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  in_time DATETIME NULL,
  out_time DATETIME NULL,
  worked_minutes INT NOT NULL DEFAULT 0,
  late_minutes INT NOT NULL DEFAULT 0,
  early_leave_minutes INT NOT NULL DEFAULT 0,
  overtime_minutes INT NOT NULL DEFAULT 0,
  status VARCHAR(64) NOT NULL DEFAULT 'Present',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_day (tenant_id, employee_id, date)
);

SET @has_late := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_days' AND COLUMN_NAME = 'late_minutes');
SET @sql := IF(@has_late = 0, 'ALTER TABLE attendance_days ADD COLUMN late_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_early := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_days' AND COLUMN_NAME = 'early_leave_minutes');
SET @sql := IF(@has_early = 0, 'ALTER TABLE attendance_days ADD COLUMN early_leave_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ot := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_days' AND COLUMN_NAME = 'overtime_minutes');
SET @sql := IF(@has_ot = 0, 'ALTER TABLE attendance_days ADD COLUMN overtime_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @status_type := (SELECT LOWER(COLUMN_TYPE) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_days' AND COLUMN_NAME = 'status' LIMIT 1);
SET @sql := IF(@status_type = 'varchar(32)', 'ALTER TABLE attendance_days MODIFY status VARCHAR(64) NOT NULL DEFAULT ''Present''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
