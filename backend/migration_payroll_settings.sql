
CREATE TABLE IF NOT EXISTS payroll_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    setting_key VARCHAR(50) NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_setting (tenant_id, setting_key)
);

-- Seed default settings if not exist (This part is tricky in SQL only without procedure, so I'll handle seeding in PHP)
