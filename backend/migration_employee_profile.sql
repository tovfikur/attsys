SET @emp_has_profile_photo_path := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'profile_photo_path'
);
SET @sql := IF(@emp_has_profile_photo_path = 0, 'ALTER TABLE employees ADD COLUMN profile_photo_path VARCHAR(255) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_gender := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'gender'
);
SET @sql := IF(@emp_has_gender = 0, 'ALTER TABLE employees ADD COLUMN gender VARCHAR(16) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_date_of_birth := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'date_of_birth'
);
SET @sql := IF(@emp_has_date_of_birth = 0, 'ALTER TABLE employees ADD COLUMN date_of_birth DATE NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_personal_phone := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'personal_phone'
);
SET @sql := IF(@emp_has_personal_phone = 0, 'ALTER TABLE employees ADD COLUMN personal_phone VARCHAR(32) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_email := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'email'
);
SET @sql := IF(@emp_has_email = 0, 'ALTER TABLE employees ADD COLUMN email VARCHAR(255) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_present_address := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'present_address'
);
SET @sql := IF(@emp_has_present_address = 0, 'ALTER TABLE employees ADD COLUMN present_address VARCHAR(255) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_permanent_address := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'permanent_address'
);
SET @sql := IF(@emp_has_permanent_address = 0, 'ALTER TABLE employees ADD COLUMN permanent_address VARCHAR(255) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_department := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'department'
);
SET @sql := IF(@emp_has_department = 0, 'ALTER TABLE employees ADD COLUMN department VARCHAR(128) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_designation := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'designation'
);
SET @sql := IF(@emp_has_designation = 0, 'ALTER TABLE employees ADD COLUMN designation VARCHAR(128) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_employee_type := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'employee_type'
);
SET @sql := IF(@emp_has_employee_type = 0, 'ALTER TABLE employees ADD COLUMN employee_type VARCHAR(32) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_date_of_joining := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'date_of_joining'
);
SET @sql := IF(@emp_has_date_of_joining = 0, 'ALTER TABLE employees ADD COLUMN date_of_joining DATE NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_supervisor_name := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'supervisor_name'
);
SET @sql := IF(@emp_has_supervisor_name = 0, 'ALTER TABLE employees ADD COLUMN supervisor_name VARCHAR(128) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @emp_has_work_location := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'work_location'
);
SET @sql := IF(@emp_has_work_location = 0, 'ALTER TABLE employees ADD COLUMN work_location VARCHAR(128) NULL', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
) ENGINE=InnoDB;

SET @ea_has_title := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employee_attachments'
    AND column_name = 'title'
);
SET @sql := IF(@ea_has_title = 0, 'ALTER TABLE employee_attachments ADD COLUMN title VARCHAR(128) NULL AFTER category', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ea_has_mime := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employee_attachments'
    AND column_name = 'mime'
);
SET @sql := IF(@ea_has_mime = 0, 'ALTER TABLE employee_attachments ADD COLUMN mime VARCHAR(96) NOT NULL AFTER stored_path', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ea_has_size_bytes := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employee_attachments'
    AND column_name = 'size_bytes'
);
SET @sql := IF(@ea_has_size_bytes = 0, 'ALTER TABLE employee_attachments ADD COLUMN size_bytes INT NOT NULL AFTER mime', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ea_has_created_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employee_attachments'
    AND column_name = 'created_at'
);
SET @sql := IF(@ea_has_created_at = 0, 'ALTER TABLE employee_attachments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ea_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'employee_attachments'
    AND index_name = 'idx_employee_attachments_tenant_employee'
);
SET @sql := IF(@ea_idx_exists = 0, 'ALTER TABLE employee_attachments ADD INDEX idx_employee_attachments_tenant_employee (tenant_id, employee_id)', 'DO 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
