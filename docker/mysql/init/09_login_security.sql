CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NULL,
  email VARCHAR(128) NOT NULL,
  ip VARCHAR(64) NULL,
  fail_count INT NOT NULL DEFAULT 0,
  first_failed_at DATETIME NULL,
  last_failed_at DATETIME NULL,
  banned_until DATETIME NULL,
  UNIQUE KEY uniq_attempt (tenant_id, email)
);

