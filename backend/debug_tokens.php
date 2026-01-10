<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();
if (!$pdo) {
    echo "Database connection failed.\n";
    exit;
}

$stmt = $pdo->query("SELECT * FROM auth_tokens");
$tokens = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Count: " . count($tokens) . "\n";
foreach ($tokens as $t) {
    echo "Token: " . substr($t['token'], 0, 10) . "...\n";
    echo "User: " . $t['user_name'] . " (" . $t['role'] . ")\n";
    echo "Expires: " . $t['expires_at'] . "\n";
    echo "-------------------\n";
}
