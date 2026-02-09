-- UI Fixes: Add salary_period field to employee_salary_structures
-- This allows users to specify if salary is Monthly or Yearly

ALTER TABLE employee_salary_structures 
ADD COLUMN salary_period ENUM('monthly', 'yearly') DEFAULT 'monthly' 
AFTER base_salary;

-- Update existing records to have default value
UPDATE employee_salary_structures 
SET salary_period = 'monthly' 
WHERE salary_period IS NULL;
