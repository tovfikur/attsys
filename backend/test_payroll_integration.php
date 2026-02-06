<?php
require_once __DIR__ . '/vendor/autoload.php';

use App\Core\Database;
use App\Payroll\PayrollService;
use App\Payroll\PayrollStore;
use App\Core\AttendanceProcessor;

// Initialize
$tenantId = 1;
$pdo = Database::get();
$store = new PayrollStore($tenantId);
$service = new PayrollService($tenantId);

echo "--- Starting Payroll Integration Test ---\n";

// 1. Cleanup
$pdo->exec("DELETE FROM payslip_items WHERE tenant_id = $tenantId");
$pdo->exec("DELETE FROM payslips WHERE tenant_id = $tenantId");
$pdo->exec("DELETE FROM payroll_cycles WHERE tenant_id = $tenantId");
$pdo->exec("DELETE FROM loan_repayments WHERE tenant_id = $tenantId");
$pdo->exec("DELETE FROM loans WHERE tenant_id = $tenantId");
$pdo->exec("DELETE FROM attendance_days WHERE tenant_id = $tenantId");
$pdo->exec("DELETE FROM attendance_records WHERE tenant_id = $tenantId");
$pdo->exec("DELETE FROM employee_salary_items WHERE tenant_id = $tenantId");
$pdo->exec("DELETE FROM employee_salary_structures WHERE tenant_id = $tenantId");
$pdo->exec("DELETE FROM employees WHERE email = 'test.payroll@example.com'");

// 2. Create Employee & Salary Structure
echo "Creating Employee...\n";
$stmt = $pdo->prepare("INSERT INTO employees (tenant_id, name, email, password, role, status, code) VALUES (?, ?, ?, ?, ?, ?, ?)");
$stmt->execute([$tenantId, 'Payroll Tester', 'test.payroll@example.com', 'hashed', 'employee', 'active', 'PAY001']);
$empId = $pdo->lastInsertId();

echo "Creating Salary Structure...\n";
$store->saveSalaryStructure($empId, [
    'effective_from' => '2023-01-01',
    'base_salary' => 30000, // 1000 per day (approx)
    'payment_method' => 'bank_transfer',
    'items' => []
]);

// 3. Create Loan
echo "Creating Loan...\n";
$loanId = $store->createLoan([
    'employee_id' => $empId,
    'type' => 'personal',
    'amount' => 50000,
    'total_repayment_amount' => 50000, // 0 interest
    'monthly_installment' => 5000,
    'start_date' => '2023-01-01',
    'status' => 'active'
]);

// 4. Create Attendance Records (Late & Overtime)
// Shift: 09:00 - 17:00 (8 hours). Late Tol: 15 min.
// 2023-10-01: On Time (09:00 - 17:00) -> Present
// 2023-10-02: Late (09:30 - 17:00) -> 30 mins late
// 2023-10-03: Overtime (09:00 - 19:00) -> 2 hours OT
// 2023-10-04: Late & Overtime (09:30 - 19:00) -> 30 mins late, 2 hours OT

echo "Seeding Attendance...\n";
// Ensure default shift exists or create one for test
$stmt = $pdo->prepare("SELECT id FROM shifts WHERE tenant_id = ? AND is_default = 1");
$stmt->execute([$tenantId]);
if (!$stmt->fetch()) {
    $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, is_default) VALUES (?, 'Default', '09:00:00', '17:00:00', 15, 15, 1)")->execute([$tenantId]);
}

$records = [
    ['2023-10-01', '09:00:00', '17:00:00'], // Normal
    ['2023-10-02', '09:30:00', '17:00:00'], // Late 30m
    ['2023-10-03', '09:00:00', '19:00:00'], // OT 2h (120m)
    ['2023-10-04', '09:30:00', '19:00:00'], // Late 30m, OT 2h (120m)
];

$stmtRec = $pdo->prepare("INSERT INTO attendance_records (employee_id, date, clock_in, clock_out, duration_minutes, status) VALUES (?, ?, ?, ?, ?, 'Present')");

foreach ($records as $r) {
    $date = $r[0];
    $in = "$date {$r[1]}";
    $out = "$date {$r[2]}";
    $dur = (strtotime($out) - strtotime($in)) / 60;
    $stmtRec->execute([$empId, $date, $in, $out, $dur]);
}

// 5. Create Payroll Cycle
echo "Creating Payroll Cycle...\n";
$cycleId = $service->createCycle("October 2023", "2023-10-01", "2023-10-31");

// 6. Run Payroll
echo "Running Payroll...\n";
// This will trigger AttendanceProcessor, then calculation
$results = $service->runPayroll($cycleId);

if (empty($results) || $results[0]['status'] === 'error') {
    print_r($results);
    exit("Payroll Run Failed\n");
}

$payslipId = $results[0]['payslip_id'];
echo "Payslip Generated: ID $payslipId\n";

// 7. Verify Payslip
$payslip = $service->getPayslip($payslipId);

echo "--- Verification ---\n";

// Expectation:
// Base Salary: 30000
// Days in Month: 31 (Oct)
// Hourly Rate: (30000 / 30) / 8 = 1000 / 8 = 125. (Using default settings: 30 days, 8 hours)
// Check settings?
$daysPerMonth = (float)$store->getSetting('days_per_month', 30);
$workHours = (float)$store->getSetting('work_hours_per_day', 8);
$hourlyRate = ($daysPerMonth > 0 && $workHours > 0) ? (30000 / $daysPerMonth) / $workHours : 0; // 125
echo "Hourly Rate: $hourlyRate\n";

// Late Penalty:
// Total Late: 30 + 30 = 60 mins = 1 hour.
// Penalty = 1 * 125 = 125.
echo "Expected Late Penalty: 125.00\n";

// Overtime:
// Total OT: 120 + 120 = 240 mins = 4 hours.
// Multiplier: 1.5 (default)
// Amount = 4 * 125 * 1.5 = 750.
echo "Expected Overtime: 750.00\n";

// Loan Deduction:
// Installment: 5000.
echo "Expected Loan Deduction: 5000.00\n";

// Tax:
// Gross = 30000 + 750 = 30750.
// Tax calculation (depends on slabs). Assuming 0 for now if no slabs or low income.
// Let's create a slab to be sure? No, let's just observe.

$items = $payslip['items'];
$foundLate = false;
$foundOT = false;
$foundLoan = false;

foreach ($items as $item) {
    echo "Item: {$item['name']} | Amount: {$item['amount']} | Type: {$item['type']}\n";
    
    if (strpos($item['name'], 'Late Penalty') !== false) {
        $foundLate = true;
        if (abs($item['amount'] - 125.00) < 0.1) echo "✅ Late Penalty Correct\n";
        else echo "❌ Late Penalty Incorrect (Expected 125)\n";
    }
    
    if (strpos($item['name'], 'Overtime') !== false) {
        $foundOT = true;
        if (abs($item['amount'] - 750.00) < 0.1) echo "✅ Overtime Correct\n";
        else echo "❌ Overtime Incorrect (Expected 750)\n";
    }

    if (strpos($item['name'], 'Loan Repayment') !== false) {
        $foundLoan = true;
        if (abs($item['amount'] - 5000.00) < 0.1) echo "✅ Loan Deduction Correct\n";
        else echo "❌ Loan Deduction Incorrect (Expected 5000)\n";
    }
}

if (!$foundLate) echo "❌ Late Penalty Missing\n";
if (!$foundOT) echo "❌ Overtime Missing\n";
if (!$foundLoan) echo "❌ Loan Deduction Missing\n";

// 8. Lock Cycle (Process Repayment)
echo "Locking Cycle...\n";
$service->lockCycle($cycleId);

// Verify Loan Balance
$balance = $store->getLoanBalance($loanId);
echo "Loan Balance: $balance (Expected 45000)\n";
if ($balance == 45000) echo "✅ Loan Repayment Processed Successfully\n";
else echo "❌ Loan Repayment Processing Failed\n";

echo "--- Test Complete ---\n";
