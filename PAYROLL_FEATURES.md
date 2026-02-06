# Payroll System Feature Checklist

This document tracks the implementation status of the requested payroll features.

## 1. Salary Structure Management

- [x] Basic salary configuration
- [x] Multiple allowances (fixed)
- [x] **Percentage based allowances**
- [x] **Overtime rate configuration**
- [x] Salary revision history with effective dates
- [x] Employee bank account details storage (Basic `payment_method` supported)

## 2. Attendance to Payroll Auto-integration

- [x] Working days calculation
- [x] Present days calculation
- [x] Absent days tracking
- [x] Paid leave handling
- [x] Unpaid leave deduction
- [x] **Late/early penalty calculation**
- [x] Overtime hours import from attendance

## 3. Payroll Processing

- [x] Payroll cycle creation (monthly/weekly/custom)
- [x] Payroll run generation
- [x] Draft payroll processing
- [x] Automatic salary calculation
- [x] Manual adjustments (+/–)
- [x] Review payroll
- [x] **Approval workflow** (Approve/reject steps + notes + approval history)
- [x] Payroll locking/finalization
- [x] Recalculation before lock

## 4. Calculation Engine

- [x] Gross salary calculation
- [x] Earnings aggregation
- [x] Deduction aggregation
- [x] Net salary calculation
- [ ] **Configurable rule-based calculation engine** (Code-based currently)
- [x] Allowance management
- [x] **Bonus management** (Cycle-based bonuses with taxable/non-taxable support)
- [x] **Incentive/commission management** (Managed as variable pay items)
- [x] One-time payments (Via manual adjustments)
- [x] **Tax slabs configuration** (CRUD UI + calculation via defined slabs)
- [x] **Automatic tax calculation**
- [x] **Provident fund/benefits deduction** (Employee PF deduction + employer PF accrual posting)
- [x] Custom deductions
- [x] **Penalties/fines** (Managed as variable pay deductions)
- [x] Loan management
- [x] Salary advance management
- [x] EMI auto deduction
- [x] Loan balance tracking

## 5. Payslip & Payments

- [x] Payslip generation
- [x] Payslip breakdown
- [x] **PDF payslip export** (Print view)
- [x] Payslip history
- [x] Employee self download
- [x] Email payslip delivery
- [x] Bank transfer file generation (CSV)
- [x] **Batch salary payments** (Cycle-wide payment marking + bank CSV export)
- [x] Payment status tracking
- [x] **Partial payment support**
- [x] Payment history records

## 6. Accounting Integration

- [x] Ledger account management
- [x] Double-entry accounting integration
- [x] Journal entry auto creation
- [x] Salary expense posting
- [x] Salary payable posting
- [x] Bank payment entries
- [x] Accounting export

## 7. Reports & Analytics

- [x] Payroll dashboard (Basic)
- [x] Payroll summary reports
- [x] Department cost reports
- [x] Employee-wise salary report
- [x] Overtime report
- [x] Deduction report
- [x] Tax report
- [x] Loan report
- [x] Monthly payroll cost report
- [x] Yearly payroll summary
- [x] Excel/PDF export (CSV only)

## 8. Security & Access

- [x] Role-based access control
- [x] **Permission management** (Granular payroll permissions per role)
- [x] Salary data protection
- [ ] **Sensitive field encryption** (At rest encryption for salary fields missing)
- [ ] **Audit trail logs** (Tenant audit viewer added; coverage still partial)
- [x] Payroll change history (Salary history yes)
- [x] **Approval history tracking**

## 9. Advanced Features

- [x] Multi-branch/company support (Tenant based)
- [x] Multiple payroll frequencies
- [ ] **Multi-currency support**
- [ ] **Retroactive adjustments**
- [ ] **Arrears calculation**
- [x] Holiday pay rules (Basic)
- [ ] **Shift differential pay**
- [ ] **Project/department cost allocation** (Dept only)
- [x] Employee self-service portal
- [x] View payslips
- [x] View salary history
- [x] **Apply for advance/loan**
- [x] **Download tax summary**
- [x] Payroll settings/configuration panel (Basic)
- [ ] **Formula/rule customization**
- [ ] **Automated payroll scheduler**
- [x] REST API endpoints
