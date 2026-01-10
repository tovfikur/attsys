CREATE TABLE IF NOT EXISTS tenant_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  email VARCHAR(160) NOT NULL,
  name VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'tenant_owner',
  password_hash VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY u_email_tenant (tenant_id, email),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Seed a demo tenant owner (password will be set by superadmin reset)
INSERT INTO tenant_users (tenant_id, email, name, role, status, password_hash)
SELECT t.id, 'owner@tenant.com', 'Demo Owner', 'tenant_owner', 'active', NULL
FROM tenants t WHERE t.subdomain='demo'
ON DUPLICATE KEY UPDATE name='Demo Owner';

