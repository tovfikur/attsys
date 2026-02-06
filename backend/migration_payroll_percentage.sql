-- Add percentage support to salary items
ALTER TABLE employee_salary_items ADD COLUMN is_percentage BOOLEAN DEFAULT FALSE;
ALTER TABLE employee_salary_items ADD COLUMN percentage DECIMAL(5,2) DEFAULT 0.00;
