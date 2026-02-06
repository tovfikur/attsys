<?php
date_default_timezone_set('Asia/Dhaka');

spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $base_dir = __DIR__ . '/src/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) return;
    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';
    if (file_exists($file)) require $file;
});

use App\Core\Database;
use App\Payroll\PayrollService;
use App\Payroll\PayrollStore;

$tenantId = 1;
$pdo = Database::get();
if (!$pdo) {
    fwrite(STDERR, "DB connection failed\n");
    exit(1);
}

echo "--- Starting Payroll Leave + Shift Integration Test ---\n";

$safeExec = function (string $sql) use ($pdo) {
    try { $pdo->exec($sql); } catch (\Throwable $e) { }
};

$safeExec("DELETE FROM payslip_items WHERE tenant_id = {$tenantId}");
$safeExec("DELETE FROM payslips WHERE tenant_id = {$tenantId}");
$safeExec("DELETE FROM payroll_cycles WHERE tenant_id = {$tenantId}");
$safeExec("DELETE FROM loans WHERE tenant_id = {$tenantId}");
$safeExec("DELETE FROM loan_repayments WHERE tenant_id = {$tenantId}");
$safeExec("DELETE FROM attendance_days WHERE tenant_id = {$tenantId}");
$safeExec("DELETE FROM raw_events WHERE tenant_id = {$tenantId}");
$safeExec("DELETE FROM attendance_records WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = {$tenantId} AND email='test.leave.payroll@example.com')");
$safeExec("DELETE FROM leaves WHERE tenant_id = {$tenantId} AND employee_id IN (SELECT id FROM employees WHERE tenant_id = {$tenantId} AND email='test.leave.payroll@example.com')");
$safeExec("DELETE FROM leave_types WHERE tenant_id = {$tenantId} AND code IN ('paid_test','unpaid_test')");
$safeExec("DELETE FROM employee_salary_items WHERE tenant_id = {$tenantId}");
$safeExec("DELETE FROM employee_salary_structures WHERE tenant_id = {$tenantId}");
$safeExec("DELETE FROM employees WHERE tenant_id = {$tenantId} AND email='test.leave.payroll@example.com'");

$store = new PayrollStore($tenantId);
$service = new PayrollService($tenantId);

echo "Ensuring test shift...\n";
$stmt = $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, break_duration_minutes, working_days, is_default) VALUES (?, ?, '09:00:00', '17:00:00', 15, 15, 0, 'Mon,Tue,Wed,Thu,Fri', 0)");
$stmt->execute([$tenantId, 'Payroll Test Shift']);
$shiftId = (int)$pdo->lastInsertId();

echo "Creating employee...\n";
$stmt = $pdo->prepare("INSERT INTO employees (tenant_id, shift_id, name, code, email, status) VALUES (?, ?, ?, ?, ?, ?)");
$stmt->execute([$tenantId, $shiftId, 'Leave Payroll Tester', 'LPR001', 'test.leave.payroll@example.com', 'active']);
$empId = (int)$pdo->lastInsertId();

echo "Creating leave types...\n";
$stmt = $pdo->prepare("INSERT INTO leave_types (tenant_id, code, name, is_paid, requires_document, active, sort_order) VALUES (?, ?, ?, ?, 0, 1, 0)");
$stmt->execute([$tenantId, 'paid_test', 'Paid Test Leave', 1]);
$stmt->execute([$tenantId, 'unpaid_test', 'Unpaid Test Leave', 0]);

echo "Seeding leaves...\n";
$stmt = $pdo->prepare("INSERT INTO leaves (tenant_id, employee_id, date, leave_type, day_part, reason, status) VALUES (?, ?, ?, ?, 'full', 'test', 'approved')");
$stmt->execute([$tenantId, $empId, '2024-05-08', 'paid_test']);
$stmt->execute([$tenantId, $empId, '2024-05-09', 'unpaid_test']);

echo "Creating salary structure...\n";
$store->saveSalaryStructure($empId, [
    'effective_from' => '2024-01-01',
    'base_salary' => 30000,
    'payment_method' => 'bank_transfer',
    'items' => []
]);

echo "Seeding attendance_records...\n";
$records = [
    ['2024-05-06', '09:00:00', '17:00:00'],
    ['2024-05-10', '09:00:00', '17:00:00'],
];
$stmtRec = $pdo->prepare("INSERT INTO attendance_records (employee_id, date, clock_in, clock_out, duration_minutes, status, late_minutes, early_leave_minutes, overtime_minutes) VALUES (?, ?, ?, ?, ?, 'Present', 0, 0, 0)");
foreach ($records as $r) {
    $date = $r[0];
    $in = "{$date} {$r[1]}";
    $out = "{$date} {$r[2]}";
    $dur = (int)((strtotime($out) - strtotime($in)) / 60);
    $stmtRec->execute([$empId, $date, $in, $out, $dur]);
}

echo "Creating payroll cycle...\n";
$cycleId = (int)$service->createCycle("Leave Integration May 2024", "2024-05-06", "2024-05-10");

echo "Running payroll...\n";
$results = $service->runPayroll($cycleId);
$row = null;
foreach ($results as $r) {
    if ((int)($r['employee_id'] ?? 0) === $empId) { $row = $r; break; }
}
if (!$row || ($row['status'] ?? '') !== 'success') {
    echo "❌ Payroll run did not generate payslip for employee\n";
    print_r($results);
    exit(1);
}

$payslipId = (int)$row['payslip_id'];
$payslip = $service->getPayslip($payslipId);

echo "--- Verification ---\n";
echo "Payslip #{$payslipId}\n";
echo "Summary: working_days={$payslip['working_days']} present_days={$payslip['present_days']} paid_leave_days={$payslip['paid_leave_days']} unpaid_leave_days={$payslip['unpaid_leave_days']} absent_days={$payslip['absent_days']} payable_days={$payslip['payable_days']}\n";

$expectedWorkingDays = 5.0;
$expectedPresent = 2.0;
$expectedPaidLeave = 1.0;
$expectedUnpaidLeave = 1.0;
$expectedAbsent = 1.0;

$ok = true;
$cmp = function (string $label, $actual, $expected) use (&$ok) {
    $a = (float)$actual;
    $e = (float)$expected;
    if (abs($a - $e) < 0.001) {
        echo "✅ {$label} {$a}\n";
    } else {
        echo "❌ {$label} got {$a} expected {$e}\n";
        $ok = false;
    }
};

$cmp('working_days', $payslip['working_days'], $expectedWorkingDays);
$cmp('present_days', $payslip['present_days'], $expectedPresent);
$cmp('paid_leave_days', $payslip['paid_leave_days'], $expectedPaidLeave);
$cmp('unpaid_leave_days', $payslip['unpaid_leave_days'], $expectedUnpaidLeave);
$cmp('absent_days', $payslip['absent_days'], $expectedAbsent);

$perDay = 30000 / 5;
$expectedUnpaidDeduction = round($perDay * 1.0, 2);
$expectedAbsentDeduction = round($perDay * 1.0, 2);

$unpaidFound = false;
$absentFound = false;

foreach (($payslip['items'] ?? []) as $it) {
    $name = (string)($it['name'] ?? '');
    $amount = (float)($it['amount'] ?? 0);
    if (str_starts_with($name, 'Unpaid Leave (')) {
        $unpaidFound = true;
        if (abs($amount - $expectedUnpaidDeduction) < 0.01) echo "✅ unpaid leave deduction {$amount}\n";
        else { echo "❌ unpaid leave deduction got {$amount} expected {$expectedUnpaidDeduction}\n"; $ok = false; }
    }
    if (str_starts_with($name, 'Absence (')) {
        $absentFound = true;
        if (abs($amount - $expectedAbsentDeduction) < 0.01) echo "✅ absence deduction {$amount}\n";
        else { echo "❌ absence deduction got {$amount} expected {$expectedAbsentDeduction}\n"; $ok = false; }
    }
}

if (!$unpaidFound) { echo "❌ unpaid leave deduction item missing\n"; $ok = false; }
if (!$absentFound) { echo "❌ absence deduction item missing\n"; $ok = false; }

if (!$ok) {
    echo "--- FAILED ---\n";
    exit(1);
}

echo "--- PASSED ---\n";
exit(0);

