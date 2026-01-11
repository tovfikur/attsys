SET @has_status := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'status'
);
SET @sql := IF(@has_status = 0, 'ALTER TABLE attendance_records ADD COLUMN status VARCHAR(64) NOT NULL DEFAULT ''Present''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_late := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'late_minutes'
);
SET @sql := IF(@has_late = 0, 'ALTER TABLE attendance_records ADD COLUMN late_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_early := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'early_leave_minutes'
);
SET @sql := IF(@has_early = 0, 'ALTER TABLE attendance_records ADD COLUMN early_leave_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ot := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'overtime_minutes'
);
SET @sql := IF(@has_ot = 0, 'ALTER TABLE attendance_records ADD COLUMN overtime_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_emp_date := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND index_name = 'idx_attendance_employee_date'
);
SET @sql := IF(@idx_emp_date = 0, 'CREATE INDEX idx_attendance_employee_date ON attendance_records (employee_id, date)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_open := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND index_name = 'idx_attendance_open_shift'
);
SET @sql := IF(@idx_open = 0, 'CREATE INDEX idx_attendance_open_shift ON attendance_records (employee_id, clock_out)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_in_method := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_in_method'
);
SET @sql := IF(@ar_has_clock_in_method = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_method VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_out_method := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_out_method'
);
SET @sql := IF(@ar_has_clock_out_method = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_method VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_in_lat := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_in_lat'
);
SET @sql := IF(@ar_has_clock_in_lat = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_lat DOUBLE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_in_lng := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_in_lng'
);
SET @sql := IF(@ar_has_clock_in_lng = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_lng DOUBLE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_in_accuracy_m := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_in_accuracy_m'
);
SET @sql := IF(@ar_has_clock_in_accuracy_m = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_accuracy_m INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_out_lat := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_out_lat'
);
SET @sql := IF(@ar_has_clock_out_lat = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_lat DOUBLE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_out_lng := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_out_lng'
);
SET @sql := IF(@ar_has_clock_out_lng = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_lng DOUBLE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_out_accuracy_m := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_out_accuracy_m'
);
SET @sql := IF(@ar_has_clock_out_accuracy_m = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_accuracy_m INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_in_device_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_in_device_id'
);
SET @sql := IF(@ar_has_clock_in_device_id = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_device_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ar_has_clock_out_device_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_out_device_id'
);
SET @sql := IF(@ar_has_clock_out_device_id = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_device_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS biometric_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  modality VARCHAR(24) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  mime VARCHAR(96) NOT NULL,
  image LONGBLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY u_biometric_template (tenant_id, employee_id, modality),
  KEY idx_biometric_template_employee (employee_id),
  KEY idx_biometric_template_tenant_employee (tenant_id, employee_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS biometric_evidence (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  attendance_record_id INT NULL,
  event_type VARCHAR(16) NOT NULL,
  modality VARCHAR(24) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  matched TINYINT(1) NOT NULL DEFAULT 0,
  mime VARCHAR(96) NOT NULL,
  image LONGBLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_biometric_evidence_tenant_employee (tenant_id, employee_id, created_at),
  KEY idx_biometric_evidence_attendance_record (attendance_record_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (attendance_record_id) REFERENCES attendance_records(id) ON DELETE SET NULL
);

SET @be_has_latitude := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'biometric_evidence'
    AND column_name = 'latitude'
);
SET @sql := IF(@be_has_latitude = 0, 'ALTER TABLE biometric_evidence ADD COLUMN latitude DOUBLE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @be_has_longitude := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'biometric_evidence'
    AND column_name = 'longitude'
);
SET @sql := IF(@be_has_longitude = 0, 'ALTER TABLE biometric_evidence ADD COLUMN longitude DOUBLE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @be_has_accuracy_m := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'biometric_evidence'
    AND column_name = 'accuracy_m'
);
SET @sql := IF(@be_has_accuracy_m = 0, 'ALTER TABLE biometric_evidence ADD COLUMN accuracy_m INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
