CREATE TABLE IF NOT EXISTS tenant_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  email VARCHAR(160) NOT NULL,
  name VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'tenant_owner',
  employee_id INT NULL,
  password_hash VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY u_email_tenant (tenant_id, email),
  INDEX idx_tenant_users_employee (tenant_id, employee_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

SET @has_employee_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'tenant_users'
    AND column_name = 'employee_id'
);
SET @sql := IF(@has_employee_id = 0, 'ALTER TABLE tenant_users ADD COLUMN employee_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Seed a demo tenant owner (password will be set by superadmin reset)
INSERT INTO tenant_users (tenant_id, email, name, role, status, password_hash)
SELECT t.id, 'owner@tenant.com', 'Demo Owner', 'tenant_owner', 'active', NULL
FROM tenants t WHERE t.subdomain='demo'
ON DUPLICATE KEY UPDATE name='Demo Owner';
