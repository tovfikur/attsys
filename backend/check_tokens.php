<?php
require_once __DIR__ . '/src/Core/Database.php';
use App\Core\Database;

$pdo = Database::get();
$stmt = $pdo->query("SELECT * FROM auth_tokens");
$tokens = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Count: " . count($tokens) . "\n";
print_r($tokens);
