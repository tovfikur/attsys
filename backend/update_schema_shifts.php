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
    $pdo->exec("CREATE TABLE IF NOT EXISTS shifts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(128) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        late_tolerance_minutes INT DEFAULT 0,
        early_exit_tolerance_minutes INT DEFAULT 0,
        break_duration_minutes INT DEFAULT 0,
        working_days VARCHAR(255) DEFAULT 'Mon,Tue,Wed,Thu,Fri',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB");

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

    $stmt = $pdo->query("DESCRIBE employees");
    $empCols = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('shift_id', $empCols)) {
        $pdo->exec("ALTER TABLE employees ADD COLUMN shift_id INT DEFAULT NULL");
        echo "Added shift_id to employees.\n";
    }

    $fkNameStmt = $pdo->query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'shift_id' AND REFERENCED_TABLE_NAME = 'shifts' LIMIT 1");
    $fkName = $fkNameStmt ? $fkNameStmt->fetchColumn() : null;
    if ($fkName) {
        try {
            $pdo->exec("ALTER TABLE employees DROP FOREIGN KEY `" . str_replace('`', '', (string)$fkName) . "`");
        } catch (\Throwable $e) {
        }
    }
    try {
        $pdo->exec("ALTER TABLE employees ADD CONSTRAINT fk_employee_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT");
        echo "Added fk_employee_shift.\n";
    } catch (\Throwable $e) {
    }

    $stmt = $pdo->query("DESCRIBE attendance_records");
    $arCols = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('status', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN status VARCHAR(64) DEFAULT NULL");
        echo "Added status to attendance_records.\n";
    }
    if (!in_array('late_minutes', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN late_minutes INT DEFAULT 0");
        echo "Added late_minutes to attendance_records.\n";
    }
    if (!in_array('early_leave_minutes', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN early_leave_minutes INT DEFAULT 0");
        echo "Added early_leave_minutes to attendance_records.\n";
    }
    if (!in_array('overtime_minutes', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN overtime_minutes INT NOT NULL DEFAULT 0");
        echo "Added overtime_minutes to attendance_records.\n";
    }

    $stmt = $pdo->query("DESCRIBE attendance_days");
    $ad = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    $adCols = array_map(fn($r) => $r['Field'], $ad);
    $statusType = null;
    foreach ($ad as $r) {
        if (($r['Field'] ?? null) === 'status') { $statusType = strtolower((string)$r['Type']); break; }
    }
    if ($statusType && str_contains($statusType, 'varchar(32)')) {
        $pdo->exec("ALTER TABLE attendance_days MODIFY status VARCHAR(64) NOT NULL DEFAULT 'Present'");
        echo "Updated attendance_days.status to VARCHAR(64).\n";
    }
    if (!in_array('late_minutes', $adCols)) {
        $pdo->exec("ALTER TABLE attendance_days ADD COLUMN late_minutes INT NOT NULL DEFAULT 0");
        echo "Added late_minutes to attendance_days.\n";
    }
    if (!in_array('early_leave_minutes', $adCols)) {
        $pdo->exec("ALTER TABLE attendance_days ADD COLUMN early_leave_minutes INT NOT NULL DEFAULT 0");
        echo "Added early_leave_minutes to attendance_days.\n";
    }
    if (!in_array('overtime_minutes', $adCols)) {
        $pdo->exec("ALTER TABLE attendance_days ADD COLUMN overtime_minutes INT NOT NULL DEFAULT 0");
        echo "Added overtime_minutes to attendance_days.\n";
    }

    $tenantIds = $pdo->query("SELECT id FROM tenants")->fetchAll(\PDO::FETCH_COLUMN);
    $defaultShiftStmt = $pdo->prepare("SELECT id FROM shifts WHERE tenant_id = ? AND is_default = 1 LIMIT 1");
    $insertDefaultShiftStmt = $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, break_duration_minutes, working_days, is_default) VALUES (?, 'Standard Shift', '09:00:00', '17:00:00', 15, 15, 0, 'Mon,Tue,Wed,Thu,Fri', 1)");
    $assignShiftStmt = $pdo->prepare("UPDATE employees SET shift_id = ? WHERE tenant_id = ? AND shift_id IS NULL");

    foreach ($tenantIds as $tid) {
        $tid = (int)$tid;
        $defaultShiftStmt->execute([$tid]);
        $sid = $defaultShiftStmt->fetchColumn();
        if (!$sid) {
            $insertDefaultShiftStmt->execute([$tid]);
            $sid = (int)$pdo->lastInsertId();
        }
        $assignShiftStmt->execute([(int)$sid, $tid]);
    }

    $nullCount = (int)$pdo->query("SELECT COUNT(*) FROM employees WHERE shift_id IS NULL")->fetchColumn();
    if ($nullCount === 0) {
        try {
            $pdo->exec("ALTER TABLE employees MODIFY shift_id INT NOT NULL");
            echo "Enforced employees.shift_id NOT NULL.\n";
        } catch (\Throwable $e) {
        }
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
