<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();
if (!$pdo) exit(1);

$tenants = $pdo->query("SELECT id FROM tenants")->fetchAll(PDO::FETCH_ASSOC);

foreach ($tenants as $t) {
    $tid = $t['id'];
    // Check if default shift exists
    $stmt = $pdo->prepare("SELECT id FROM shifts WHERE tenant_id = ? AND is_default = 1");
    $stmt->execute([$tid]);
    if (!$stmt->fetch()) {
        echo "Creating default shift for tenant $tid...\n";
        $ins = $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, is_default) VALUES (?, 'Standard Shift', '09:00:00', '17:00:00', 15, 15, 1)");
        $ins->execute([$tid]);
    }
}
echo "Done seeding shifts.\n";
