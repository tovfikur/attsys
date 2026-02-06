<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = null;
for ($i = 0; $i < 30; $i++) {
    $pdo = Database::get();
    if ($pdo) break;
    usleep(200000);
}
if (!$pdo) {
    fwrite(STDERR, "DB Connection failed\n");
    exit(1);
}

function tableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    $stmt->execute([$table]);
    return (bool)$stmt->fetchColumn();
}

function getColumns(PDO $pdo, string $table): array
{
    $stmt = $pdo->prepare("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?");
    $stmt->execute([$table]);
    $rows = $stmt->fetchAll(PDO::FETCH_COLUMN);
    return array_map('strval', $rows ?: []);
}

$required = [
    'payroll_settings' => ['tenant_id', 'setting_key', 'setting_value'],
    'roles' => ['tenant_id', 'role_name', 'permissions_json'],
    'salary_components' => ['tenant_id', 'name', 'type'],
    'employee_bank_accounts' => ['tenant_id', 'employee_id', 'bank_name', 'account_number', 'account_holder_name', 'is_primary'],
    'employee_salary_structures' => ['tenant_id', 'employee_id', 'effective_from', 'base_salary', 'payment_method', 'status'],
    'employee_salary_items' => ['tenant_id', 'salary_structure_id', 'component_id', 'amount', 'is_percentage', 'percentage'],
    'payroll_cycles' => ['tenant_id', 'name', 'start_date', 'end_date', 'status'],
    'payslips' => [
        'tenant_id',
        'payroll_cycle_id',
        'employee_id',
        'gross_salary',
        'net_salary',
        'tax_deducted',
        'working_days',
        'present_days',
        'paid_leave_days',
        'unpaid_leave_days',
        'absent_days',
        'weekly_off_days',
        'payable_days',
        'holidays',
    ],
    'payslip_items' => ['tenant_id', 'payslip_id', 'name', 'type', 'amount'],
    'payslip_payments' => ['tenant_id', 'payslip_id', 'amount', 'payment_date', 'method'],
    'payroll_bonuses' => ['tenant_id', 'employee_id', 'payroll_cycle_id', 'kind', 'direction', 'title', 'amount', 'taxable', 'status'],
    'loans' => ['tenant_id', 'employee_id', 'type', 'amount', 'monthly_installment', 'start_date', 'status'],
    'loan_repayments' => ['tenant_id', 'loan_id', 'payment_date', 'amount'],
    'tax_slabs' => ['tenant_id', 'name', 'min_salary', 'max_salary', 'tax_percent'],
    'chart_of_accounts' => ['tenant_id', 'code', 'name', 'type'],
    'journal_entries' => ['tenant_id', 'reference_id', 'reference_type', 'date'],
    'journal_items' => ['tenant_id', 'journal_entry_id', 'account_id', 'debit', 'credit'],
    'payroll_cycle_approvals' => ['tenant_id', 'payroll_cycle_id', 'action', 'created_at'],
    'audit_logs' => ['time', 'action', 'meta'],
];

$missingTables = [];
$missingCols = [];

foreach ($required as $table => $cols) {
    if (!tableExists($pdo, $table)) {
        $missingTables[] = $table;
        continue;
    }
    $existing = array_flip(getColumns($pdo, $table));
    foreach ($cols as $c) {
        if (!isset($existing[$c])) {
            $missingCols[] = $table . '.' . $c;
        }
    }
}

if ($missingTables) {
    fwrite(STDERR, "Missing tables:\n");
    foreach ($missingTables as $t) fwrite(STDERR, "- {$t}\n");
}
if ($missingCols) {
    fwrite(STDERR, "Missing columns:\n");
    foreach ($missingCols as $c) fwrite(STDERR, "- {$c}\n");
}

if ($missingTables || $missingCols) {
    exit(1);
}

echo "Payroll schema OK\n";
exit(0);
