<?php

namespace App\Controller;

use App\Core\AttendanceStore;

class AttendanceController
{
    private $store;
    public function __construct() { $this->store = new AttendanceStore(); }

    public function list()
    {
        header('Content-Type: application/json');
        echo json_encode(['attendance' => $this->store->all()]);
    }

    public function clockIn()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        try {
            $user = \App\Core\Auth::currentUser();
            $tenantId = $user['tenant_id'] ?? null;
            $r = $this->store->clockIn($in['employee_id'] ?? '', $tenantId);
            echo json_encode(['record' => $r]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function clockOut()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        try {
            $user = \App\Core\Auth::currentUser();
            $tenantId = $user['tenant_id'] ?? null;
            $r = $this->store->clockOut($in['employee_id'] ?? '', $tenantId);
            echo json_encode(['record' => $r]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function openShift()
    {
        header('Content-Type: application/json');
        $employeeId = $_GET['employee_id'] ?? null;
        if (!$employeeId) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing employee id']);
            return;
        }

        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            $records = $this->store->all();
            foreach ($records as $r) {
                if ((string)($r['employee_id'] ?? '') === (string)$employeeId && empty($r['clock_out'])) {
                    echo json_encode(['open' => true, 'record' => $r]);
                    return;
                }
            }
            echo json_encode(['open' => false]);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        $tenantId = $user['tenant_id'] ?? null;
        if (!$tenantId) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) {
                $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
                $t->execute([$hint]);
                $row = $t->fetch();
                if ($row) $tenantId = (int)$row['id'];
            }
        }
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT id FROM employees WHERE id=? AND tenant_id=?');
        $empCheck->execute([(int)$employeeId, (int)$tenantId]);
        if (!$empCheck->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $stmt = $pdo->prepare('SELECT id, employee_id, clock_in, clock_out, duration_minutes, date, status, late_minutes, early_leave_minutes FROM attendance_records WHERE employee_id=? AND clock_out IS NULL ORDER BY id DESC LIMIT 1');
        $stmt->execute([(int)$employeeId]);
        $r = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$r) {
            echo json_encode(['open' => false]);
            return;
        }
        $r['id'] = (string)$r['id'];
        $r['employee_id'] = (string)$r['employee_id'];

        echo json_encode(['open' => true, 'record' => $r]);
    }

    public function process()
    {
        \App\Core\Auth::requireRole('perm:attendance.read');
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        $user = \App\Core\Auth::currentUser();
        $tenantId = $user['tenant_id'] ?? null;
        if (!$tenantId) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
        }
        if (!$tenantId) { http_response_code(400); echo json_encode(['error'=>'tenant not resolved']); return; }
        $in = json_decode(file_get_contents('php://input'), true);
        $start = $in['start_date'] ?? date('Y-m-d');
        $end = $in['end_date'] ?? $start;
        $proc = new \App\Core\AttendanceProcessor();
        $res = $proc->processRange($tenantId, $start, $end);
        echo json_encode(['processed' => $res]);
    }

    public function employeeStats()
    {
        header('Content-Type: application/json');
        $employeeId = $_GET['id'] ?? null;
        $month = $_GET['month'] ?? date('Y-m'); // Format YYYY-MM
        
        if (!$employeeId) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing employee id']);
            return;
        }

        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        // Get tenant from user context
        $user = \App\Core\Auth::currentUser();
        $tenantId = $user['tenant_id'] ?? null;
        if (!$tenantId) {
             // Try to resolve from hint if not in user context (unlikely for this endpoint but safe)
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
        }

        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        // Verify employee belongs to tenant
        $empCheck = $pdo->prepare('SELECT id FROM employees WHERE id=? AND tenant_id=?');
        $empCheck->execute([(int)$employeeId, (int)$tenantId]);
        if (!$empCheck->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        // Fetch Attendance Records (from attendance_records table)
        // Filter by month on date column
        $start = "$month-01";
        $end = date("Y-m-t", strtotime($start));

        $stmt = $pdo->prepare('SELECT * FROM attendance_records WHERE employee_id=? AND date BETWEEN ? AND ? ORDER BY date ASC');
        $stmt->execute([(int)$employeeId, $start, $end]);
        $attendance = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        // Fetch Leaves
        $lStmt = $pdo->prepare('SELECT * FROM leaves WHERE employee_id=? AND date BETWEEN ? AND ? ORDER BY date ASC');
        $lStmt->execute([(int)$employeeId, $start, $end]);
        $leaves = $lStmt->fetchAll(\PDO::FETCH_ASSOC);

        echo json_encode([
            'attendance' => $attendance,
            'leaves' => $leaves,
            'month' => $month
        ]);
    }
}
