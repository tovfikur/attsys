<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();

// Find a tenant
$tStmt = $pdo->query("SELECT id FROM tenants WHERE subdomain='demo' LIMIT 1");
$tenantId = $tStmt->fetchColumn();
if (!$tenantId) {
    // try to find any tenant
    $tenantId = $pdo->query("SELECT id FROM tenants LIMIT 1")->fetchColumn();
}
if (!$tenantId) die("No tenant found");

// Find an employee
$eStmt = $pdo->prepare("SELECT id FROM employees WHERE tenant_id=? LIMIT 1");
$eStmt->execute([$tenantId]);
$employeeId = $eStmt->fetchColumn();

if (!$employeeId) die("No employee found");

// Clean existing leaves for this date
$date = '2025-06-01';
$pdo->prepare("DELETE FROM leaves WHERE tenant_id=? AND employee_id=? AND date=?")->execute([$tenantId, $employeeId, $date]);

// Insert APPROVED leave
$stmt = $pdo->prepare("INSERT INTO leaves(tenant_id, employee_id, date, leave_type, day_part, status, reason) VALUES(?, ?, ?, 'casual', 'full', 'approved', 'Setup approved leave')");
$stmt->execute([$tenantId, $employeeId, $date]);

echo json_encode(['employee_id' => $employeeId, 'tenant_id' => $tenantId, 'date' => $date]);
