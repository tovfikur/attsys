<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = null;
for ($i = 0; $i < 20; $i++) {
    $pdo = Database::get();
    if ($pdo) break;
    usleep(250000);
}
if (!$pdo) exit(1);

try {
    // 1. Add columns to shifts table
    $stmt = $pdo->query("DESCRIBE shifts");
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (!in_array('break_duration_minutes', $columns)) {
        $pdo->exec("ALTER TABLE shifts ADD COLUMN break_duration_minutes INT DEFAULT 0");
        echo "Added break_duration_minutes to shifts.\n";
    }
    
    if (!in_array('working_days', $columns)) {
        $pdo->exec("ALTER TABLE shifts ADD COLUMN working_days VARCHAR(255) DEFAULT 'Mon,Tue,Wed,Thu,Fri'");
        echo "Added working_days to shifts.\n";
    }

    // 2. Add shift_id to employees table
    $stmt = $pdo->query("DESCRIBE employees");
    $empCols = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (!in_array('shift_id', $empCols)) {
        $pdo->exec("ALTER TABLE employees ADD COLUMN shift_id INT DEFAULT NULL");
        $pdo->exec("ALTER TABLE employees ADD CONSTRAINT fk_employee_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL");
        echo "Added shift_id to employees.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
