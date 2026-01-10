CREATE TABLE IF NOT EXISTS super_admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default Super Admin (password: secret)
INSERT INTO super_admins (email, name, password_hash) VALUES
('admin@attsys.com', 'Super Admin', '$2y$10$XrOsVnzqHI9uhy47t4Q4xeyuGvLg5KtJJ/Pu9zpyBnhkLeeAf/oIW')
ON DUPLICATE KEY UPDATE name='Super Admin';
