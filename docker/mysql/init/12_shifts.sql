CREATE TABLE IF NOT EXISTS shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  late_tolerance_minutes INT NOT NULL DEFAULT 0,
  early_exit_tolerance_minutes INT NOT NULL DEFAULT 0,
  break_duration_minutes INT NOT NULL DEFAULT 0,
  working_days VARCHAR(255) NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shifts_tenant (tenant_id),
  INDEX idx_shifts_tenant_default (tenant_id, is_default),
  CONSTRAINT fk_shifts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

SET @shifts_has_break := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'shifts'
    AND column_name = 'break_duration_minutes'
);
SET @sql := IF(@shifts_has_break = 0, 'ALTER TABLE shifts ADD COLUMN break_duration_minutes INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @shifts_has_days := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'shifts'
    AND column_name = 'working_days'
);
SET @sql := IF(@shifts_has_days = 0, 'ALTER TABLE shifts ADD COLUMN working_days VARCHAR(255) NOT NULL DEFAULT ''Mon,Tue,Wed,Thu,Fri''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @shifts_has_default := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'shifts'
    AND column_name = 'is_default'
);
SET @sql := IF(@shifts_has_default = 0, 'ALTER TABLE shifts ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_tenant_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'shifts'
    AND index_name = 'idx_shifts_tenant'
);
SET @sql := IF(@idx_tenant_exists = 0, 'CREATE INDEX idx_shifts_tenant ON shifts (tenant_id)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_tenant_default_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'shifts'
    AND index_name = 'idx_shifts_tenant_default'
);
SET @sql := IF(@idx_tenant_default_exists = 0, 'CREATE INDEX idx_shifts_tenant_default ON shifts (tenant_id, is_default)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_shifts_tenant_exists := (
  SELECT COUNT(*)
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'shifts'
    AND column_name = 'tenant_id'
    AND referenced_table_name = 'tenants'
);
SET @sql := IF(@fk_shifts_tenant_exists = 0, 'ALTER TABLE shifts ADD CONSTRAINT fk_shifts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @employees_has_shift := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'shift_id'
);
SET @sql := IF(@employees_has_shift = 0, 'ALTER TABLE employees ADD COLUMN shift_id INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_employee_shift_exists := (
  SELECT COUNT(*)
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'shift_id'
    AND referenced_table_name = 'shifts'
);
SET @sql := IF(@fk_employee_shift_exists = 0, 'ALTER TABLE employees ADD CONSTRAINT fk_employee_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
