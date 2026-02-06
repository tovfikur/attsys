<?php

// Set system timezone to Bangladesh Standard Time
date_default_timezone_set('Asia/Dhaka');

// Simple Autoloader
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
$store = new PayrollStore($tenantId);
$service = new PayrollService($tenantId);

echo "--- STARTING FULL PAYROLL FLOW TEST ---\n";

// 1. Setup Test Data
$testEmpCode = 'TEST001';
echo "1. Finding/Creating Test Employee ($testEmpCode)...\n";
$stmt = $pdo->prepare("SELECT id FROM employees WHERE code = ? AND tenant_id = ?");
$stmt->execute([$testEmpCode, $tenantId]);
$empId = $stmt->fetchColumn();

if (!$empId) {
    // Get a valid shift
    $stmtShift = $pdo->prepare("SELECT id FROM shifts WHERE tenant_id = ? LIMIT 1");
    $stmtShift->execute([$tenantId]);
    $shiftId = $stmtShift->fetchColumn();
    
    if (!$shiftId) {
        // Create a default shift if none exists
        $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time) VALUES (?, 'Default Shift', '09:00:00', '17:00:00')")->execute([$tenantId]);
        $shiftId = $pdo->lastInsertId();
    }

    // Create Test Employee
    $stmtIns = $pdo->prepare("INSERT INTO employees (tenant_id, code, name, email, status, department, shift_id) VALUES (?, ?, 'Test User', 'test@example.com', 'active', 'Engineering', ?)");
    $stmtIns->execute([$tenantId, $testEmpCode, $shiftId]);
    $empId = $pdo->lastInsertId();
    echo " - Created Employee ID: $empId (Shift: $shiftId)\n";
} else {
    echo " - Found Employee ID: $empId\n";
}

// 2. Setup Salary Structure
echo "2. Setting up Salary Structure...\n";
// Base Salary 50000 (Taxable > 30000, so tax should apply)
$structureData = [
    'effective_from' => date('Y-01-01'),
    'base_salary' => 50000,
    'payment_method' => 'bank_transfer',
    'items' => [] // Add allowances if needed
];
$store->saveSalaryStructure($empId, $structureData);
echo " - Saved Structure: Base 50000\n";

// 3. Setup Loan
echo "3. Creating Active Loan...\n";
// Loan 10000, Installment 1000
$loanData = [
    'employee_id' => $empId,
    'type' => 'loan',
    'amount' => 10000,
    'interest_rate' => 0,
    'monthly_installment' => 1000,
    'start_date' => date('Y-m-01') // Start this month
];
$loanId = $service->addLoan($loanData);
echo " - Created Loan ID: $loanId (Amount: 10000, Inst: 1000)\n";

// 4. Create Cycle
echo "4. Creating Payroll Cycle...\n";
$cycleName = "Test Cycle " . date('Y-m-d H:i:s');
$startDate = date('Y-m-01');
$endDate = date('Y-m-t'); // End of current month
$cycleId = $service->createCycle($cycleName, $startDate, $endDate);
echo " - Created Cycle ID: $cycleId ($cycleName)\n";

// 5. Run Payroll
echo "5. Running Payroll...\n";
$results = $service->runPayroll($cycleId);
// print_r($results);
$found = false;
foreach ($results as $res) {
    if ($res['employee_id'] == $empId && $res['status'] == 'success') {
        $found = true;
        echo " - Success for Employee $empId\n";
        break;
    }
}
if (!$found) die("ERROR: Payroll run failed for test employee\n");

// 6. Verify Payslip
echo "6. Verifying Payslip...\n";
$payslips = $store->getPayslips($cycleId);
$myPayslip = null;
foreach ($payslips as $p) {
    if ($p['employee_id'] == $empId) {
        $myPayslip = $p;
        break;
    }
}

if (!$myPayslip) die("ERROR: Payslip not found in DB\n");
echo " - Gross: {$myPayslip['gross_salary']}\n";
echo " - Net: {$myPayslip['net_salary']}\n";
echo " - Tax: {$myPayslip['tax_deducted']}\n";

// Check Tax Logic: 50000 annualizes to 600,000? No, monthly calculation.
// Current logic: 
// Slabs: 0-30k (0%), 30k-60k (10%)
// Income 50k. 
// 0-30k = 0
// 30k-50k = 20k * 10% = 2000.
// Expected Tax ~ 2000.
if ($myPayslip['tax_deducted'] != 2000) {
    echo " WARNING: Tax {$myPayslip['tax_deducted']} != 2000. Check slab logic.\n";
} else {
    echo " - Tax Verified (2000)\n";
}

// Check Loan Deduction
$payslipDetail = $store->getPayslip($myPayslip['id']);
$loanDed = 0;
foreach ($payslipDetail['items'] as $item) {
    if (strpos($item['name'], 'Loan Repayment') !== false) {
        $loanDed += $item['amount'];
        echo " - Found Deduction: {$item['name']} = {$item['amount']}\n";
    }
}

if ($loanDed != 1000) {
    echo " WARNING: Loan Deduction $loanDed != 1000.\n";
} else {
    echo " - Loan Deduction Verified (1000)\n";
}

// 7. Lock Cycle
echo "7. Locking Cycle...\n";
$service->lockCycle($cycleId);
$cycle = $store->getCycle($cycleId);
if ($cycle['status'] !== 'locked') die("ERROR: Cycle status is {$cycle['status']}\n");
echo " - Cycle Locked.\n";

// Check Loan Repayment Recorded
$bal = $store->getLoanBalance($loanId);
echo " - Loan Balance after Lock: $bal (Should be 9000)\n";
if ($bal != 9000) echo " WARNING: Loan Balance incorrect.\n";

// 8. Mark Paid
echo "8. Marking Paid...\n";
$service->markCyclePaid($cycleId);
$cycle = $store->getCycle($cycleId);
if ($cycle['status'] !== 'paid') die("ERROR: Cycle status is {$cycle['status']}\n");
echo " - Cycle Paid.\n";

// 9. Verify Accounting
echo "9. Verifying Journal Entries...\n";
$stmtJ = $pdo->prepare("SELECT * FROM journal_entries WHERE reference_id = ? AND reference_type IN ('payroll_cycle', 'payroll_payment')");
$stmtJ->execute([$cycleId]);
$entries = $stmtJ->fetchAll(PDO::FETCH_ASSOC);

echo " - Found " . count($entries) . " Journal Entries.\n";
if (count($entries) < 2) echo " WARNING: Expected 2 entries (Accrual + Payment)\n";

foreach ($entries as $ent) {
    echo "   - Entry: {$ent['description']} ({$ent['date']})\n";
    $stmtI = $pdo->prepare("SELECT ji.*, ca.name FROM journal_items ji JOIN chart_of_accounts ca ON ji.account_id = ca.id WHERE journal_entry_id = ?");
    $stmtI->execute([$ent['id']]);
    $items = $stmtI->fetchAll(PDO::FETCH_ASSOC);
    foreach ($items as $item) {
        echo "     - {$item['name']}: Dr {$item['debit']} | Cr {$item['credit']}\n";
    }
}

echo "--- TEST COMPLETED ---\n";
