<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();
if (!$pdo) {
    echo "Database connection failed.\n";
    exit;
}

$rolesToUpdate = ['tenant_owner', 'hr_admin'];
$permToAdd = 'attendance.write';

foreach ($rolesToUpdate as $roleName) {
    $stmt = $pdo->prepare("SELECT * FROM roles WHERE name = ?");
    $stmt->execute([$roleName]);
    $role = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($role) {
        $perms = json_decode($role['permissions'], true);
        if (!in_array($permToAdd, $perms)) {
            $perms[] = $permToAdd;
            $newPerms = json_encode($perms);
            
            $update = $pdo->prepare("UPDATE roles SET permissions = ? WHERE name = ?");
            $update->execute([$newPerms, $roleName]);
            echo "Updated $roleName: Added $permToAdd\n";
        } else {
            echo "$roleName already has $permToAdd\n";
        }
    } else {
        echo "Role $roleName not found\n";
    }
}
