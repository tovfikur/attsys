<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();
if (!$pdo) {
    echo "Database connection failed.\n";
    exit;
}

$stmt = $pdo->query("DESCRIBE auth_tokens");
$columns = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($columns as $col) {
    echo $col['Field'] . " (" . $col['Type'] . ")\n";
}
