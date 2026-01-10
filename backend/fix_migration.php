<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();
if (!$pdo) {
    echo "DB Connection Failed\n";
    exit(1);
}

echo "Connected to DB.\n";

try {
    // 1. Create shifts table
    $sql = file_get_contents(__DIR__ . '/migration_shifts.sql');
    // Remove comments and split? No, just run the CREATE TABLE part.
    // The file has comments and multiple statements potentially. 
    // Let's just use the PHP logic to be safe and robust.
    
    $createSql = "CREATE TABLE IF NOT EXISTS shifts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(128) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        late_tolerance_minutes INT DEFAULT 0,
        early_exit_tolerance_minutes INT DEFAULT 0,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB";
    
    $pdo->exec($createSql);
    echo "Shifts table created (or existed).\n";

    // 2. Add columns to attendance_records
    $stmt = $pdo->query("DESCRIBE attendance_records");
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $colsToAdd = [
        'status' => "VARCHAR(64) DEFAULT NULL",
        'late_minutes' => "INT DEFAULT 0",
        'early_leave_minutes' => "INT DEFAULT 0"
    ];

    foreach ($colsToAdd as $col => $def) {
        if (!in_array($col, $columns)) {
            $pdo->exec("ALTER TABLE attendance_records ADD COLUMN $col $def");
            echo "Added column $col.\n";
        } else {
            echo "Column $col already exists.\n";
        }
    }

    // 3. Verify
    $tables = $pdo->query("SHOW TABLES LIKE 'shifts'")->fetchAll();
    if (count($tables) > 0) {
        echo "VERIFICATION: Table 'shifts' FOUND.\n";
    } else {
        echo "VERIFICATION: Table 'shifts' NOT FOUND.\n";
    }

} catch (PDOException $e) {
    echo "SQL ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
