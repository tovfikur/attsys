<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();
if (!$pdo) {
    echo "Database connection failed.\n";
    exit;
}

$stmt = $pdo->query("SELECT * FROM roles");
$roles = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($roles as $role) {
    echo "Role: " . $role['name'] . "\n";
    echo "Permissions: " . $role['permissions'] . "\n";
    echo "-------------------\n";
}
