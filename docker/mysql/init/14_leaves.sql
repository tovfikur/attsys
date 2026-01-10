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
  UNIQUE KEY uniq_leaves_tenant_employee_date (tenant_id, employee_id, date),
  CONSTRAINT fk_leaves_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_leaves_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

SET @leaves_has_type := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'leaves'
    AND column_name = 'leave_type'
);
SET @sql := IF(@leaves_has_type = 0, 'ALTER TABLE leaves ADD COLUMN leave_type VARCHAR(16) NOT NULL DEFAULT ''casual''', 'SELECT 1');
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
SET @sql := IF(@leaves_has_day_part = 0, 'ALTER TABLE leaves ADD COLUMN day_part VARCHAR(8) NOT NULL DEFAULT ''full''', 'SELECT 1');
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
SET @sql := IF(@uniq_leaves_exists = 0, 'ALTER TABLE leaves ADD UNIQUE KEY uniq_leaves_tenant_employee_date (tenant_id, employee_id, date)', 'SELECT 1');
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
  CONSTRAINT fk_holidays_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
