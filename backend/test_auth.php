<?php
require_once __DIR__ . '/src/Core/Database.php';
require_once __DIR__ . '/src/Core/Token.php';
require_once __DIR__ . '/src/Core/Auth.php';

// Mock environment for Auth
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer mock-tenant-token-abc';
$_SERVER['HTTP_X_TENANT_ID'] = 'demo'; // Assuming 'demo' tenant exists

use App\Core\Auth;
use App\Core\Database;

echo "Checking permissions for Tenant Owner...\n";

$user = Auth::currentUser();
echo "User Role: " . $user['role'] . "\n";

$perm = 'attendance.write';
$has = Auth::hasPermission($user, $perm);

echo "Has Permission '$perm': " . ($has ? 'YES' : 'NO') . "\n";

if (!$has) {
    echo "Debugging DB permissions...\n";
    $pdo = Database::get();
    $stmt = $pdo->prepare('SELECT permissions FROM roles WHERE name=?');
    $stmt->execute([$user['role']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "Raw DB Permissions: " . $row['permissions'] . "\n";
}
