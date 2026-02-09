-- Roster Duty Management Tables

-- Table for roster duty types (e.g., Security Duty, Cleaning, IT Support)
CREATE TABLE IF NOT EXISTS roster_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  color_code VARCHAR(7) DEFAULT '#1976d2',
  default_start_time TIME NULL,
  default_end_time TIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_roster_types_tenant (tenant_id),
  INDEX idx_roster_types_tenant_active (tenant_id, is_active),
  CONSTRAINT fk_roster_types_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Table for roster duty assignments
CREATE TABLE IF NOT EXISTS roster_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  roster_type_id INT NOT NULL,
  employee_id INT NOT NULL,
  duty_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  location VARCHAR(255) NULL,
  notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_roster_assignments_tenant (tenant_id),
  INDEX idx_roster_assignments_employee (employee_id),
  INDEX idx_roster_assignments_date (tenant_id, duty_date),
  INDEX idx_roster_assignments_employee_date (employee_id, duty_date),
  UNIQUE KEY uniq_roster_assignment (tenant_id, employee_id, duty_date, roster_type_id),
  CONSTRAINT fk_roster_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_roster_assignments_roster_type FOREIGN KEY (roster_type_id) REFERENCES roster_types(id) ON DELETE CASCADE,
  CONSTRAINT fk_roster_assignments_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Insert default roster types for existing tenants
INSERT INTO roster_types (tenant_id, name, description, color_code, default_start_time, default_end_time, is_active)
SELECT t.id, 'Security Duty', 'Security and surveillance duty', '#f44336', '18:00:00', '06:00:00', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM roster_types rt WHERE rt.tenant_id = t.id AND rt.name = 'Security Duty'
);

INSERT INTO roster_types (tenant_id, name, description, color_code, default_start_time, default_end_time, is_active)
SELECT t.id, 'Weekend Shift', 'Weekend duty shift', '#ff9800', '09:00:00', '17:00:00', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM roster_types rt WHERE rt.tenant_id = t.id AND rt.name = 'Weekend Shift'
);

INSERT INTO roster_types (tenant_id, name, description, color_code, default_start_time, default_end_time, is_active)
SELECT t.id, 'On-Call Duty', 'On-call support duty', '#9c27b0', NULL, NULL, 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM roster_types rt WHERE rt.tenant_id = t.id AND rt.name = 'On-Call Duty'
);
