CREATE TABLE IF NOT EXISTS leaves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'approved',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_leaves_tenant_employee (tenant_id, employee_id),
  INDEX idx_leaves_tenant_date (tenant_id, date),
  CONSTRAINT fk_leaves_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_leaves_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
