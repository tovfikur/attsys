<?php
require_once __DIR__ . '/src/Core/Database.php';
// require_once __DIR__ . '/src/Core/Autoloader.php'; // Removed

// Manual Autoloader for Test Environment
spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $base_dir = __DIR__ . '/src/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) return;
    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';
    if (file_exists($file)) require $file;
});

use App\Payroll\PayrollService;
use App\Core\Database;
use App\Core\TenantResolver;

echo "--- Testing Payslip Email ---\n";

try {
    // 1. Setup Tenant
    $pdo = Database::get();
    $stmt = $pdo->query("SELECT id FROM tenants LIMIT 1");
    $tenantId = $stmt->fetchColumn();
    if (!$tenantId) die("No tenant found.\n");

    $service = new PayrollService($tenantId);

    // 2. Setup Data
    // Find ANY payslip
    $stmt = $pdo->prepare("SELECT id, employee_id FROM payslips WHERE tenant_id = ? ORDER BY id DESC LIMIT 1");
    $stmt->execute([$tenantId]);
    $row = $stmt->fetch();
    
    if (!$row) {
        // Create a dummy cycle and payslip if none exist
        echo "No payslips found. Creating dummy data...\n";
        
        // Ensure employee exists
         // 0. Setup Shift
         $stmt = $pdo->prepare("SELECT id FROM shifts WHERE tenant_id = ? LIMIT 1");
         $stmt->execute([$tenantId]);
         $shiftId = $stmt->fetchColumn();
         if (!$shiftId) {
             $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time) VALUES (?, 'Test Shift', '09:00:00', '18:00:00')")
                 ->execute([$tenantId]);
             $shiftId = $pdo->lastInsertId();
         }

         $pdo->prepare("DELETE FROM employees WHERE tenant_id = ? AND code = 'EMAIL_TEST'")->execute([$tenantId]);
         $pdo->prepare("INSERT INTO employees (tenant_id, shift_id, name, code, department, designation, status, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
             ->execute([$tenantId, $shiftId, "Email Test User", "EMAIL_TEST", "IT", "Dev", "active", "email_test@example.com"]);
         $empId = $pdo->lastInsertId();

         // Create Cycle
         $pdo->prepare("INSERT INTO payroll_cycles (tenant_id, name, start_date, end_date, status) VALUES (?, 'Email Test Cycle', '2025-01-01', '2025-01-31', 'draft')")
             ->execute([$tenantId]);
         $cycleId = $pdo->lastInsertId();

         // Create Payslip
         $pdo->prepare("INSERT INTO payslips (tenant_id, payroll_cycle_id, employee_id, gross_salary, net_salary) VALUES (?, ?, ?, 5000, 4500)")
             ->execute([$tenantId, $cycleId, $empId]);
         $payslipId = $pdo->lastInsertId();
         
         // Create dummy items for the payslip (needed for email HTML generation)
         $pdo->prepare("INSERT INTO payslip_items (tenant_id, payslip_id, name, type, amount, is_variable) VALUES (?, ?, 'Basic Salary', 'earning', 5000, 0)")
             ->execute([$tenantId, $payslipId]);
         
         echo "Created Payslip ID: $payslipId for Employee ID: $empId\n";
    } else {
        $payslipId = $row['id'];
        $empId = $row['employee_id'];
        echo "Found existing Payslip ID: $payslipId (Employee ID: $empId)\n";
    }

    // Update Email for this employee
    $email = "test_" . time() . "@example.com";
    $pdo->prepare("UPDATE employees SET email = ? WHERE id = ?")
        ->execute([$email, $empId]);
    
    echo "Set email to: $email\n";

    // 3. Send Email
    echo "Sending email...\n";
    $result = $service->emailPayslip($payslipId);
    
    if ($result) {
        echo "✅ Email send function returned success.\n";
    } else {
        echo "❌ Email send function failed.\n";
    }

    // 4. Verify Log
    $logFile = __DIR__ . '/logs/email.log';
    if (file_exists($logFile)) {
        $content = file_get_contents($logFile);
        if (strpos($content, $email) !== false) {
            echo "✅ Log file contains email entry.\n";
        } else {
            echo "❌ Log file does not contain email entry.\n";
        }
    } else {
        echo "❌ Log file not found at $logFile\n";
    }

} catch (Exception $e) {
    echo "❌ Exception: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString();
}
