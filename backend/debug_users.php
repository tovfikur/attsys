<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();
$stmt = $pdo->query("SELECT * FROM tenant_users");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
