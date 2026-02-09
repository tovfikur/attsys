<?php

namespace App\Controller;

use App\Core\Auth;
use App\Core\Database;

class RosterController
{
    private function getPdo()
    {
        return Database::get();
    }

    private function getTenantId()
    {
        $user = Auth::currentUser();
        $tenantId = (int)($user['tenant_id'] ?? 0);
        if ($tenantId <= 0) {
            $pdo = $this->getPdo();
            if ($pdo) {
                $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
                if ($hint) {
                    $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
                    $t->execute([$hint]);
                    $row = $t->fetch();
                    if ($row) $tenantId = (int)$row['id'];
                }
            }
        }
        return $tenantId;
    }

    // ==================== ROSTER TYPES ====================

    public function listTypes()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $stmt = $pdo->prepare('SELECT * FROM roster_types WHERE tenant_id = ? ORDER BY name ASC');
        $stmt->execute([$tenantId]);
        $types = $stmt->fetchAll();

        echo json_encode(['roster_types' => $types]);
    }

    public function createType()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $name = trim($data['name'] ?? '');
        $description = trim($data['description'] ?? '');
        $colorCode = trim($data['color_code'] ?? '#1976d2');
        $defaultStartTime = $data['default_start_time'] ?? null;
        $defaultEndTime = $data['default_end_time'] ?? null;
        $isActive = isset($data['is_active']) ? (int)$data['is_active'] : 1;

        if ($name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Roster type name is required']);
            return;
        }

        // Check for duplicate name
        $checkStmt = $pdo->prepare('SELECT id FROM roster_types WHERE tenant_id = ? AND name = ?');
        $checkStmt->execute([$tenantId, $name]);
        if ($checkStmt->fetch()) {
            http_response_code(400);
            echo json_encode(['error' => 'Roster type name already exists']);
            return;
        }

        $stmt = $pdo->prepare('INSERT INTO roster_types (tenant_id, name, description, color_code, default_start_time, default_end_time, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$tenantId, $name, $description, $colorCode, $defaultStartTime, $defaultEndTime, $isActive]);

        $id = (int)$pdo->lastInsertId();
        $getStmt = $pdo->prepare('SELECT * FROM roster_types WHERE id = ?');
        $getStmt->execute([$id]);
        $type = $getStmt->fetch();

        echo json_encode(['roster_type' => $type]);
    }

    public function updateType()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $id = (int)($data['id'] ?? 0);
        $name = trim($data['name'] ?? '');
        $description = trim($data['description'] ?? '');
        $colorCode = trim($data['color_code'] ?? '#1976d2');
        $defaultStartTime = $data['default_start_time'] ?? null;
        $defaultEndTime = $data['default_end_time'] ?? null;
        $isActive = isset($data['is_active']) ? (int)$data['is_active'] : 1;

        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Roster type ID is required']);
            return;
        }

        if ($name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Roster type name is required']);
            return;
        }

        // Verify type exists and belongs to tenant
        $checkStmt = $pdo->prepare('SELECT id FROM roster_types WHERE id = ? AND tenant_id = ?');
        $checkStmt->execute([$id, $tenantId]);
        if (!$checkStmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Roster type not found']);
            return;
        }

        // Check for duplicate name (excluding current type)
        $dupStmt = $pdo->prepare('SELECT id FROM roster_types WHERE tenant_id = ? AND name = ? AND id != ?');
        $dupStmt->execute([$tenantId, $name, $id]);
        if ($dupStmt->fetch()) {
            http_response_code(400);
            echo json_encode(['error' => 'Roster type name already exists']);
            return;
        }

        $stmt = $pdo->prepare('UPDATE roster_types SET name = ?, description = ?, color_code = ?, default_start_time = ?, default_end_time = ?, is_active = ? WHERE id = ? AND tenant_id = ?');
        $stmt->execute([$name, $description, $colorCode, $defaultStartTime, $defaultEndTime, $isActive, $id, $tenantId]);

        $getStmt = $pdo->prepare('SELECT * FROM roster_types WHERE id = ?');
        $getStmt->execute([$id]);
        $type = $getStmt->fetch();

        echo json_encode(['roster_type' => $type]);
    }

    public function deleteType()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $id = (int)($data['id'] ?? 0);

        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Roster type ID is required']);
            return;
        }

        // Verify type exists and belongs to tenant
        $checkStmt = $pdo->prepare('SELECT id FROM roster_types WHERE id = ? AND tenant_id = ?');
        $checkStmt->execute([$id, $tenantId]);
        if (!$checkStmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Roster type not found']);
            return;
        }

        // Check if type is in use
        $inUseStmt = $pdo->prepare('SELECT COUNT(*) FROM roster_assignments WHERE roster_type_id = ?');
        $inUseStmt->execute([$id]);
        $count = (int)$inUseStmt->fetchColumn();

        if ($count > 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Cannot delete roster type that has assignments']);
            return;
        }

        $stmt = $pdo->prepare('DELETE FROM roster_types WHERE id = ? AND tenant_id = ?');
        $stmt->execute([$id, $tenantId]);

        echo json_encode(['message' => 'Roster type deleted successfully']);
    }

    // ==================== ROSTER ASSIGNMENTS ====================

    public function listAssignments()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $startDate = $_GET['start_date'] ?? null;
        $endDate = $_GET['end_date'] ?? null;
        $employeeId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
        $rosterTypeId = isset($_GET['roster_type_id']) ? (int)$_GET['roster_type_id'] : null;

        $sql = 'SELECT ra.*, rt.name AS roster_type_name, rt.color_code, e.name AS employee_name, e.code AS employee_code 
                FROM roster_assignments ra 
                JOIN roster_types rt ON rt.id = ra.roster_type_id 
                JOIN employees e ON e.id = ra.employee_id 
                WHERE ra.tenant_id = ?';
        $params = [$tenantId];

        if ($startDate) {
            $sql .= ' AND ra.duty_date >= ?';
            $params[] = $startDate;
        }

        if ($endDate) {
            $sql .= ' AND ra.duty_date <= ?';
            $params[] = $endDate;
        }

        if ($employeeId) {
            $sql .= ' AND ra.employee_id = ?';
            $params[] = $employeeId;
        }

        if ($rosterTypeId) {
            $sql .= ' AND ra.roster_type_id = ?';
            $params[] = $rosterTypeId;
        }

        $sql .= ' ORDER BY ra.duty_date DESC, ra.start_time ASC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $assignments = $stmt->fetchAll();

        echo json_encode(['roster_assignments' => $assignments]);
    }

    public function calendar()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $month = $_GET['month'] ?? date('Y-m');
        $startDate = $month . '-01';
        $endDate = date('Y-m-t', strtotime($startDate));

        $sql = 'SELECT ra.*, rt.name AS roster_type_name, rt.color_code, e.name AS employee_name, e.code AS employee_code 
                FROM roster_assignments ra 
                JOIN roster_types rt ON rt.id = ra.roster_type_id 
                JOIN employees e ON e.id = ra.employee_id 
                WHERE ra.tenant_id = ? AND ra.duty_date >= ? AND ra.duty_date <= ?
                ORDER BY ra.duty_date ASC, ra.start_time ASC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$tenantId, $startDate, $endDate]);
        $assignments = $stmt->fetchAll();

        echo json_encode(['calendar_data' => $assignments, 'month' => $month]);
    }

    public function employeeAssignments()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $user = Auth::currentUser();
        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        // If employee role, only show their own assignments
        $employeeId = null;
        if (($user['role'] ?? '') === 'employee') {
            $employeeId = (int)($user['employee_id'] ?? 0);
            if ($employeeId <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee context missing']);
                return;
            }
        } else {
            $employeeId = isset($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
        }

        if (!$employeeId) {
            http_response_code(400);
            echo json_encode(['error' => 'Employee ID is required']);
            return;
        }

        $sql = 'SELECT ra.*, rt.name AS roster_type_name, rt.color_code, rt.description 
                FROM roster_assignments ra 
                JOIN roster_types rt ON rt.id = ra.roster_type_id 
                WHERE ra.tenant_id = ? AND ra.employee_id = ? 
                ORDER BY ra.duty_date DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$tenantId, $employeeId]);
        $assignments = $stmt->fetchAll();

        echo json_encode(['roster_assignments' => $assignments]);
    }

    public function createAssignment()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $rosterTypeId = (int)($data['roster_type_id'] ?? 0);
        $employeeId = (int)($data['employee_id'] ?? 0);
        $dutyDate = $data['duty_date'] ?? '';
        $startTime = $data['start_time'] ?? null;
        $endTime = $data['end_time'] ?? null;
        $location = trim($data['location'] ?? '');
        $notes = trim($data['notes'] ?? '');
        $status = trim($data['status'] ?? 'scheduled');

        if ($rosterTypeId <= 0 || $employeeId <= 0 || $dutyDate === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Roster type, employee, and duty date are required']);
            return;
        }

        // Verify roster type exists and belongs to tenant
        $typeStmt = $pdo->prepare('SELECT default_start_time, default_end_time FROM roster_types WHERE id = ? AND tenant_id = ?');
        $typeStmt->execute([$rosterTypeId, $tenantId]);
        $type = $typeStmt->fetch();
        if (!$type) {
            http_response_code(404);
            echo json_encode(['error' => 'Roster type not found']);
            return;
        }

        // Use default times if not provided
        if (!$startTime && $type['default_start_time']) {
            $startTime = $type['default_start_time'];
        }
        if (!$endTime && $type['default_end_time']) {
            $endTime = $type['default_end_time'];
        }

        // Verify employee exists and belongs to tenant
        $empStmt = $pdo->prepare('SELECT id FROM employees WHERE id = ? AND tenant_id = ?');
        $empStmt->execute([$employeeId, $tenantId]);
        if (!$empStmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        // Check for duplicate assignment
        $dupStmt = $pdo->prepare('SELECT id FROM roster_assignments WHERE tenant_id = ? AND employee_id = ? AND duty_date = ? AND roster_type_id = ?');
        $dupStmt->execute([$tenantId, $employeeId, $dutyDate, $rosterTypeId]);
        if ($dupStmt->fetch()) {
            http_response_code(400);
            echo json_encode(['error' => 'Employee already assigned to this roster duty on this date']);
            return;
        }

        $stmt = $pdo->prepare('INSERT INTO roster_assignments (tenant_id, roster_type_id, employee_id, duty_date, start_time, end_time, location, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$tenantId, $rosterTypeId, $employeeId, $dutyDate, $startTime, $endTime, $location, $notes, $status]);

        $id = (int)$pdo->lastInsertId();
        $getStmt = $pdo->prepare('SELECT ra.*, rt.name AS roster_type_name, rt.color_code, e.name AS employee_name, e.code AS employee_code FROM roster_assignments ra JOIN roster_types rt ON rt.id = ra.roster_type_id JOIN employees e ON e.id = ra.employee_id WHERE ra.id = ?');
        $getStmt->execute([$id]);
        $assignment = $getStmt->fetch();

        echo json_encode(['roster_assignment' => $assignment]);
    }

    public function updateAssignment()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $id = (int)($data['id'] ?? 0);
        $dutyDate = $data['duty_date'] ?? '';
        $startTime = $data['start_time'] ?? null;
        $endTime = $data['end_time'] ?? null;
        $location = trim($data['location'] ?? '');
        $notes = trim($data['notes'] ?? '');
        $status = trim($data['status'] ?? 'scheduled');

        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Assignment ID is required']);
            return;
        }

        // Verify assignment exists and belongs to tenant
        $checkStmt = $pdo->prepare('SELECT id FROM roster_assignments WHERE id = ? AND tenant_id = ?');
        $checkStmt->execute([$id, $tenantId]);
        if (!$checkStmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Roster assignment not found']);
            return;
        }

        $stmt = $pdo->prepare('UPDATE roster_assignments SET duty_date = ?, start_time = ?, end_time = ?, location = ?, notes = ?, status = ? WHERE id = ? AND tenant_id = ?');
        $stmt->execute([$dutyDate, $startTime, $endTime, $location, $notes, $status, $id, $tenantId]);

        $getStmt = $pdo->prepare('SELECT ra.*, rt.name AS roster_type_name, rt.color_code, e.name AS employee_name, e.code AS employee_code FROM roster_assignments ra JOIN roster_types rt ON rt.id = ra.roster_type_id JOIN employees e ON e.id = ra.employee_id WHERE ra.id = ?');
        $getStmt->execute([$id]);
        $assignment = $getStmt->fetch();

        echo json_encode(['roster_assignment' => $assignment]);
    }

    public function deleteAssignment()
    {
        header('Content-Type: application/json');
        $pdo = $this->getPdo();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database unavailable']);
            return;
        }

        $tenantId = $this->getTenantId();
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $id = (int)($data['id'] ?? 0);

        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Assignment ID is required']);
            return;
        }

        // Verify assignment exists and belongs to tenant
        $checkStmt = $pdo->prepare('SELECT id FROM roster_assignments WHERE id = ? AND tenant_id = ?');
        $checkStmt->execute([$id, $tenantId]);
        if (!$checkStmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Roster assignment not found']);
            return;
        }

        $stmt = $pdo->prepare('DELETE FROM roster_assignments WHERE id = ? AND tenant_id = ?');
        $stmt->execute([$id, $tenantId]);

        echo json_encode(['message' => 'Roster assignment deleted successfully']);
    }
}
