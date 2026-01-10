CREATE TABLE IF NOT EXISTS sites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  code VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  site_id INT NOT NULL,
  device_id VARCHAR(64) NOT NULL UNIQUE,
  secret VARCHAR(64) NOT NULL,
  type VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  hik_device_name VARCHAR(128) NULL,
  hik_app_key VARCHAR(255) NULL,
  hik_secret_key VARCHAR(255) NULL,
  hik_api_url VARCHAR(255) NULL,
  hik_token TEXT NULL,
  hik_area_domain VARCHAR(255) NULL,
  hik_token_expire_time DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_device_sync_ids (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  device_employee_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_emp_device (tenant_id, employee_id, device_id),
  UNIQUE KEY uniq_device_empid (tenant_id, device_id, device_employee_id)
);
