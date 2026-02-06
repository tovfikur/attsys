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

echo "Testing Payroll Settings and Overtime...\n";

// 1. Set Settings
echo "1. Setting Overtime Config...\n";
$store->saveSetting('overtime_rate_multiplier', 2.0); // Double rate
$store->saveSetting('work_hours_per_day', 8);
$store->saveSetting('days_per_month', 20); // 20 days work

$settings = $store->getAllSettings();
echo "Settings: " . json_encode($settings) . "\n";

if ($settings['overtime_rate_multiplier'] != 2.0) {
    echo "FAIL: Setting not saved correctly.\n";
    exit(1);
}

// 2. Setup Test Data
$pdo->exec("DELETE FROM employees WHERE id = 999");
$pdo->exec("DELETE FROM employee_salary_structures WHERE employee_id = 999");
$pdo->exec("DELETE FROM attendance_records WHERE employee_id = 999");
$pdo->exec("DELETE FROM payroll_cycles WHERE name = 'Test Cycle OT'");
$pdo->exec("DELETE FROM shifts WHERE id = 999");

// Insert Shift
$stmt = $pdo->prepare("INSERT INTO shifts (id, tenant_id, name, start_time, end_time) VALUES (999, 1, 'Test Shift', '09:00:00', '18:00:00')");
$stmt->execute();

// Insert Employee (using 'name' and 'shift_id')
$stmt = $pdo->prepare("INSERT INTO employees (id, tenant_id, shift_id, name, code, email, status) VALUES (999, 1, 999, 'Test User', 'EMP999', 'test@example.com', 'active')");
$stmt->execute();

// Insert Salary Structure (Base Salary: 2000)
// Hourly Rate = (2000 / 20) / 8 = 100 / 8 = 12.5
// OT Rate = 12.5 * 2.0 = 25
$pdo->exec("INSERT INTO employee_salary_structures (tenant_id, employee_id, base_salary, effective_from, status) VALUES (1, 999, 2000, '2023-01-01', 'active')");

// Insert Attendance Record (10 hours work -> 2 hours OT)
// PayrollService calculates OT as (duration - 8*60) / 60
// So 10 hours = 600 mins. 600 - 480 = 120 mins = 2 hours.
$pdo->exec("INSERT INTO attendance_records (employee_id, clock_in, clock_out, duration_minutes, date) VALUES (999, '2023-01-01 09:00:00', '2023-01-01 19:00:00', 600, '2023-01-01')");

// Create Cycle
$cycleId = $service->createCycle('Test Cycle OT', '2023-01-01', '2023-01-31');
echo "Created Cycle ID: $cycleId\n";

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
echo "Overtime Hours: " . $payslip['overtime_hours'] . "\n"; // Should be 2

// Verify OT Amount
// Expected: 2 hours * 25 = 50.
// Let's check items
$stmt = $pdo->prepare("SELECT * FROM payslip_items WHERE payslip_id = ? AND name LIKE 'Overtime%'");
$stmt->execute([$payslip['id']]);
$otItem = $stmt->fetch(PDO::FETCH_ASSOC);

if ($otItem) {
    echo "OT Item Found: " . $otItem['amount'] . "\n";
    if (abs($otItem['amount'] - 50.0) < 0.1) {
        echo "SUCCESS: Overtime calculated correctly (50.0).\n";
    } else {
        echo "FAIL: Overtime amount mismatch. Expected 50.0, got " . $otItem['amount'] . "\n";
    }
} else {
    echo "FAIL: Overtime item not found in payslip.\n";
}

// Clean up
$pdo->exec("DELETE FROM employees WHERE id = 999");
$pdo->exec("DELETE FROM employee_salary_structures WHERE employee_id = 999");
$pdo->exec("DELETE FROM attendance_records WHERE employee_id = 999");
$pdo->exec("DELETE FROM payroll_cycles WHERE name = 'Test Cycle OT'");
$pdo->exec("DELETE FROM shifts WHERE id = 999");
