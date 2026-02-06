-- Payroll Module Schema

-- 1. Payroll Settings (Tenant Level)
CREATE TABLE IF NOT EXISTS payroll_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    setting_key VARCHAR(50) NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_setting (tenant_id, setting_key)
);

-- 2. Salary Components (Master Definitions)
CREATE TABLE IF NOT EXISTS salary_components (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- earning, deduction
    is_taxable BOOLEAN DEFAULT TRUE,
    is_recurring BOOLEAN DEFAULT TRUE, -- true for monthly allowances, false for one-time bonus
    gl_code VARCHAR(50) NULL, -- General Ledger Code for Accounting
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 3. Employee Bank Accounts
CREATE TABLE IF NOT EXISTS employee_bank_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    employee_id INT NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    account_number TEXT NOT NULL,
    branch_code TEXT NULL,
    account_holder_name VARCHAR(100) NOT NULL,
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- 4. Employee Salary Structure (Header)
CREATE TABLE IF NOT EXISTS employee_salary_structures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    employee_id INT NOT NULL,
    effective_from DATE NOT NULL,
    base_salary DECIMAL(15,2) NOT NULL DEFAULT 0.00, -- Often just "Basic"
    payment_method VARCHAR(20) DEFAULT 'bank_transfer', -- bank_transfer, cash, cheque
    status VARCHAR(20) DEFAULT 'active', -- active, inactive
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- 5. Employee Salary Items (Allowances/Fixed Deductions linked to Structure)
CREATE TABLE IF NOT EXISTS employee_salary_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    salary_structure_id INT NOT NULL,
    component_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    is_percentage BOOLEAN DEFAULT FALSE,
    percentage DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (salary_structure_id) REFERENCES employee_salary_structures(id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES salary_components(id) ON DELETE CASCADE
);

-- 6. Payroll Cycles
CREATE TABLE IF NOT EXISTS payroll_cycles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(100) NOT NULL, -- e.g., "January 2026"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'draft', -- draft, processing, approved, locked, paid
    processed_at TIMESTAMP NULL,
    approved_by INT NULL, -- user_id
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 7. Payslips
CREATE TABLE IF NOT EXISTS payslips (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    payroll_cycle_id INT NOT NULL,
    employee_id INT NOT NULL,
    salary_structure_id INT NULL, -- Snapshot of which structure was used
    
    -- Attendance Summary Snapshot
    total_days INT DEFAULT 0,
    working_days INT DEFAULT 0,
    present_days DECIMAL(5,2) DEFAULT 0,
    paid_leave_days DECIMAL(5,2) DEFAULT 0,
    unpaid_leave_days DECIMAL(5,2) DEFAULT 0,
    absent_days DECIMAL(5,2) DEFAULT 0,
    weekly_off_days INT DEFAULT 0,
    payable_days DECIMAL(5,2) DEFAULT 0,
    holidays INT DEFAULT 0,
    late_minutes INT DEFAULT 0,
    overtime_hours DECIMAL(6,2) DEFAULT 0,
    
    -- Financials
    gross_salary DECIMAL(15,2) DEFAULT 0,
    total_deductions DECIMAL(15,2) DEFAULT 0,
    net_salary DECIMAL(15,2) DEFAULT 0,
    tax_deducted DECIMAL(15,2) DEFAULT 0,
    
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, paid
    payment_date DATE NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_cycle_id) REFERENCES payroll_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- 8. Payslip Items (Breakdown)
CREATE TABLE IF NOT EXISTS payslip_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    payslip_id INT NOT NULL,
    name VARCHAR(100) NOT NULL, -- "Basic", "House Rent", "Tax", "PF"
    type VARCHAR(20) NOT NULL, -- earning, deduction
    amount DECIMAL(15,2) NOT NULL,
    is_variable BOOLEAN DEFAULT FALSE, -- True if calculated (like OT), False if fixed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (payslip_id) REFERENCES payslips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payslip_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    payslip_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    payment_date DATE NOT NULL,
    method VARCHAR(30) DEFAULT 'bank_transfer',
    reference VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (payslip_id) REFERENCES payslips(id) ON DELETE CASCADE
);

-- 9. Payroll Bonuses (One-time or scheduled bonuses)
CREATE TABLE IF NOT EXISTS payroll_bonuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    employee_id INT NOT NULL,
    payroll_cycle_id INT NOT NULL,
    kind VARCHAR(20) NOT NULL DEFAULT 'bonus',
    direction VARCHAR(20) NOT NULL DEFAULT 'earning',
    title VARCHAR(120) NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    taxable BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, applied, cancelled
    applied_payslip_id INT NULL,
    applied_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_cycle_id) REFERENCES payroll_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (applied_payslip_id) REFERENCES payslips(id) ON DELETE SET NULL
);

-- 10. Loans & Advances
CREATE TABLE IF NOT EXISTS loans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    employee_id INT NOT NULL,
    type VARCHAR(20) DEFAULT 'loan', -- loan, advance
    amount DECIMAL(15,2) NOT NULL,
    interest_rate DECIMAL(5,2) DEFAULT 0.00,
    total_repayment_amount DECIMAL(15,2) NOT NULL,
    monthly_installment DECIMAL(15,2) NOT NULL,
    start_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- active, closed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- 10. Loan Repayments (Ledger for loans)
CREATE TABLE IF NOT EXISTS loan_repayments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    loan_id INT NOT NULL,
    payslip_id INT NULL, -- Linked if deducted via payroll
    payment_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
    FOREIGN KEY (payslip_id) REFERENCES payslips(id) ON DELETE SET NULL
);

-- 11. Tax Slabs (Simplified Progressive Tax)
CREATE TABLE IF NOT EXISTS tax_slabs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    name VARCHAR(50) NULL,
    min_salary DECIMAL(15,2) NOT NULL,
    max_salary DECIMAL(15,2) NULL, -- NULL means infinity
    tax_percent DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 12. Chart of Accounts (Simple Accounting)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- asset, liability, equity, income, expense
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 13. Journal Entries (Double Entry Header)
CREATE TABLE IF NOT EXISTS journal_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    reference_id VARCHAR(50) NULL, -- e.g. Payroll Cycle ID
    reference_type VARCHAR(50) NULL, -- 'payroll'
    date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 14. Journal Items (Double Entry Lines)
CREATE TABLE IF NOT EXISTS journal_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    journal_entry_id INT NOT NULL,
    account_id INT NOT NULL,
    debit DECIMAL(15,2) DEFAULT 0.00,
    credit DECIMAL(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_cycle_approvals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    payroll_cycle_id INT NOT NULL,
    action VARCHAR(20) NOT NULL,
    note TEXT NULL,
    user_id INT NULL,
    user_role VARCHAR(50) NULL,
    user_name VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_cycle_id) REFERENCES payroll_cycles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(128) NOT NULL,
    user_id INT NULL,
    user_role VARCHAR(50) NULL,
    user_name VARCHAR(100) NULL,
    meta JSON NULL
);
