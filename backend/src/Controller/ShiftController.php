<?php

namespace App\Controller;

use App\Core\Auth;
use App\Core\Database;

class ShiftController
{
    private function getPdo(): ?\PDO
    {
        return Database::get();
    }

    private function getTenantId()
    {
        $user = Auth::currentUser();
        return $user['tenant_id'] ?? null;
    }

    private function getTenantKey(): string
    {
        $user = Auth::currentUser() ?? [];
        if (!empty($user['tenant_id'])) return (string)$user['tenant_id'];
        if (!empty($user['tenant_subdomain'])) return (string)$user['tenant_subdomain'];
        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        if ($hint) return strtolower((string)$hint);
        return 'default';
    }

    private function filePathForTenant(string $tenantKey): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9_-]/', '_', $tenantKey) ?: 'default';
        return __DIR__ . '/../../data/shifts_' . $safe . '.json';
    }

    private function readFileShifts(string $tenantKey): array
    {
        $file = $this->filePathForTenant($tenantKey);
        if (!file_exists($file)) return [];
        $decoded = json_decode((string)file_get_contents($file), true);
        return is_array($decoded) ? $decoded : [];
    }

    private function writeFileShifts(string $tenantKey, array $shifts): void
    {
        $file = $this->filePathForTenant($tenantKey);
        file_put_contents($file, json_encode(array_values($shifts), JSON_PRETTY_PRINT));
    }

    public function index()
    {
        // Auth::requireRole('tenant_owner', 'hr_admin'); // Handled by Router perm:attendance.read
        header('Content-Type: application/json');
        
        $pdo = $this->getPdo();
        if ($pdo) {
            $tenantId = $this->getTenantId();
            $stmt = $pdo->prepare("SELECT * FROM shifts WHERE tenant_id = ? ORDER BY created_at DESC");
            $stmt->execute([$tenantId]);
            $shifts = $stmt->fetchAll();
            echo json_encode(['shifts' => $shifts]);
            return;
        }

        $tenantKey = $this->getTenantKey();
        $shifts = $this->readFileShifts($tenantKey);
        usort($shifts, fn($a, $b) => strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? '')));
        echo json_encode(['shifts' => $shifts]);
    }

    public function create()
    {
        // Auth::requireRole('tenant_owner', 'hr_admin'); // Handled by Router perm:attendance.write
        header('Content-Type: application/json');
        
        $data = json_decode(file_get_contents('php://input'), true);
        $pdo = $this->getPdo();
        
        // Basic validation
        if (empty($data['name']) || empty($data['start_time']) || empty($data['end_time'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            return;
        }

        if ($pdo) {
            $tenantId = $this->getTenantId();

            if (!empty($data['is_default'])) {
                $upd = $pdo->prepare("UPDATE shifts SET is_default = 0 WHERE tenant_id = ?");
                $upd->execute([$tenantId]);
            }

            $stmt = $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, break_duration_minutes, working_days, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $tenantId,
                $data['name'],
                $data['start_time'],
                $data['end_time'],
                $data['late_tolerance_minutes'] ?? 0,
                $data['early_exit_tolerance_minutes'] ?? 0,
                $data['break_duration_minutes'] ?? 0,
                $data['working_days'] ?? 'Mon,Tue,Wed,Thu,Fri',
                !empty($data['is_default']) ? 1 : 0
            ]);

            echo json_encode(['id' => $pdo->lastInsertId(), 'message' => 'Shift created']);
            return;
        }

        $tenantKey = $this->getTenantKey();
        $shifts = $this->readFileShifts($tenantKey);
        $maxId = 0;
        foreach ($shifts as $s) {
            $id = (int)($s['id'] ?? 0);
            if ($id > $maxId) $maxId = $id;
        }
        $newId = $maxId + 1;

        if (!empty($data['is_default'])) {
            foreach ($shifts as &$s) $s['is_default'] = false;
            unset($s);
        }

        $new = [
            'id' => $newId,
            'tenant_id' => $tenantKey,
            'name' => (string)$data['name'],
            'start_time' => (string)$data['start_time'],
            'end_time' => (string)$data['end_time'],
            'late_tolerance_minutes' => (int)($data['late_tolerance_minutes'] ?? 0),
            'early_exit_tolerance_minutes' => (int)($data['early_exit_tolerance_minutes'] ?? 0),
            'break_duration_minutes' => (int)($data['break_duration_minutes'] ?? 0),
            'working_days' => (string)($data['working_days'] ?? 'Mon,Tue,Wed,Thu,Fri'),
            'is_default' => !empty($data['is_default']),
            'created_at' => date('c'),
        ];
        $shifts[] = $new;
        $this->writeFileShifts($tenantKey, $shifts);
        echo json_encode(['id' => $newId, 'message' => 'Shift created']);
    }

    public function update()
    {
        // Auth::requireRole('tenant_owner', 'hr_admin'); // Handled by Router perm:attendance.write
        header('Content-Type: application/json');
        
        $data = json_decode(file_get_contents('php://input'), true);
        $pdo = $this->getPdo();
        
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing ID']);
            return;
        }

        if ($pdo) {
            $tenantId = $this->getTenantId();

            $check = $pdo->prepare("SELECT id FROM shifts WHERE id = ? AND tenant_id = ?");
            $check->execute([$id, $tenantId]);
            if (!$check->fetch()) {
                http_response_code(404);
                echo json_encode(['error' => 'Shift not found']);
                return;
            }

            if (!empty($data['is_default'])) {
                $upd = $pdo->prepare("UPDATE shifts SET is_default = 0 WHERE tenant_id = ?");
                $upd->execute([$tenantId]);
            }

            $fields = [];
            $params = [];
            
            $allowed = ['name', 'start_time', 'end_time', 'late_tolerance_minutes', 'early_exit_tolerance_minutes', 'break_duration_minutes', 'working_days', 'is_default'];
            
            foreach ($allowed as $field) {
                if (isset($data[$field])) {
                    $fields[] = "$field = ?";
                    $params[] = $field === 'is_default' ? ($data[$field] ? 1 : 0) : $data[$field];
                }
            }

            if (empty($fields)) {
                echo json_encode(['message' => 'No changes']);
                return;
            }

            $params[] = $id;
            $sql = "UPDATE shifts SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            echo json_encode(['message' => 'Shift updated']);
            return;
        }

        $tenantKey = $this->getTenantKey();
        $shifts = $this->readFileShifts($tenantKey);
        $intId = (int)$id;
        $found = false;
        foreach ($shifts as &$s) {
            if ((int)($s['id'] ?? 0) !== $intId) continue;
            $found = true;
            if (isset($data['name'])) $s['name'] = (string)$data['name'];
            if (isset($data['start_time'])) $s['start_time'] = (string)$data['start_time'];
            if (isset($data['end_time'])) $s['end_time'] = (string)$data['end_time'];
            if (isset($data['late_tolerance_minutes'])) $s['late_tolerance_minutes'] = (int)$data['late_tolerance_minutes'];
            if (isset($data['early_exit_tolerance_minutes'])) $s['early_exit_tolerance_minutes'] = (int)$data['early_exit_tolerance_minutes'];
            if (isset($data['break_duration_minutes'])) $s['break_duration_minutes'] = (int)$data['break_duration_minutes'];
            if (isset($data['working_days'])) $s['working_days'] = (string)$data['working_days'];
            if (isset($data['is_default'])) $s['is_default'] = (bool)$data['is_default'];
        }
        unset($s);
        if (!$found) {
            http_response_code(404);
            echo json_encode(['error' => 'Shift not found']);
            return;
        }
        if (!empty($data['is_default'])) {
            foreach ($shifts as &$s) {
                if ((int)($s['id'] ?? 0) !== $intId) $s['is_default'] = false;
            }
            unset($s);
        }
        $this->writeFileShifts($tenantKey, $shifts);
        echo json_encode(['message' => 'Shift updated']);
    }

    public function delete()
    {
        // Auth::requireRole('tenant_owner', 'hr_admin'); // Handled by Router perm:attendance.write
        header('Content-Type: application/json');
        
        $pdo = $this->getPdo();
        $id = $_GET['id'] ?? null;
        if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing ID']); return; }

        if ($pdo) {
            $tenantId = $this->getTenantId();
            $check = $pdo->prepare("SELECT id, is_default FROM shifts WHERE id = ? AND tenant_id = ?");
            $check->execute([$id, $tenantId]);
            $shift = $check->fetch();
            
            if (!$shift) {
                http_response_code(404);
                echo json_encode(['error' => 'Shift not found']);
                return;
            }

            if ($shift['is_default']) {
                http_response_code(400);
                echo json_encode(['error' => 'Cannot delete default shift']);
                return;
            }

            $inUseStmt = $pdo->prepare("SELECT COUNT(*) FROM employees WHERE tenant_id = ? AND shift_id = ?");
            $inUseStmt->execute([$tenantId, $id]);
            $inUse = (int)$inUseStmt->fetchColumn();
            if ($inUse > 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Shift is assigned to employees']);
                return;
            }

            $pdo->prepare("DELETE FROM shifts WHERE id = ?")->execute([$id]);
            echo json_encode(['message' => 'Shift deleted']);
            return;
        }

        $tenantKey = $this->getTenantKey();
        $shifts = $this->readFileShifts($tenantKey);
        $intId = (int)$id;
        $target = null;
        foreach ($shifts as $s) {
            if ((int)($s['id'] ?? 0) === $intId) { $target = $s; break; }
        }
        if (!$target) { http_response_code(404); echo json_encode(['error' => 'Shift not found']); return; }
        if (!empty($target['is_default'])) { http_response_code(400); echo json_encode(['error' => 'Cannot delete default shift']); return; }
        $shifts = array_values(array_filter($shifts, fn($s) => (int)($s['id'] ?? 0) !== $intId));
        $this->writeFileShifts($tenantKey, $shifts);
        echo json_encode(['message' => 'Shift deleted']);
    }

    public function assign()
    {
        // Auth::requireRole('tenant_owner', 'hr_admin'); // Handled by Router perm:attendance.write
        header('Content-Type: application/json');
        
        $data = json_decode(file_get_contents('php://input'), true);
        $pdo = $this->getPdo();
        
        $shiftId = $data['shift_id'] ?? null;
        $employeeIds = $data['employee_ids'] ?? [];

        if (!$shiftId || empty($employeeIds)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing shift or employees']);
            return;
        }

        if ($pdo) {
            $tenantId = $this->getTenantId();
            $check = $pdo->prepare("SELECT id FROM shifts WHERE id = ? AND tenant_id = ?");
            $check->execute([$shiftId, $tenantId]);
            if (!$check->fetch()) {
                http_response_code(404);
                echo json_encode(['error' => 'Shift not found']);
                return;
            }

            $placeholders = implode(',', array_fill(0, count($employeeIds), '?'));
            $sql = "UPDATE employees SET shift_id = ? WHERE id IN ($placeholders) AND tenant_id = ?";
            $params = array_merge([$shiftId], $employeeIds, [$tenantId]);
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            echo json_encode(['message' => 'Shift assigned successfully']);
            return;
        }

        $tenantKey = $this->getTenantKey();
        $shifts = $this->readFileShifts($tenantKey);
        $intShiftId = (int)$shiftId;
        $hasShift = false;
        foreach ($shifts as $s) {
            if ((int)($s['id'] ?? 0) === $intShiftId) { $hasShift = true; break; }
        }
        if (!$hasShift) { http_response_code(404); echo json_encode(['error' => 'Shift not found']); return; }

        $employeesFile = __DIR__ . '/../../data/employees.json';
        if (file_exists($employeesFile)) {
            $employees = json_decode((string)file_get_contents($employeesFile), true);
            if (is_array($employees)) {
                $idSet = array_flip(array_map('strval', $employeeIds));
                foreach ($employees as &$e) {
                    if (isset($e['id']) && isset($idSet[(string)$e['id']])) $e['shift_id'] = $intShiftId;
                }
                unset($e);
                file_put_contents($employeesFile, json_encode($employees, JSON_PRETTY_PRINT));
            }
        }

        echo json_encode(['message' => 'Shift assigned successfully']);
    }
}
