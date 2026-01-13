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

CREATE TABLE IF NOT EXISTS leave_allocations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  leave_type VARCHAR(16) NOT NULL,
  year INT NOT NULL,
  allocated_days DECIMAL(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_leave_allocations (tenant_id, employee_id, leave_type, year),
  KEY idx_leave_allocations_tenant_employee_year (tenant_id, employee_id, year),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tenant_leave_settings (
  tenant_id INT NOT NULL,
  auto_approve TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS leave_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  code VARCHAR(16) NOT NULL,
  name VARCHAR(64) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT 1,
  requires_document BOOLEAN NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_leave_types_tenant_code (tenant_id, code),
  INDEX idx_leave_types_tenant_active (tenant_id, active, sort_order),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS messenger_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  kind VARCHAR(16) NOT NULL,
  conversation_key VARCHAR(64) NOT NULL,
  direct_employee_a INT NULL,
  direct_employee_b INT NULL,
  direct_user_id INT NULL,
  direct_employee_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_messenger_conversations_key (tenant_id, conversation_key),
  INDEX idx_messenger_conversations_tenant_kind (tenant_id, kind),
  INDEX idx_messenger_conversations_direct_a (tenant_id, direct_employee_a),
  INDEX idx_messenger_conversations_direct_b (tenant_id, direct_employee_b),
  INDEX idx_messenger_conversations_direct_user (tenant_id, direct_user_id),
  INDEX idx_messenger_conversations_direct_employee (tenant_id, direct_employee_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET @mc_has_direct_user_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'messenger_conversations'
    AND column_name = 'direct_user_id'
);
SET @sql := IF(@mc_has_direct_user_id = 0, 'ALTER TABLE messenger_conversations ADD COLUMN direct_user_id INT NULL AFTER direct_employee_b', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @mc_has_direct_employee_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'messenger_conversations'
    AND column_name = 'direct_employee_id'
);
SET @sql := IF(@mc_has_direct_employee_id = 0, 'ALTER TABLE messenger_conversations ADD COLUMN direct_employee_id INT NULL AFTER direct_user_id', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @mc_idx_direct_user_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'messenger_conversations'
    AND index_name = 'idx_messenger_conversations_direct_user'
);
SET @sql := IF(@mc_idx_direct_user_exists = 0, 'ALTER TABLE messenger_conversations ADD INDEX idx_messenger_conversations_direct_user (tenant_id, direct_user_id)', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @mc_idx_direct_employee_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'messenger_conversations'
    AND index_name = 'idx_messenger_conversations_direct_employee'
);
SET @sql := IF(@mc_idx_direct_employee_exists = 0, 'ALTER TABLE messenger_conversations ADD INDEX idx_messenger_conversations_direct_employee (tenant_id, direct_employee_id)', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS messenger_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  conversation_id INT NOT NULL,
  sender_user_id INT NULL,
  sender_employee_id INT NULL,
  sender_role VARCHAR(32) NOT NULL,
  sender_name VARCHAR(128) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messenger_messages_tenant_conv_id (tenant_id, conversation_id, id),
  INDEX idx_messenger_messages_conv_created (conversation_id, created_at),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES messenger_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;
