<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();
if (!$pdo) {
    echo "Database connection failed.\n";
    exit;
}

$sql = "CREATE TABLE IF NOT EXISTS leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    employee_id INT NOT NULL,
    date DATE NOT NULL,
    reason VARCHAR(255),
    status VARCHAR(32) DEFAULT 'approved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (tenant_id, employee_id),
    INDEX (date)
)";

try {
    $pdo->exec($sql);
    echo "Table 'leaves' created successfully.\n";
} catch (PDOException $e) {
    echo "Error creating table: " . $e->getMessage() . "\n";
}
