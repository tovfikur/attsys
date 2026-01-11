-- Create shifts table
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
) ENGINE=InnoDB;

-- Add columns to attendance_records if they don't exist
-- Note: These run unconditionally and might fail if columns exist, 
-- but in a raw SQL file intended for migration, we usually handle this via tool or just ignore specific errors.
-- For safety, you can run these manually if needed.

-- ALTER TABLE attendance_records ADD COLUMN status VARCHAR(64) DEFAULT NULL;
-- ALTER TABLE attendance_records ADD COLUMN late_minutes INT DEFAULT 0;
-- ALTER TABLE attendance_records ADD COLUMN early_leave_minutes INT DEFAULT 0;

SET @ar_has_clock_in_method := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance_records'
    AND column_name = 'clock_in_method'
);
SET @sql := IF(@ar_has_clock_in_method = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_method VARCHAR(32) DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@ar_has_clock_out_method = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_method VARCHAR(32) DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@ar_has_clock_in_lat = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_lat DOUBLE DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@ar_has_clock_in_lng = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_lng DOUBLE DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@ar_has_clock_in_accuracy_m = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_accuracy_m INT DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@ar_has_clock_out_lat = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_lat DOUBLE DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@ar_has_clock_out_lng = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_lng DOUBLE DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@ar_has_clock_out_accuracy_m = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_accuracy_m INT DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@ar_has_clock_in_device_id = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_in_device_id VARCHAR(64) DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@ar_has_clock_out_device_id = 0, 'ALTER TABLE attendance_records ADD COLUMN clock_out_device_id VARCHAR(64) DEFAULT NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    employee_id INT NOT NULL,
    date DATE NOT NULL,
    leave_type VARCHAR(16) NOT NULL DEFAULT 'casual',
    day_part VARCHAR(8) NOT NULL DEFAULT 'full',
    reason VARCHAR(255) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'approved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_leaves_tenant_employee (tenant_id, employee_id),
    INDEX idx_leaves_tenant_date (tenant_id, date),
    UNIQUE KEY uniq_leaves_tenant_employee_date (tenant_id, employee_id, date)
) ENGINE=InnoDB;

SET @leaves_has_type := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'leaves'
    AND column_name = 'leave_type'
);
SET @sql := IF(@leaves_has_type = 0, 'ALTER TABLE leaves ADD COLUMN leave_type VARCHAR(16) NOT NULL DEFAULT ''casual''', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @leaves_has_day_part := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'leaves'
    AND column_name = 'day_part'
);
SET @sql := IF(@leaves_has_day_part = 0, 'ALTER TABLE leaves ADD COLUMN day_part VARCHAR(8) NOT NULL DEFAULT ''full''', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @uniq_leaves_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'leaves'
    AND index_name = 'uniq_leaves_tenant_employee_date'
);
SET @sql := IF(@uniq_leaves_exists = 0, 'ALTER TABLE leaves ADD UNIQUE KEY uniq_leaves_tenant_employee_date (tenant_id, employee_id, date)', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  date DATE NOT NULL,
  name VARCHAR(128) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_holidays_tenant_date (tenant_id, date),
  INDEX idx_holidays_tenant_date (tenant_id, date),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS biometric_evidence (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  attendance_record_id INT NULL,
  event_type VARCHAR(16) NOT NULL,
  modality VARCHAR(24) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  matched TINYINT(1) NOT NULL DEFAULT 0,
  latitude DOUBLE DEFAULT NULL,
  longitude DOUBLE DEFAULT NULL,
  accuracy_m INT DEFAULT NULL,
  mime VARCHAR(96) NOT NULL,
  image LONGBLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_biometric_evidence_tenant_employee (tenant_id, employee_id, created_at),
  KEY idx_biometric_evidence_attendance_record (attendance_record_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (attendance_record_id) REFERENCES attendance_records(id) ON DELETE SET NULL
) ENGINE=InnoDB;

SET @be_has_latitude := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'biometric_evidence'
    AND column_name = 'latitude'
);
SET @sql := IF(@be_has_latitude = 0, 'ALTER TABLE biometric_evidence ADD COLUMN latitude DOUBLE DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@be_has_longitude = 0, 'ALTER TABLE biometric_evidence ADD COLUMN longitude DOUBLE DEFAULT NULL', 'DO 1');
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
SET @sql := IF(@be_has_accuracy_m = 0, 'ALTER TABLE biometric_evidence ADD COLUMN accuracy_m INT DEFAULT NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
