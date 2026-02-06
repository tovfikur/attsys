<?php
require_once __DIR__ . '/src/Core/Database.php';
require_once __DIR__ . '/src/Payroll/PayrollStore.php';
require_once __DIR__ . '/src/Payroll/PayrollService.php';
require_once __DIR__ . '/src/Core/EmployeesStore.php';
require_once __DIR__ . '/src/Core/AttendanceStore.php';

use App\Core\Database;
use App\Payroll\PayrollStore;
use App\Payroll\PayrollService;

// Fix for autoloader
spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $base_dir = __DIR__ . '/src/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) return;
    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';
    if (file_exists($file)) require $file;
});

// Load Env
if (file_exists(__DIR__ . '/.env')) {
    $lines = file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $_ENV[trim($name)] = trim($value);
    }
} elseif (file_exists(__DIR__ . '/../.env')) {
    $lines = file(__DIR__ . '/../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $_ENV[trim($name)] = trim($value);
    }
}

$tenantId = 1;
$store = new PayrollStore($tenantId);
$service = new PayrollService($tenantId);
$pdo = Database::get();

echo "Testing Tax Calculation...\n";

// 1. Setup Tax Slabs
echo "1. Setting Tax Slabs...\n";
$pdo->exec("DELETE FROM tax_slabs WHERE tenant_id = 1");

$store->saveTaxSlab(['name' => 'Tax Free', 'min_salary' => 0, 'max_salary' => 1000, 'tax_percent' => 0]);
$store->saveTaxSlab(['name' => 'Standard', 'min_salary' => 1000, 'max_salary' => 2000, 'tax_percent' => 10]);
$store->saveTaxSlab(['name' => 'High', 'min_salary' => 2000, 'max_salary' => null, 'tax_percent' => 20]);

// 2. Setup Test Data
$pdo->exec("DELETE FROM employees WHERE id = 999");
$pdo->exec("DELETE FROM employee_salary_structures WHERE employee_id = 999");
$pdo->exec("DELETE FROM attendance_records WHERE employee_id = 999");
$pdo->exec("DELETE FROM payroll_cycles WHERE name = 'Test Cycle Tax'");
$pdo->exec("DELETE FROM shifts WHERE id = 999");

// Insert Shift
$stmt = $pdo->prepare("INSERT INTO shifts (id, tenant_id, name, start_time, end_time) VALUES (999, 1, 'Test Shift', '09:00:00', '18:00:00')");
$stmt->execute();

// Insert Employee
$stmt = $pdo->prepare("INSERT INTO employees (id, tenant_id, shift_id, name, code, email, status) VALUES (999, 1, 999, 'Tax Test User', 'EMP999', 'tax@example.com', 'active')");
$stmt->execute();

// Insert Salary Structure (Base Salary: 2500)
$pdo->exec("INSERT INTO employee_salary_structures (tenant_id, employee_id, base_salary, effective_from, status) VALUES (1, 999, 2500, '2023-01-01', 'active')");

// Insert Attendance Record (Full Month)
// Assuming 30 days in month, simple calculation
// PayrollService calculates daysInMonth based on cycle dates.
// If we set cycle to 1 month, it divides base salary by days.
// To make it simple, let's assume attendance matches days in month exactly so Gross = Base.
// PayrollService: $perDaySalary = $baseSalary / $daysInMonth;
// Paid Leave/Present Days summing up to total days ensures Gross = Base.
// But wait, PayrollService uses:
// $grossEarning = $baseSalary; (Line 239)
// So Gross is Base unless there are deductions for unpaid leave.
// We just need 0 unpaid leave.
// So we insert nothing into attendance? 
// No, runPayroll needs attendance summary.
// If no attendance records, getAttendanceSummary returns 0 present days?
// Let's insert one record for present days to be safe, but mostly we care that unpaid_leave_days is 0.
// $unpaidDays = $attendanceData['unpaid_leave_days'];
// getAttendanceSummary calculates unpaid leaves from `leaves` table.
// If no leaves, unpaid is 0.
// So Gross = Base = 2500.

// Create Cycle
$cycleId = $service->createCycle('Test Cycle Tax', '2023-01-01', '2023-01-31');

// 3. Run Payroll
echo "Running Payroll...\n";
$results = $service->runPayroll($cycleId);
print_r($results);

// 4. Verify Results
// Get Payslip
$stmt = $pdo->prepare("SELECT * FROM payslips WHERE payroll_cycle_id = ? AND employee_id = 999");
$stmt->execute([$cycleId]);
$payslip = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$payslip) {
    echo "FAIL: Payslip not generated.\n";
    exit(1);
}

echo "Payslip generated. ID: " . $payslip['id'] . "\n";
echo "Gross Salary: " . $payslip['gross_salary'] . "\n";
echo "Tax Deducted: " . $payslip['tax_deducted'] . "\n";

// Expected Tax:
// 0-1000: 0
// 1000-2000: 1000 * 10% = 100
// 2000-2500: 500 * 20% = 100
// Total: 200
if (abs($payslip['tax_deducted'] - 200.0) < 0.1) {
    echo "SUCCESS: Tax calculated correctly (200.0).\n";
} else {
    echo "FAIL: Tax mismatch. Expected 200.0, got " . $payslip['tax_deducted'] . "\n";
}

// Clean up
$pdo->exec("DELETE FROM employees WHERE id = 999");
$pdo->exec("DELETE FROM employee_salary_structures WHERE employee_id = 999");
$pdo->exec("DELETE FROM attendance_records WHERE employee_id = 999");
$pdo->exec("DELETE FROM payroll_cycles WHERE name = 'Test Cycle Tax'");
$pdo->exec("DELETE FROM shifts WHERE id = 999");
$pdo->exec("DELETE FROM tax_slabs WHERE tenant_id = 1");
