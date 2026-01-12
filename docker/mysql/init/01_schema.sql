-- Initial schema for Attendance SaaS
CREATE TABLE IF NOT EXISTS tenants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subdomain VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  note TEXT NULL,
  logo_path VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SET @tenants_has_note := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'tenants'
    AND column_name = 'note'
);
SET @sql := IF(@tenants_has_note = 0, 'ALTER TABLE tenants ADD COLUMN note TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tenants_has_logo_path := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'tenants'
    AND column_name = 'logo_path'
);
SET @sql := IF(@tenants_has_logo_path = 0, 'ALTER TABLE tenants ADD COLUMN logo_path VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
  profile_photo_path VARCHAR(255) NULL,
  gender VARCHAR(16) NULL,
  date_of_birth DATE NULL,
  personal_phone VARCHAR(32) NULL,
  email VARCHAR(160) NULL,
  present_address TEXT NULL,
  permanent_address TEXT NULL,
  department VARCHAR(128) NULL,
  designation VARCHAR(128) NULL,
  employee_type VARCHAR(32) NULL,
  date_of_joining DATE NULL,
  supervisor_name VARCHAR(128) NULL,
  work_location VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY u_employee_code_tenant (tenant_id, code),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS employee_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  category VARCHAR(32) NOT NULL,
  title VARCHAR(128) NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_path VARCHAR(255) NOT NULL,
  mime VARCHAR(96) NOT NULL,
  size_bytes INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_employee_attachments_tenant_employee (tenant_id, employee_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
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

SET @has_profile_photo_path := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'profile_photo_path');
SET @sql := IF(@has_profile_photo_path = 0, 'ALTER TABLE employees ADD COLUMN profile_photo_path VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_gender := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'gender');
SET @sql := IF(@has_gender = 0, 'ALTER TABLE employees ADD COLUMN gender VARCHAR(16) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_dob := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'date_of_birth');
SET @sql := IF(@has_dob = 0, 'ALTER TABLE employees ADD COLUMN date_of_birth DATE NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_personal_phone := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'personal_phone');
SET @sql := IF(@has_personal_phone = 0, 'ALTER TABLE employees ADD COLUMN personal_phone VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_email := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'email');
SET @sql := IF(@has_email = 0, 'ALTER TABLE employees ADD COLUMN email VARCHAR(160) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_present_address := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'present_address');
SET @sql := IF(@has_present_address = 0, 'ALTER TABLE employees ADD COLUMN present_address TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_permanent_address := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'permanent_address');
SET @sql := IF(@has_permanent_address = 0, 'ALTER TABLE employees ADD COLUMN permanent_address TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_department := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'department');
SET @sql := IF(@has_department = 0, 'ALTER TABLE employees ADD COLUMN department VARCHAR(128) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_designation := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'designation');
SET @sql := IF(@has_designation = 0, 'ALTER TABLE employees ADD COLUMN designation VARCHAR(128) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_employee_type := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'employee_type');
SET @sql := IF(@has_employee_type = 0, 'ALTER TABLE employees ADD COLUMN employee_type VARCHAR(32) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_date_of_joining := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'date_of_joining');
SET @sql := IF(@has_date_of_joining = 0, 'ALTER TABLE employees ADD COLUMN date_of_joining DATE NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_supervisor_name := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'supervisor_name');
SET @sql := IF(@has_supervisor_name = 0, 'ALTER TABLE employees ADD COLUMN supervisor_name VARCHAR(128) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_work_location := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'work_location');
SET @sql := IF(@has_work_location = 0, 'ALTER TABLE employees ADD COLUMN work_location VARCHAR(128) NULL', 'SELECT 1');
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
