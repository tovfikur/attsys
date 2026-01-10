<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$db = Database::get();

if (!$db) {
    die("Could not connect to database.\n");
}

$sql = "CREATE TABLE IF NOT EXISTS password_resets (
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(email),
    INDEX(token)
)";

try {
    $db->exec($sql);
    echo "Table password_resets created successfully.\n";
} catch (PDOException $e) {
    echo "Error creating table: " . $e->getMessage() . "\n";
}
