<?php
// Simple Autoloader (copied from public/index.php)
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

// Set timezone
date_default_timezone_set('Asia/Dhaka');

use App\Core\Database;
use App\Payroll\PayrollService;
use App\Payroll\PayrollStore;
use App\Core\Auth;

// --- Helper Functions ---

function assertEq($actual, $expected, $message) {
    if (abs($actual - $expected) < 0.01) {
        echo "✅ PASS: $message (Got $actual)\n";
    } else {
        echo "❌ FAIL: $message (Expected $expected, Got $actual)\n";
        throw new Exception("Assertion failed");
    }
}

function assertExists($array, $key, $value, $message) {
    foreach ($array as $item) {
        if (isset($item[$key]) && $item[$key] == $value) {
            echo "✅ PASS: $message\n";
            return;
        }
    }
    echo "❌ FAIL: $message (Item with $key=$value not found)\n";
    print_r($array);
    throw new Exception("Assertion failed");
}

function clearTestData($pdo, $tenantId) {
    $pdo->exec("DELETE FROM payslip_items WHERE payslip_id IN (SELECT id FROM payslips WHERE tenant_id = $tenantId)");
    $pdo->exec("DELETE FROM payslips WHERE tenant_id = $tenantId");
    $pdo->exec("DELETE FROM payroll_cycles WHERE tenant_id = $tenantId");
    $pdo->exec("DELETE FROM loans WHERE tenant_id = $tenantId");
    $pdo->exec("DELETE FROM employee_salary_items WHERE tenant_id = $tenantId");
    $pdo->exec("DELETE FROM employee_salary_structures WHERE tenant_id = $tenantId");
    $pdo->exec("DELETE FROM salary_components WHERE tenant_id = $tenantId");
    $pdo->exec("DELETE FROM tax_slabs WHERE tenant_id = $tenantId");
    $pdo->exec("DELETE FROM attendance_records WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = $tenantId)"); // Careful!
    $pdo->exec("DELETE FROM leaves WHERE tenant_id = $tenantId"); // Careful!
    $pdo->exec("DELETE FROM employees WHERE tenant_id = $tenantId");
    $pdo->exec("DELETE FROM shifts WHERE tenant_id = $tenantId");
}

// --- Main Test Script ---

try {
    echo "--- Starting Payroll Calculation Unit Tests ---\n";
    
    $pdo = Database::get();
    
    // 1. Setup Test Tenant and Employee
    // We'll reuse an existing tenant or create one. Let's assume tenant_id 1 exists or use a dedicated test one.
    // To be safe, let's look for a 'Test Tenant' or create it.
    $stmt = $pdo->prepare("SELECT id FROM tenants WHERE name = ?");
    $stmt->execute(['Unit Test Tenant']);
    $tenantId = $stmt->fetchColumn();
    
    if (!$tenantId) {
        $stmt = $pdo->prepare("INSERT INTO tenants (name, subdomain, status) VALUES (?, ?, ?)");
        $stmt->execute(['Unit Test Tenant', 'unittest', 'active']);
        $tenantId = $pdo->lastInsertId();
        echo "Created Test Tenant ID: $tenantId\n";
    } else {
        echo "Using Test Tenant ID: $tenantId\n";
    }

    // Clear previous data for this tenant
    clearTestData($pdo, $tenantId);

    // Create Test Shift (Required for Employee)
    $stmt = $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time) VALUES (?, ?, ?, ?)");
    // Check if shift exists or create
    // Since we cleared data, we might need to create one, but shifts table wasn't cleared. 
    // Let's create a new one to be safe and use its ID.
    $stmt->execute([$tenantId, 'General Shift', '09:00:00', '17:00:00']);
    $shiftId = $pdo->lastInsertId();

    // Create Test Employee
    $empCode = 'TEST_UNIT_01';
    $stmt = $pdo->prepare("INSERT INTO employees (tenant_id, shift_id, code, name, email, status) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([$tenantId, $shiftId, $empCode, 'Unit Tester', 'test@example.com', 'active']);
    $empId = $pdo->lastInsertId();
    echo "Created Test Employee ID: $empId\n";

    $service = new PayrollService($tenantId);
    $store = new PayrollStore($tenantId);

    // 2. Setup Salary Components
    $basicId = $store->createComponent(['name' => 'Basic Salary', 'type' => 'earning', 'is_taxable' => 1]); // Usually handled internally as base, but let's add HRA
    $hraId = $store->createComponent(['name' => 'HRA', 'type' => 'earning', 'is_taxable' => 1, 'amount' => 0]);
    $transId = $store->createComponent(['name' => 'Transport', 'type' => 'earning', 'is_taxable' => 0, 'amount' => 0]);

    // 3. Define Cycle Dates
    $startDate = '2025-01-01';
    $endDate = '2025-01-31';
    $cycleId = $service->createCycle('Jan 2025', $startDate, $endDate);
    echo "Created Cycle ID: $cycleId\n";

    // --- Scenario 1: Basic Calculation ---
    echo "\n--- Scenario 1: Basic Calculation (Base + Fixed Allowances) ---\n";
    
    $baseSalary = 5000;
    $hraAmount = 1000;
    $transAmount = 500;
    
    $store->saveSalaryStructure($empId, [
        'effective_from' => '2024-01-01',
        'base_salary' => $baseSalary,
        'items' => [
            ['component_id' => $hraId, 'amount' => $hraAmount],
            ['component_id' => $transId, 'amount' => $transAmount]
        ]
    ]);

    // Mock Full Attendance (No OT, No Lates)
    // We insert one record per day
    $current = new DateTime($startDate);
    $end = new DateTime($endDate);
    while ($current <= $end) {
        $date = $current->format('Y-m-d');
        // Weekends check? Let's assume 7 days work for simplicity or skip weekends if business logic requires.
        // The calculation logic in Service divides by daysInMonth (31), so it assumes paid for all days (standard monthly salary).
        // Attendance logic counts "present_days". 
        // PayrollService line 217: perDaySalary = base / daysInMonth.
        // But line 246: unpaidDays = $attendanceData['unpaid_leave_days'].
        // It deducts unpaid leave. It doesn't seemingly deduct for "absent but not on leave" explicitly in the snippet shown?
        // Wait, line 247: $unpaidDeduction = round($unpaidDays * $perDaySalary, 2);
        // It only deducts if unpaid_leave_days > 0.
        // So simply not having attendance records doesn't trigger deduction unless we record "Absent" as unpaid leave?
        // Or maybe "Absent" should be auto-calculated? 
        // The current logic provided in `PayrollService` ONLY deducts if `unpaid_leave_days` is returned from `getAttendanceSummary`.
        // `getAttendanceSummary` counts unpaid leaves from `leaves` table.
        // So presence doesn't affect salary UNLESS there is an unpaid leave record. 
        // (This is a simplified model: Salary is fixed unless you apply for unpaid leave).
        
        // Insert Attendance (Present)
        $pdo->prepare("INSERT INTO attendance_records (employee_id, date, clock_in, clock_out, duration_minutes, late_minutes) VALUES (?, ?, ?, ?, ?, ?)")
            ->execute([$empId, $date, "$date 09:00:00", "$date 17:00:00", 480, 0]);
            
        $current->modify('+1 day');
    }

    $results = $service->runPayroll($cycleId);
    $payslipId = $results[0]['payslip_id'];
    $payslip = $store->getPayslip($payslipId);

    $expectedGross = $baseSalary + $hraAmount + $transAmount;
    assertEq($payslip['gross_salary'], $expectedGross, "Gross Salary matches Base + Allowances");
    assertEq($payslip['net_salary'], $expectedGross, "Net Salary matches Gross (No Tax/Deductions)");

    
    // --- Scenario 2: Unpaid Leave ---
    echo "\n--- Scenario 2: Unpaid Leave Deduction ---\n";
    
    // Delete previous payslip to re-run
    $pdo->exec("DELETE FROM payslip_items WHERE payslip_id = $payslipId");
    $pdo->exec("DELETE FROM payslips WHERE id = $payslipId");

    // Add 2 Days Unpaid Leave
    $pdo->prepare("INSERT INTO leaves (tenant_id, employee_id, leave_type, date, day_part, status) VALUES (?, ?, ?, ?, ?, ?)")
        ->execute([$tenantId, $empId, 'unpaid', '2025-01-10', 'full', 'approved']);
    $pdo->prepare("INSERT INTO leaves (tenant_id, employee_id, leave_type, date, day_part, status) VALUES (?, ?, ?, ?, ?, ?)")
        ->execute([$tenantId, $empId, 'unpaid', '2025-01-11', 'full', 'approved']);

    $results = $service->runPayroll($cycleId);
    $payslipId = $results[0]['payslip_id'];
    $payslip = $store->getPayslip($payslipId);

    $daysInMonth = 31;
    $perDay = $baseSalary / $daysInMonth;
    $deduction = round(2 * $perDay, 2);
    
    assertExists($payslip['items'], 'name', 'Unpaid Leave (2 days)', "Unpaid Leave item exists");
    assertEq($payslip['total_deductions'], $deduction, "Total Deductions match unpaid leave calculation");
    assertEq($payslip['net_salary'], $expectedGross - $deduction, "Net Salary reflects unpaid leave deduction");


    // --- Scenario 3: Overtime ---
    echo "\n--- Scenario 3: Overtime Calculation ---\n";
    
    // Clean up
    $pdo->exec("DELETE FROM payslip_items WHERE payslip_id = $payslipId");
    $pdo->exec("DELETE FROM payslips WHERE id = $payslipId");
    $pdo->exec("DELETE FROM leaves WHERE tenant_id = $tenantId"); // Remove unpaid leave

    // Add OT: 2 days with 10 hours work (2 hrs OT each => 4 hrs Total)
    // Update existing attendance records
    $pdo->prepare("UPDATE attendance_records SET duration_minutes = 600 WHERE employee_id = ? AND DATE(clock_in) = ?")
        ->execute([$empId, '2025-01-05']); // 10 hours
    $pdo->prepare("UPDATE attendance_records SET duration_minutes = 600 WHERE employee_id = ? AND DATE(clock_in) = ?")
        ->execute([$empId, '2025-01-06']); // 10 hours

    // Logic in Service: OT Rate = (Base / 30) / 8. Multiplier 1.5.
    // Base = 5000. 
    // Hourly Rate = (5000/30)/8 = 166.666 / 8 = 20.8333
    // OT Hours = 4.
    // Amount = 4 * 20.8333 * 1.5 = 125.00
    
    $otRate = ($baseSalary / 30) / 8;
    $otAmount = round(4 * $otRate * 1.5, 2);

    $results = $service->runPayroll($cycleId);
    $payslipId = $results[0]['payslip_id'];
    $payslip = $store->getPayslip($payslipId);

    assertExists($payslip['items'], 'type', 'earning', "OT Item exists"); // Name might vary "Overtime (4 hrs)"
    // Find OT amount
    $actualOt = 0;
    foreach ($payslip['items'] as $item) {
        if (strpos($item['name'], 'Overtime') !== false) {
            $actualOt = $item['amount'];
            break;
        }
    }
    assertEq($actualOt, $otAmount, "Overtime Amount Calculation");
    assertEq($payslip['gross_salary'], $expectedGross + $otAmount, "Gross Salary includes OT");


    // --- Scenario 4: Tax Calculation ---
    echo "\n--- Scenario 4: Tax Calculation ---\n";

    // Clean up
    $pdo->exec("DELETE FROM payslip_items WHERE payslip_id = $payslipId");
    $pdo->exec("DELETE FROM payslips WHERE id = $payslipId");
    // Reset Attendance to normal
    $pdo->prepare("UPDATE attendance_records SET duration_minutes = 480 WHERE employee_id = ?")->execute([$empId]);

    // Setup Tax Slabs
    // Slab 1: 0 - 6000 (0%)
    // Slab 2: 6000 - 8000 (10%)
    // Slab 3: 8000+ (20%)
    $pdo->prepare("INSERT INTO tax_slabs (tenant_id, min_salary, max_salary, tax_percent) VALUES (?, ?, ?, ?)")->execute([$tenantId, 0, 6000, 0]);
    $pdo->prepare("INSERT INTO tax_slabs (tenant_id, min_salary, max_salary, tax_percent) VALUES (?, ?, ?, ?)")->execute([$tenantId, 6000, 8000, 10]);
    $pdo->prepare("INSERT INTO tax_slabs (tenant_id, min_salary, max_salary, tax_percent) VALUES (?, ?, ?, ?)")->execute([$tenantId, 8000, null, 20]);

    // Update Salary to be high: 10000 Base
    $newBase = 10000;
    $store->saveSalaryStructure($empId, [
        'effective_from' => '2025-01-01', // Update effective date
        'base_salary' => $newBase,
        'items' => [] // No allowances for simple tax calc
    ]);

    // Expected Tax:
    // Gross = 10000
    // 0 - 6000: 0
    // 6000 - 8000: 2000 * 10% = 200
    // 8000 - 10000: 2000 * 20% = 400
    // Total Tax = 600
    
    $results = $service->runPayroll($cycleId);
    $payslipId = $results[0]['payslip_id'];
    $payslip = $store->getPayslip($payslipId);

    assertEq($payslip['gross_salary'], 10000, "Gross Salary is 10000");
    assertEq($payslip['tax_deducted'], 600, "Tax Calculation is correct");
    assertEq($payslip['net_salary'], 10000 - 600, "Net Salary reflects Tax");


    // --- Scenario 5: Loan Deduction ---
    echo "\n--- Scenario 5: Loan Deduction ---\n";

    // Clean up
    $pdo->exec("DELETE FROM payslip_items WHERE payslip_id = $payslipId");
    $pdo->exec("DELETE FROM payslips WHERE id = $payslipId");

    // Add Loan
    // Amount 5000, Installment 1000
    $service->addLoan([
        'employee_id' => $empId,
        'amount' => 5000,
        'type' => 'term_loan',
        'interest_rate' => 0,
        'monthly_installment' => 1000,
        'start_date' => '2025-01-01',
        'reason' => 'Test Loan'
    ]);

    $results = $service->runPayroll($cycleId);
    $payslipId = $results[0]['payslip_id'];
    $payslip = $store->getPayslip($payslipId);

    // Tax should still apply (Base 10000 => Tax 600)
    // Loan Deduction => 1000
    // Total Deductions => 1600
    
    assertExists($payslip['items'], 'type', 'deduction', "Loan Repayment item exists"); // Check for Loan Repayment string in name if needed
    assertEq($payslip['tax_deducted'], 600, "Tax still calculated correctly");
    
    // Find Loan Amount
    $loanDed = 0;
    foreach ($payslip['items'] as $item) {
        if (strpos($item['name'], 'Loan Repayment') !== false) {
            $loanDed = $item['amount'];
            break;
        }
    }
    assertEq($loanDed, 1000, "Loan Installment Correct");
    assertEq($payslip['total_deductions'], 1600, "Total Deductions (Tax + Loan)");
    assertEq($payslip['net_salary'], 10000 - 1600, "Net Salary Correct");


    echo "\n✅ ALL TESTS PASSED SUCCESSFULLY!\n";

} catch (Exception $e) {
    echo "\n❌ TEST FAILED: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString();
    exit(1);
}
