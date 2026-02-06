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

function usage(): void
{
    $self = basename(__FILE__);
    fwrite(STDERR, "Usage:\n");
    fwrite(STDERR, "  php {$self} --tenant=1 --cycle=123 --employee=45\n");
    fwrite(STDERR, "Optional:\n");
    fwrite(STDERR, "  --max-days=31\n");
}

function parseArgs(array $argv): array
{
    $out = [];
    foreach ($argv as $i => $arg) {
        if ($i === 0) continue;
        if (str_starts_with($arg, '--') && str_contains($arg, '=')) {
            [$k, $v] = explode('=', substr($arg, 2), 2);
            $out[$k] = $v;
        }
    }
    return $out;
}

$args = parseArgs($argv);
$tenantId = (int)($args['tenant'] ?? 1);
$cycleId = (int)($args['cycle'] ?? 0);
$employeeId = (int)($args['employee'] ?? 0);
$maxDays = (int)($args['max-days'] ?? 31);
if ($maxDays <= 0) $maxDays = 31;

if ($cycleId <= 0 || $employeeId <= 0) {
    usage();
    exit(2);
}

$pdo = Database::get();
if (!$pdo) {
    fwrite(STDERR, "DB connection failed\n");
    exit(1);
}

$store = new PayrollStore($tenantId);
$service = new PayrollService($tenantId);

$cycle = $store->getCycle($cycleId);
if (!$cycle) {
    fwrite(STDERR, "Cycle not found: {$cycleId}\n");
    exit(1);
}

$stmt = $pdo->prepare('SELECT e.id, e.code, e.name, e.shift_id, s.name AS shift_name, s.working_days, s.start_time, s.end_time FROM employees e LEFT JOIN shifts s ON s.id=e.shift_id WHERE e.tenant_id=? AND e.id=? LIMIT 1');
$stmt->execute([$tenantId, $employeeId]);
$emp = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$emp) {
    fwrite(STDERR, "Employee not found: {$employeeId}\n");
    exit(1);
}

echo "=== Payroll Integration Diagnostic ===\n";
echo "Tenant: {$tenantId}\n";
echo "Cycle: {$cycleId} {$cycle['name']} {$cycle['start_date']}..{$cycle['end_date']} status={$cycle['status']}\n";
echo "Employee: {$emp['id']} {$emp['code']} {$emp['name']} shift_id={$emp['shift_id']} shift={$emp['shift_name']}\n";
echo "Shift: working_days=" . (string)($emp['working_days'] ?? '') . " start={$emp['start_time']} end={$emp['end_time']}\n";
echo "\n";

$days = $service->getEmployeeDayStatuses((int)$emp['id'], (string)$cycle['start_date'], (string)$cycle['end_date']);
$counts = [
    'scheduled_workday' => 0,
    'present' => 0,
    'paid_leave' => 0,
    'unpaid_leave' => 0,
    'leave_mixed' => 0,
    'absent' => 0,
    'holiday' => 0,
    'weekly_off' => 0,
    'other' => 0,
];

$late = 0;
$early = 0;
$ot = 0;

foreach ($days as $r) {
    if ((int)($r['scheduled_workday'] ?? 0) === 1) $counts['scheduled_workday']++;
    $status = (string)($r['status'] ?? 'other');
    if (isset($counts[$status])) $counts[$status]++;
    else $counts['other']++;

    $late += (int)($r['late_minutes'] ?? 0);
    $early += (int)($r['early_leave_minutes'] ?? 0);
    $ot += (int)($r['overtime_minutes'] ?? 0);
}

echo "Day summary:\n";
foreach ($counts as $k => $v) {
    echo "  {$k}: {$v}\n";
}
echo "Totals:\n";
echo "  late_minutes={$late}\n";
echo "  early_leave_minutes={$early}\n";
echo "  overtime_minutes={$ot}\n";
echo "  overtime_hours=" . round($ot / 60, 2) . "\n";
echo "\n";

echo "First days detail:\n";
$shown = 0;
foreach ($days as $r) {
    $shown++;
    $date = (string)$r['date'];
    $dow = (string)$r['day'];
    $status = (string)$r['status'];
    $att = (string)($r['attendance_status'] ?? '');
    $lp = (float)($r['leave_paid'] ?? 0);
    $lu = (float)($r['leave_unpaid'] ?? 0);
    $lt = implode(',', (array)($r['leave_types'] ?? []));
    echo "  {$date} {$dow} status={$status} scheduled={$r['scheduled_workday']} att={$att} leave_paid={$lp} leave_unpaid={$lu} leave_types={$lt} late={$r['late_minutes']} early={$r['early_leave_minutes']} ot={$r['overtime_minutes']}\n";
    if ($shown >= $maxDays) break;
}

echo "\n";

$stmtP = $pdo->prepare('SELECT id FROM payslips WHERE tenant_id=? AND payroll_cycle_id=? AND employee_id=? LIMIT 1');
$stmtP->execute([$tenantId, $cycleId, $employeeId]);
$payslipId = (int)($stmtP->fetchColumn() ?: 0);

if ($payslipId <= 0) {
    echo "Payslip: not found for this employee/cycle\n";
    exit(0);
}

$payslip = $store->getPayslip($payslipId);
echo "Payslip: #{$payslipId} gross={$payslip['gross_salary']} deductions={$payslip['total_deductions']} tax={$payslip['tax_deducted']} net={$payslip['net_salary']}\n";
echo "Attendance snapshot: total_days={$payslip['total_days']} working_days={$payslip['working_days']} present_days={$payslip['present_days']} paid_leave_days={$payslip['paid_leave_days']} unpaid_leave_days={$payslip['unpaid_leave_days']} absent_days={$payslip['absent_days']} payable_days={$payslip['payable_days']} holidays={$payslip['holidays']}\n";
echo "Items:\n";
foreach (($payslip['items'] ?? []) as $it) {
    echo "  {$it['type']}  {$it['name']}  {$it['amount']}\n";
}

