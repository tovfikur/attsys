-- Create shifts table
CREATE TABLE IF NOT EXISTS shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(128) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    late_tolerance_minutes INT DEFAULT 0,
    early_exit_tolerance_minutes INT DEFAULT 0,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Add columns to attendance_records if they don't exist
-- Note: These run unconditionally and might fail if columns exist, 
-- but in a raw SQL file intended for migration, we usually handle this via tool or just ignore specific errors.
-- For safety, you can run these manually if needed.

-- ALTER TABLE attendance_records ADD COLUMN status VARCHAR(64) DEFAULT NULL;
-- ALTER TABLE attendance_records ADD COLUMN late_minutes INT DEFAULT 0;
-- ALTER TABLE attendance_records ADD COLUMN early_leave_minutes INT DEFAULT 0;
