<?php
require 'src/Core/Database.php';
require 'src/Payroll/PayrollStore.php';
require 'src/Payroll/PayrollService.php'; // Just in case
require 'src/Core/Auth.php'; // Just in case

use App\Core\Database;
use App\Payroll\PayrollStore;

// Load env
$envPaths = [__DIR__ . '/.env', __DIR__ . '/../.env'];
foreach ($envPaths as $envPath) {
    if (file_exists($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (str_starts_with($line, '#')) continue;
            [$k, $v] = array_map('trim', explode('=', $line, 2));
            if ($k && $v && !getenv($k)) putenv("$k=$v");
        }
        break;
    }
}

$tenantId = 2; // Test Tenant
$pdo = Database::get();

if (!$pdo) {
    die("❌ DB Connection Failed. Check .env and DB credentials.\nDB_HOST: " . getenv('DB_HOST'));
}

$store = new PayrollStore($tenantId);

echo "--- Testing Salary History ---\n";

try {
    // 0. Setup Shift
    $stmt = $pdo->prepare("SELECT id FROM shifts WHERE tenant_id = ? LIMIT 1");
    $stmt->execute([$tenantId]);
    $shiftId = $stmt->fetchColumn();
    if (!$shiftId) {
        $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time) VALUES (?, 'Test Shift', '09:00:00', '18:00:00')")
            ->execute([$tenantId]);
        $shiftId = $pdo->lastInsertId();
    }

    // 1. Create Test Employee
    $pdo->prepare("DELETE FROM employees WHERE tenant_id = ? AND code = 'HIST_TEST'")->execute([$tenantId]);
    $pdo->prepare("INSERT INTO employees (tenant_id, shift_id, name, code, department, designation, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
        ->execute([$tenantId, $shiftId, "History Test User", "HIST_TEST", "IT", "Dev", "active"]);
    $empId = $pdo->lastInsertId();

    // 2. Create Salary Components
    $pdo->prepare("DELETE FROM salary_components WHERE tenant_id = ?")->execute([$tenantId]);
    $pdo->prepare("INSERT INTO salary_components (tenant_id, name, type) VALUES (?, 'HRA', 'earning')")->execute([$tenantId]);
    $hraId = $pdo->lastInsertId();

    // 3. Insert History
    // Revision 1: 2024-01-01, Base 5000
    echo "Creating Revision 1...\n";
    $store->saveSalaryStructure($empId, [
        'effective_from' => '2024-01-01',
        'base_salary' => 5000,
        'payment_method' => 'bank_transfer',
        'items' => [['component_id' => $hraId, 'amount' => 1000]]
    ]);
    sleep(1); // Ensure timestamp diff

    // Revision 2: 2025-01-01, Base 6000
    echo "Creating Revision 2...\n";
    $store->saveSalaryStructure($empId, [
        'effective_from' => '2025-01-01',
        'base_salary' => 6000,
        'payment_method' => 'bank_transfer',
        'items' => [['component_id' => $hraId, 'amount' => 1200]]
    ]);

    // 4. Fetch History
    echo "Fetching History...\n";
    $history = $store->getSalaryHistory($empId);

    echo "Found " . count($history) . " revisions.\n";

    foreach ($history as $h) {
        echo "Effective: {$h['effective_from']}, Base: {$h['base_salary']}, Items: " . count($h['items']) . "\n";
        foreach ($h['items'] as $item) {
            echo "  - {$item['name']}: {$item['amount']}\n";
        }
    }

    if (count($history) >= 2) {
        echo "✅ History test passed.\n";
    } else {
        echo "❌ History test failed.\n";
    }

    // Cleanup
    $pdo->prepare("DELETE FROM employees WHERE id = ?")->execute([$empId]);
    $pdo->prepare("DELETE FROM salary_components WHERE tenant_id = ?")->execute([$tenantId]);

} catch (Exception $e) {
    echo "❌ Exception: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString();
}
