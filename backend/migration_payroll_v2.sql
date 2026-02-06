
-- Tax Slabs
CREATE TABLE IF NOT EXISTS tax_slabs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(50),
    min_salary DECIMAL(15, 2) NOT NULL,
    max_salary DECIMAL(15, 2) NULL, -- NULL for "and above"
    tax_percent DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure Payroll Settings table exists (redundant if previous migration ran, but safe)
CREATE TABLE IF NOT EXISTS payroll_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    setting_key VARCHAR(50) NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_setting (tenant_id, setting_key)
);
