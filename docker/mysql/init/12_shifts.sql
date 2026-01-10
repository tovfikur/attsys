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

INSERT INTO shifts (tenant_id, name, start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, break_duration_minutes, working_days, is_default)
SELECT t.id, 'Standard Shift', '09:00:00', '17:00:00', 15, 15, 0, 'Mon,Tue,Wed,Thu,Fri', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM shifts s WHERE s.tenant_id = t.id AND s.is_default = 1
);

UPDATE employees e
JOIN shifts s ON s.tenant_id = e.tenant_id AND s.is_default = 1
SET e.shift_id = s.id
WHERE e.shift_id IS NULL;

SET @null_shift := (SELECT COUNT(*) FROM employees WHERE shift_id IS NULL);
SET @sql := IF(@null_shift = 0, 'ALTER TABLE employees MODIFY shift_id INT NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_name := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'shift_id'
    AND referenced_table_name = 'shifts'
  LIMIT 1
);
SET @sql := IF(@fk_name IS NOT NULL, CONCAT('ALTER TABLE employees DROP FOREIGN KEY `', REPLACE(@fk_name, '`', ''), '`'), 'SELECT 1');
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
SET @sql := IF(@fk_employee_shift_exists = 0, 'ALTER TABLE employees ADD CONSTRAINT fk_employee_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
