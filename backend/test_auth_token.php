<?php
require_once __DIR__ . '/src/Core/Database.php';
require_once __DIR__ . '/src/Core/Token.php';

use App\Core\Database;
use App\Core\Token;

$tokenStr = $argv[1] ?? null;

if (!$tokenStr) {
    echo "Usage: php test_auth_token.php <token>\n";
    exit(1);
}

echo "Inspecting token: $tokenStr\n";

$pdo = Database::get();
$stmt = $pdo->prepare("SELECT * FROM auth_tokens WHERE token = ?");
$stmt->execute([$tokenStr]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    echo "Token NOT FOUND in database.\n";
    exit;
}

echo "Token found:\n";
print_r($row);

if ($row['expires_at'] && strtotime($row['expires_at']) < time()) {
    echo "Token EXPIRED.\n";
} else {
    echo "Token VALID.\n";
}

echo "Role: " . $row['role'] . "\n";
