<?php

namespace App\Controller;

use App\Core\AttendanceStore;

class AttendanceController
{
    private $store;
    public function __construct() { $this->store = new AttendanceStore(); }

    private function normalizeDate(?string $raw): ?string
    {
        if (!is_string($raw)) return null;
        $v = trim($raw);
        if ($v === '') return null;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) return $v;
        if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $v, $m)) return $m[3] . '-' . $m[2] . '-' . $m[1];
        if (preg_match('/^(\d{2})-(\d{2})-(\d{4})$/', $v, $m)) return $m[3] . '-' . $m[2] . '-' . $m[1];
        if (preg_match('/^(\d{4})\/(\d{2})\/(\d{2})$/', $v, $m)) return $m[1] . '-' . $m[2] . '-' . $m[3];
        return null;
    }

    private function normalizeRange(string $start, string $end): array
    {
        $s = $this->normalizeDate($start) ?? date('Y-m-d');
        $e = $this->normalizeDate($end) ?? $s;
        if ($s > $e) {
            $tmp = $s;
            $s = $e;
            $e = $tmp;
        }
        return [$s, $e];
    }

    private function toTenantTime(?string $utcDateTime): ?string
    {
        if (!is_string($utcDateTime)) return null;
        $utcDateTime = trim($utcDateTime);
        if ($utcDateTime === '') return null;
        try {
            $dt = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $utcDateTime, new \DateTimeZone('UTC'));
            if (!$dt) return $utcDateTime;
            return $dt->setTimezone(new \DateTimeZone('Asia/Dhaka'))->format('Y-m-d H:i:s');
        } catch (\Exception $e) {
            return $utcDateTime;
        }
    }

    private function resolveTenantId($pdo): ?int
    {
        $user = \App\Core\Auth::currentUser() ?? [];
        $tenantId = $user['tenant_id'] ?? null;
        if ($tenantId) return (int)$tenantId;

        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        if (!$hint) return null;
        $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
        $t->execute([$hint]);
        $row = $t->fetch();
        return $row ? (int)$row['id'] : null;
    }

    public function list()
    {
        header('Content-Type: application/json');
        $start = $_GET['start'] ?? null;
        $end = $_GET['end'] ?? null;
        $employeeId = $_GET['employee_id'] ?? null;
        $limit = $_GET['limit'] ?? 5000;
        echo json_encode(['attendance' => $this->store->all($start, $end, $employeeId, $limit)]);
    }

    public function dashboard()
    {
        \App\Core\Auth::requireRole('perm:attendance.read');
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            echo json_encode(['employees' => [], 'attendance' => $this->store->all(), 'days' => []]);
            return;
        }

        $startRaw = $_GET['start'] ?? date('Y-m-d');
        $endRaw = $_GET['end'] ?? $startRaw;
        [$start, $end] = $this->normalizeRange((string)$startRaw, (string)$endRaw);
        $limit = $_GET['limit'] ?? 10000;

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $eStmt = $pdo->prepare('SELECT id, tenant_id, name, code, status, created_at FROM employees WHERE tenant_id=? ORDER BY id DESC');
        $eStmt->execute([(int)$tenantId]);
        $employees = array_map(fn($r) => [
            'id' => (string)$r['id'],
            'tenant_id' => (string)$r['tenant_id'],
            'name' => $r['name'],
            'code' => $r['code'],
            'status' => $r['status'],
            'created_at' => $r['created_at']
        ], $eStmt->fetchAll());

        $attendance = $this->store->all($start, $end, null, $limit);

        $ensureDays = filter_var($_GET['ensure_days'] ?? '0', \FILTER_VALIDATE_BOOL);
        if ($ensureDays) {
            $localTz = new \DateTimeZone('Asia/Dhaka');
            $utcTz = new \DateTimeZone('UTC');
            $rangeStartUtc = (new \DateTimeImmutable($start . ' 00:00:00', $localTz))->setTimezone($utcTz)->format('Y-m-d H:i:s');
            $rangeEndUtc = (new \DateTimeImmutable($end . ' 23:59:59', $localTz))->setTimezone($utcTz)->format('Y-m-d H:i:s');

            $rawExistsStmt = $pdo->prepare('SELECT 1 FROM raw_events WHERE tenant_id=? AND occurred_at_utc BETWEEN ? AND ? LIMIT 1');
            $rawExistsStmt->execute([(int)$tenantId, $rangeStartUtc, $rangeEndUtc]);
            $hasRaw = (bool)$rawExistsStmt->fetchColumn();

            if ($hasRaw) {
                $proc = new \App\Core\AttendanceProcessor();
                try {
                    $proc->processRange((int)$tenantId, $start, $end);
                } catch (\Exception $e) {
                }
            }
        }

        $dStmt = $pdo->prepare('SELECT employee_id, date, in_time, out_time, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, status FROM attendance_days WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date DESC, employee_id DESC');
        $dStmt->execute([(int)$tenantId, $start, $end]);
        $days = array_map(fn($r) => [
            'employee_id' => (int)$r['employee_id'],
            'date' => $r['date'],
            'in_time' => $this->toTenantTime($r['in_time'] ?? null),
            'out_time' => $this->toTenantTime($r['out_time'] ?? null),
            'worked_minutes' => (int)$r['worked_minutes'],
            'late_minutes' => (int)($r['late_minutes'] ?? 0),
            'early_leave_minutes' => (int)($r['early_leave_minutes'] ?? 0),
            'overtime_minutes' => (int)($r['overtime_minutes'] ?? 0),
            'status' => $r['status']
        ], $dStmt->fetchAll());

        echo json_encode(['employees' => $employees, 'attendance' => $attendance, 'days' => $days]);
    }

    public function days()
    {
        \App\Core\Auth::requireRole('perm:attendance.read');
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            echo json_encode(['days' => []]);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $start = $_GET['start'] ?? date('Y-m-d');
        $end = $_GET['end'] ?? $start;
        $employeeId = $_GET['employee_id'] ?? null;
        $limit = (int)($_GET['limit'] ?? 5000);
        if ($limit <= 0) $limit = 5000;
        if ($limit > 10000) $limit = 10000;

        $where = 'WHERE tenant_id=? AND date BETWEEN ? AND ?';
        $params = [(int)$tenantId, $start, $end];
        if ($employeeId !== null && $employeeId !== '') {
            $where .= ' AND employee_id=?';
            $params[] = (int)$employeeId;
        }

        $sql = "SELECT employee_id, date, in_time, out_time, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, status FROM attendance_days $where ORDER BY date DESC, employee_id DESC LIMIT $limit";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $days = array_map(fn($r) => [
            'employee_id' => (int)$r['employee_id'],
            'date' => $r['date'],
            'in_time' => $this->toTenantTime($r['in_time'] ?? null),
            'out_time' => $this->toTenantTime($r['out_time'] ?? null),
            'worked_minutes' => (int)$r['worked_minutes'],
            'late_minutes' => (int)($r['late_minutes'] ?? 0),
            'early_leave_minutes' => (int)($r['early_leave_minutes'] ?? 0),
            'overtime_minutes' => (int)($r['overtime_minutes'] ?? 0),
            'status' => $r['status']
        ], $stmt->fetchAll());

        echo json_encode(['days' => $days]);
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
        $tenantId = $this->resolveTenantId($pdo);
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

        $punchStmt = $pdo->prepare("SELECT occurred_at_utc FROM raw_events WHERE tenant_id=? AND employee_id=? AND event_type='punch' AND occurred_at_utc BETWEEN ? AND ? ORDER BY occurred_at_utc ASC");
        $punchStmt->execute([(int)$tenantId, (int)$employeeId, $start . ' 00:00:00', $end . ' 23:59:59']);
        $punchRows = $punchStmt->fetchAll(\PDO::FETCH_ASSOC);

        $attendance = [];
        if ($punchRows) {
            $punchesByDate = [];
            foreach ($punchRows as $pr) {
                $ts = $pr['occurred_at_utc'] ?? null;
                if (!is_string($ts) || $ts === '') continue;
                $local = $this->toTenantTime($ts);
                if (!is_string($local) || $local === '') continue;
                $dateStr = substr($local, 0, 10);
                if (!is_string($dateStr) || $dateStr === '') continue;
                if (!isset($punchesByDate[$dateStr])) $punchesByDate[$dateStr] = [];
                $punchesByDate[$dateStr][] = $local;
            }

            foreach ($punchesByDate as $dateStr => $list) {
                if (!is_array($list) || !$list) continue;
                sort($list, \SORT_STRING);

                for ($i = 0; $i + 1 < count($list); $i += 2) {
                    $in = $list[$i];
                    $out = $list[$i + 1];
                    $dur = 0;
                    $inTs = strtotime((string)$in);
                    $outTs = strtotime((string)$out);
                    if ($inTs !== false && $outTs !== false && $outTs > $inTs) {
                        $dur = (int)floor(($outTs - $inTs) / 60);
                    }
                    $attendance[] = [
                        'date' => $dateStr,
                        'clock_in' => $in,
                        'clock_out' => $out,
                        'duration_minutes' => $dur,
                    ];
                }

                if ((count($list) % 2) === 1) {
                    $attendance[] = [
                        'date' => $dateStr,
                        'clock_in' => $list[count($list) - 1],
                        'clock_out' => null,
                        'duration_minutes' => 0,
                    ];
                }
            }

            usort($attendance, function ($a, $b) {
                $d = strcmp((string)($a['date'] ?? ''), (string)($b['date'] ?? ''));
                if ($d !== 0) return $d;
                return strcmp((string)($a['clock_in'] ?? ''), (string)($b['clock_in'] ?? ''));
            });
        } else {
            $stmt = $pdo->prepare('SELECT * FROM attendance_records WHERE employee_id=? AND date BETWEEN ? AND ? ORDER BY date ASC');
            $stmt->execute([(int)$employeeId, $start, $end]);
            $attendance = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $existingDates = [];
            foreach ($attendance as $r) {
                $d = $r['date'] ?? null;
                if (is_string($d) && $d !== '') $existingDates[$d] = true;
            }

            $dayStmt = $pdo->prepare('SELECT date, in_time, out_time, worked_minutes FROM attendance_days WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ? ORDER BY date ASC');
            $dayStmt->execute([(int)$tenantId, (int)$employeeId, $start, $end]);
            $days = $dayStmt->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($days as $d) {
                $dateStr = $d['date'] ?? null;
                if (!is_string($dateStr) || $dateStr === '') continue;
                if (isset($existingDates[$dateStr])) continue;
                $in = $d['in_time'] ?? null;
                if (!is_string($in) || $in === '') continue;
                $attendance[] = [
                    'date' => $dateStr,
                    'clock_in' => $in,
                    'clock_out' => is_string($d['out_time'] ?? null) ? $d['out_time'] : null,
                    'duration_minutes' => (int)($d['worked_minutes'] ?? 0),
                ];
            }
        }

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
