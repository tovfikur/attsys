<?php

// Set system timezone to Bangladesh Standard Time
date_default_timezone_set('Asia/Dhaka');

// Simple Autoloader
spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $base_dir = __DIR__ . '/src/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';

    if (file_exists($file)) {
        require $file;
    }
});

use App\Core\Database;
use App\Payroll\PayrollService;
use App\Payroll\PayrollStore;

$tenantId = 1; // Default Tenant

echo "--- Payroll Seeder Started ---\n";

$pdo = Database::get();
$store = new PayrollStore($tenantId);
$service = new PayrollService($tenantId);

// 1a. Seeding Chart of Accounts
echo "1a. Seeding Chart of Accounts...\n";
$accounts = [
    ['code' => '5001', 'name' => 'Salary Expense', 'type' => 'expense'],
    ['code' => '2001', 'name' => 'Salary Payable', 'type' => 'liability'],
    ['code' => '2002', 'name' => 'Tax Payable', 'type' => 'liability'],
    ['code' => '2003', 'name' => 'Provident Fund Payable', 'type' => 'liability'],
    ['code' => '1001', 'name' => 'Bank Account', 'type' => 'asset'],
    ['code' => '1002', 'name' => 'Employee Loans', 'type' => 'asset'],
];

$accountMap = [];
foreach ($accounts as $acc) {
    $stmt = $pdo->prepare("SELECT id FROM chart_of_accounts WHERE tenant_id = ? AND code = ?");
    $stmt->execute([$tenantId, $acc['code']]);
    $existing = $stmt->fetchColumn();

    if ($existing) {
        $accountMap[$acc['code']] = $existing;
        echo " - Skipped {$acc['name']} (Already exists)\n";
    } else {
        $stmtIns = $pdo->prepare("INSERT INTO chart_of_accounts (tenant_id, code, name, type) VALUES (?, ?, ?, ?)");
        $stmtIns->execute([$tenantId, $acc['code'], $acc['name'], $acc['type']]);
        $accountMap[$acc['code']] = $pdo->lastInsertId();
        echo " - Created {$acc['name']}\n";
    }
}

// 1b. Seeding Tax Slabs
echo "1b. Seeding Tax Slabs...\n";
$pdo->exec("DELETE FROM tax_slabs WHERE tenant_id = $tenantId");
$slabs = [
    ['min' => 0, 'max' => 30000, 'percent' => 0],
    ['min' => 30000, 'max' => 60000, 'percent' => 10],
    ['min' => 60000, 'max' => 100000, 'percent' => 15],
    ['min' => 100000, 'max' => null, 'percent' => 20],
];
$stmtSlab = $pdo->prepare("INSERT INTO tax_slabs (tenant_id, min_salary, max_salary, tax_percent) VALUES (?, ?, ?, ?)");
foreach ($slabs as $slab) {
    $stmtSlab->execute([$tenantId, $slab['min'], $slab['max'], $slab['percent']]);
}
echo " - Seeded " . count($slabs) . " tax slabs.\n";

// 1. Seeding Salary Components
echo "1. Seeding Salary Components...\n";
$components = [
    ['name' => 'Basic Salary', 'type' => 'earning', 'is_taxable' => 1, 'is_recurring' => 1],
    ['name' => 'House Rent Allowance', 'type' => 'earning', 'is_taxable' => 1, 'is_recurring' => 1],
    ['name' => 'Medical Allowance', 'type' => 'earning', 'is_taxable' => 0, 'is_recurring' => 1],
    ['name' => 'Transport Allowance', 'type' => 'earning', 'is_taxable' => 1, 'is_recurring' => 1],
    ['name' => 'Provident Fund', 'type' => 'deduction', 'is_taxable' => 0, 'is_recurring' => 1],
    ['name' => 'Tax', 'type' => 'deduction', 'is_taxable' => 0, 'is_recurring' => 1],
];

$componentMap = [];
foreach ($components as $comp) {
    // Check if exists
    $stmt = $pdo->prepare("SELECT id FROM salary_components WHERE tenant_id = ? AND name = ?");
    $stmt->execute([$tenantId, $comp['name']]);
    $existing = $stmt->fetchColumn();

    if ($existing) {
        $componentMap[$comp['name']] = $existing;
        echo " - Skipped {$comp['name']} (Already exists)\n";
    } else {
        $id = $store->createComponent($comp);
        $componentMap[$comp['name']] = $id;
        echo " - Created {$comp['name']}\n";
    }
}

// 2. Get Employees and Assign Structure
echo "2. Assigning Salary Structures...\n";

// Ensure at least 2 employees exist
$stmtCount = $pdo->prepare("SELECT COUNT(*) FROM employees WHERE tenant_id = ?");
$stmtCount->execute([$tenantId]);
if ($stmtCount->fetchColumn() < 2) {
    // Get default shift
    $stmtShift = $pdo->prepare("SELECT id FROM shifts WHERE tenant_id = ? LIMIT 1");
    $stmtShift->execute([$tenantId]);
    $shiftId = $stmtShift->fetchColumn();
    
    if (!$shiftId) {
         // Create a default shift if none
         // Note: Assuming table structure for shifts. If fails, user needs to ensure shifts exist.
         // Let's try simple insert or assume shift_id 1 if failure.
         try {
            $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time) VALUES (?, 'General', '09:00:00', '18:00:00')")->execute([$tenantId]);
            $shiftId = $pdo->lastInsertId();
         } catch (Exception $e) {
             echo "Failed to create shift: " . $e->getMessage() . "\n";
             $shiftId = 1; // Fallback
         }
    }

    echo " - Creating second employee for testing...\n";
    // Check also if department_id or designation_id are required?
    // Based on error only shift_id was mentioned.
    $stmtInsEmp = $pdo->prepare("INSERT INTO employees (tenant_id, name, code, email, status, shift_id) VALUES (?, 'Jane Smith', 'JS02', 'jane@example.com', 'active', ?)");
    $stmtInsEmp->execute([$tenantId, $shiftId]);
}

$stmtEmp = $pdo->prepare("SELECT id, name, code FROM employees WHERE tenant_id = ? AND status = 'active' LIMIT 5");
$stmtEmp->execute([$tenantId]);
$employees = $stmtEmp->fetchAll(PDO::FETCH_ASSOC);

if (empty($employees)) {
    echo "No active employees found. Please seed employees first.\n";
    exit;
}

foreach ($employees as $emp) {
    // Check if structure exists
    $existingStructure = $store->getSalaryStructure($emp['id']);
    if ($existingStructure) {
        echo " - Employee {$emp['name']} ({$emp['code']}) already has a structure.\n";
        continue;
    }

    $baseSalary = rand(30000, 80000);
    $structureData = [
        'effective_from' => date('Y-01-01'),
        'base_salary' => $baseSalary,
        'payment_method' => 'bank_transfer',
        'items' => [
            ['component_id' => $componentMap['House Rent Allowance'], 'amount' => 0, 'is_percentage' => 1, 'percentage' => 50],
            ['component_id' => $componentMap['Medical Allowance'], 'amount' => 5000],
            ['component_id' => $componentMap['Transport Allowance'], 'amount' => 3000],
            ['component_id' => $componentMap['Provident Fund'], 'amount' => 0, 'is_percentage' => 1, 'percentage' => 10],
        ]
    ];

    $store->saveSalaryStructure($emp['id'], $structureData);
    echo " - Assigned structure to {$emp['name']} (Base: $baseSalary)\n";
}

// 2a. Create Sample Loan
echo "2a. Creating Sample Loan...\n";
$loanEmp = $employees[0] ?? null;
if ($loanEmp) {
    // Check if loan exists
    $existingLoans = $store->getActiveLoans($loanEmp['id']);
    if (empty($existingLoans)) {
        $loanData = [
            'employee_id' => $loanEmp['id'],
            'type' => 'loan',
            'amount' => 50000,
            'interest_rate' => 5,
            'monthly_installment' => 5000,
            'start_date' => date('Y-m-d'),
        ];
        $service->addLoan($loanData);
        echo " - Created Loan for {$loanEmp['name']} (Amount: 50000)\n";
    } else {
        echo " - Loan already exists for {$loanEmp['name']}\n";
    }
}

// 2b. Create Sample Advance
echo "2b. Creating Sample Advance...\n";
$advEmp = $employees[1] ?? null;
if ($advEmp) {
    // Check existing
    $existingLoans = $store->getActiveLoans($advEmp['id']);
    $hasAdvance = false;
    foreach ($existingLoans as $l) {
        if ($l['type'] === 'advance') $hasAdvance = true;
    }
    
    if (!$hasAdvance) {
         $advData = [
            'employee_id' => $advEmp['id'],
            'amount' => 10000,
            'start_date' => date('Y-m-d'),
        ];
        $service->addAdvance($advData);
        echo " - Created Advance for {$advEmp['name']} (Amount: 10000)\n";
    } else {
        echo " - Advance already exists for {$advEmp['name']}\n";
    }
}

// 3. Create Payroll Cycle
echo "3. Creating Payroll Cycle...\n";
$currentMonth = date('Y-m');
$cycleName = date('F Y');
$startDate = date('Y-m-01');
$endDate = date('Y-m-t');

// Check if cycle exists
$existingCycle = $store->getCycleByRange($startDate, $endDate);
if ($existingCycle) {
    $cycleId = $existingCycle['id'];
    echo " - Cycle '$cycleName' already exists (ID: $cycleId)\n";
} else {
    $cycleId = $service->createCycle($cycleName, $startDate, $endDate);
    echo " - Created Cycle '$cycleName' (ID: $cycleId)\n";
}

// 4. Run Payroll
echo "4. Running Payroll Calculation...\n";
try {
    $results = $service->runPayroll($cycleId);
    foreach ($results as $res) {
        if ($res['status'] === 'success') {
            echo " - Processed Employee ID {$res['employee_id']} (Payslip ID: {$res['payslip_id']})\n";
            
            // Inspect Items
            $payslip = $store->getPayslip($res['payslip_id']);
            echo "   [Items]:\n";
            foreach ($payslip['items'] as $item) {
                echo "    - {$item['name']}: {$item['amount']} ({$item['type']})\n";
            }
            echo "   [Net Salary]: {$payslip['net_salary']}\n";
            
        } else {
            echo " - Failed Employee ID {$res['employee_id']}: {$res['message']}\n";
        }
    }
} catch (Exception $e) {
    echo "Error running payroll: " . $e->getMessage() . "\n";
}

echo "--- Payroll Seeder Completed ---\n";
