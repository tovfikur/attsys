CREATE TABLE IF NOT EXISTS auth_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(255) NOT NULL UNIQUE,
  user_id INT NULL,
  tenant_id INT NULL,
  employee_id INT NULL,
  role VARCHAR(64) NOT NULL,
  user_name VARCHAR(128) NULL,
  user_email VARCHAR(160) NULL,
  expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

SET @auth_tokens_has_employee_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'auth_tokens'
    AND column_name = 'employee_id'
);
SET @sql := IF(@auth_tokens_has_employee_id = 0, 'ALTER TABLE auth_tokens ADD COLUMN employee_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
