CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  permissions JSON NOT NULL
);

INSERT INTO roles (name, permissions) VALUES
('tenant_owner', JSON_ARRAY('tenants.manage','employees.read','employees.write','attendance.clock','attendance.read','audit.read','geo.manage','geo.read'))
ON DUPLICATE KEY UPDATE permissions=VALUES(permissions);

INSERT INTO roles (name, permissions) VALUES
('employee', JSON_ARRAY('attendance.clock','attendance.read','geo.track'))
ON DUPLICATE KEY UPDATE permissions=VALUES(permissions);

INSERT INTO roles (name, permissions) VALUES
('hr_admin', JSON_ARRAY('employees.read','employees.write','attendance.read','devices.manage','sites.manage','geo.manage','geo.read'))
ON DUPLICATE KEY UPDATE permissions=VALUES(permissions);

INSERT INTO roles (name, permissions) VALUES
('manager', JSON_ARRAY('employees.read','attendance.read','geo.read'))
ON DUPLICATE KEY UPDATE permissions=VALUES(permissions);
