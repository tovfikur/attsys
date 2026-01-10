<?php
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Database;

$pdo = Database::get();
if (!$pdo) {
    echo "Database connection failed.\n";
    exit(1);
}

try {
    // Create shifts table
    $sql = "CREATE TABLE IF NOT EXISTS shifts (
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
    )";
    $pdo->exec($sql);
    echo "Table 'shifts' created or already exists.\n";

    // Add status column to attendance_records if not exists
    $stmt = $pdo->query("DESCRIBE attendance_records");
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('status', $columns)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN status VARCHAR(64) DEFAULT NULL");
        echo "Column 'status' added to 'attendance_records'.\n";
    } else {
        echo "Column 'status' already exists in 'attendance_records'.\n";
    }
    
    // Add late_minutes and early_leave_minutes for precise tracking
    if (!in_array('late_minutes', $columns)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN late_minutes INT DEFAULT 0");
        echo "Column 'late_minutes' added to 'attendance_records'.\n";
    }
    if (!in_array('early_leave_minutes', $columns)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN early_leave_minutes INT DEFAULT 0");
        echo "Column 'early_leave_minutes' added to 'attendance_records'.\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
