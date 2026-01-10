-- Initial schema for Attendance SaaS
CREATE TABLE IF NOT EXISTS tenants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subdomain VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  late_tolerance_minutes INT DEFAULT 0,
  early_exit_tolerance_minutes INT DEFAULT 0,
  break_duration_minutes INT DEFAULT 0,
  working_days VARCHAR(255) DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  shift_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  code VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY u_employee_code_tenant (tenant_id, code),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  clock_in DATETIME NOT NULL,
  clock_out DATETIME NULL,
  duration_minutes INT NOT NULL DEFAULT 0,
  status VARCHAR(64) DEFAULT NULL,
  late_minutes INT NOT NULL DEFAULT 0,
  early_leave_minutes INT NOT NULL DEFAULT 0,
  overtime_minutes INT NOT NULL DEFAULT 0,
  date DATE NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

SET @has_shift_id := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'shift_id');
SET @sql := IF(@has_shift_id = 0, 'ALTER TABLE employees ADD COLUMN shift_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_status := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_records' AND COLUMN_NAME = 'status');
SET @sql := IF(@has_status = 0, 'ALTER TABLE attendance_records ADD COLUMN status VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_late := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_records' AND COLUMN_NAME = 'late_minutes');
SET @sql := IF(@has_late = 0, 'ALTER TABLE attendance_records ADD COLUMN late_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_early := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_records' AND COLUMN_NAME = 'early_leave_minutes');
SET @sql := IF(@has_early = 0, 'ALTER TABLE attendance_records ADD COLUMN early_leave_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ot := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_records' AND COLUMN_NAME = 'overtime_minutes');
SET @sql := IF(@has_ot = 0, 'ALTER TABLE attendance_records ADD COLUMN overtime_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Seed
INSERT INTO tenants (subdomain, name, status) VALUES
('demo', 'Demo Corp', 'active')
ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status);

INSERT INTO shifts (tenant_id, name, start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, break_duration_minutes, working_days, is_default)
SELECT t.id, 'Standard Shift', '09:00:00', '17:00:00', 15, 15, 0, 'Mon,Tue,Wed,Thu,Fri', 1
FROM tenants t
WHERE t.subdomain='demo'
  AND NOT EXISTS (SELECT 1 FROM shifts s WHERE s.tenant_id = t.id AND s.is_default = 1);

INSERT INTO employees (tenant_id, shift_id, name, code, status)
SELECT t.id, s.id, 'John Doe', 'JD01', 'active'
FROM tenants t
JOIN shifts s ON s.tenant_id = t.id AND s.is_default = 1
WHERE t.subdomain='demo'
ON DUPLICATE KEY UPDATE name='John Doe', status='active';

UPDATE employees e
JOIN shifts s ON s.tenant_id = e.tenant_id AND s.is_default = 1
SET e.shift_id = s.id
WHERE e.shift_id IS NULL;

SET @null_shift := (SELECT COUNT(*) FROM employees WHERE shift_id IS NULL);
SET @sql := IF(@null_shift = 0, 'ALTER TABLE employees MODIFY shift_id INT NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
