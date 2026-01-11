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
    if (!in_array('clock_in_method', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_in_method VARCHAR(32) DEFAULT NULL");
        echo "Added clock_in_method to attendance_records.\n";
    }
    if (!in_array('clock_out_method', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_out_method VARCHAR(32) DEFAULT NULL");
        echo "Added clock_out_method to attendance_records.\n";
    }
    if (!in_array('clock_in_lat', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_in_lat DOUBLE DEFAULT NULL");
        echo "Added clock_in_lat to attendance_records.\n";
    }
    if (!in_array('clock_in_lng', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_in_lng DOUBLE DEFAULT NULL");
        echo "Added clock_in_lng to attendance_records.\n";
    }
    if (!in_array('clock_in_accuracy_m', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_in_accuracy_m INT DEFAULT NULL");
        echo "Added clock_in_accuracy_m to attendance_records.\n";
    }
    if (!in_array('clock_out_lat', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_out_lat DOUBLE DEFAULT NULL");
        echo "Added clock_out_lat to attendance_records.\n";
    }
    if (!in_array('clock_out_lng', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_out_lng DOUBLE DEFAULT NULL");
        echo "Added clock_out_lng to attendance_records.\n";
    }
    if (!in_array('clock_out_accuracy_m', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_out_accuracy_m INT DEFAULT NULL");
        echo "Added clock_out_accuracy_m to attendance_records.\n";
    }
    if (!in_array('clock_in_device_id', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_in_device_id VARCHAR(64) DEFAULT NULL");
        echo "Added clock_in_device_id to attendance_records.\n";
    }
    if (!in_array('clock_out_device_id', $arCols)) {
        $pdo->exec("ALTER TABLE attendance_records ADD COLUMN clock_out_device_id VARCHAR(64) DEFAULT NULL");
        echo "Added clock_out_device_id to attendance_records.\n";
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS biometric_evidence (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        employee_id INT NOT NULL,
        attendance_record_id INT NULL,
        event_type VARCHAR(16) NOT NULL,
        modality VARCHAR(24) NOT NULL,
        sha256 CHAR(64) NOT NULL,
        matched TINYINT(1) NOT NULL DEFAULT 0,
        latitude DOUBLE DEFAULT NULL,
        longitude DOUBLE DEFAULT NULL,
        accuracy_m INT DEFAULT NULL,
        mime VARCHAR(96) NOT NULL,
        image LONGBLOB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_biometric_evidence_tenant_employee (tenant_id, employee_id, created_at),
        KEY idx_biometric_evidence_attendance_record (attendance_record_id)
    ) ENGINE=InnoDB");

    $stmt = $pdo->query("DESCRIBE biometric_evidence");
    $beCols = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('latitude', $beCols)) {
        $pdo->exec("ALTER TABLE biometric_evidence ADD COLUMN latitude DOUBLE DEFAULT NULL");
        echo "Added latitude to biometric_evidence.\n";
    }
    if (!in_array('longitude', $beCols)) {
        $pdo->exec("ALTER TABLE biometric_evidence ADD COLUMN longitude DOUBLE DEFAULT NULL");
        echo "Added longitude to biometric_evidence.\n";
    }
    if (!in_array('accuracy_m', $beCols)) {
        $pdo->exec("ALTER TABLE biometric_evidence ADD COLUMN accuracy_m INT DEFAULT NULL");
        echo "Added accuracy_m to biometric_evidence.\n";
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
