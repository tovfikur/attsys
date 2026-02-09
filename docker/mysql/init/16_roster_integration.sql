-- Phase 2: Roster Integration with Attendance, Leaves, and Payroll
-- This migration adds the necessary fields to integrate roster duties with existing systems

-- Add roster tracking to attendance_days
ALTER TABLE attendance_days 
ADD COLUMN roster_assignment_id INT(11) DEFAULT NULL AFTER status,
ADD COLUMN is_roster_duty TINYINT(1) DEFAULT 0 AFTER roster_assignment_id,
ADD INDEX idx_roster_assignment (roster_assignment_id);

-- Add payroll fields to roster_types for duty allowances
ALTER TABLE roster_types
ADD COLUMN allowance_amount DECIMAL(10,2) DEFAULT 0.00 AFTER is_active,
ADD COLUMN hourly_rate_multiplier DECIMAL(4,2) DEFAULT 1.00 AFTER allowance_amount,
ADD COLUMN allowance_type ENUM('none', 'fixed', 'hourly') DEFAULT 'none' AFTER hourly_rate_multiplier;

-- Add index for faster roster assignment lookups during attendance processing
ALTER TABLE roster_assignments
ADD INDEX idx_employee_date_lookup (tenant_id, employee_id, duty_date, status);

-- Add notes about the integration
-- roster_assignment_id: Links attendance record to the roster duty (if applicable)
-- is_roster_duty: Quick flag to identify roster-based attendance
-- allowance_amount: Fixed amount to add to payroll (e.g., $50 for night duty)
-- hourly_rate_multiplier: Multiplier for hourly rate (e.g., 1.5 for overtime duty)
-- allowance_type: How to calculate the allowance (none/fixed/hourly)
