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

    private function normalizeLeaveStatus(?string $raw): string
    {
        if (!is_string($raw)) return 'pending';
        $v = strtolower(trim($raw));
        if ($v === '') return 'pending';
        if ($v === 'pending') return 'pending';
        if ($v === 'pending_manager') return 'pending';
        if ($v === 'pending_hr') return 'pending';
        if ($v === 'hr_pending') return 'pending';
        if ($v === 'approved') return 'approved';
        if ($v === 'rejected') return 'rejected';
        if ($v === 'cancelled') return 'rejected';
        if ($v === 'canceled') return 'rejected';
        return 'pending';
    }

    private function normalizeLeaveType(?string $raw): string
    {
        if (!is_string($raw)) return 'casual';
        $v = strtolower(trim($raw));
        if ($v === '') return 'casual';
        $allowed = ['casual' => true, 'sick' => true, 'annual' => true, 'unpaid' => true];
        return isset($allowed[$v]) ? $v : 'casual';
    }

    private function normalizeDayPart(?string $raw): string
    {
        if (!is_string($raw)) return 'full';
        $v = strtolower(trim($raw));
        if ($v === '') return 'full';
        if ($v === 'half') return 'full';
        if ($v === 'first_half') return 'am';
        if ($v === 'second_half') return 'pm';
        $allowed = ['full' => true, 'am' => true, 'pm' => true];
        return isset($allowed[$v]) ? $v : 'full';
    }

    private function getEmployeeWorkingDays($pdo, int $tenantId, int $employeeId): array
    {
        $stmt = $pdo->prepare('SELECT s.working_days FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? AND e.id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, (int)$employeeId]);
        $raw = $stmt->fetchColumn();
        if (!is_string($raw) || trim($raw) === '') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        $parts = array_map('trim', explode(',', $raw));
        $out = [];
        foreach ($parts as $p) {
            if ($p === '') continue;
            $out[$p] = true;
        }
        return array_keys($out);
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

        $eStmt = $pdo->prepare('SELECT e.id, e.tenant_id, e.shift_id, s.name AS shift_name, s.working_days, e.name, e.code, e.status, e.created_at FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? ORDER BY e.id DESC');
        $eStmt->execute([(int)$tenantId]);
        $employees = array_map(fn($r) => [
            'id' => (string)$r['id'],
            'tenant_id' => (string)$r['tenant_id'],
            'shift_id' => (string)($r['shift_id'] ?? ''),
            'shift_name' => (string)($r['shift_name'] ?? ''),
            'working_days' => (string)($r['working_days'] ?? ''),
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

        $lStmt = $pdo->prepare('SELECT id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date DESC, employee_id DESC, id DESC');
        $lStmt->execute([(int)$tenantId, $start, $end]);
        $leaves = $lStmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($leaves as &$l) {
            $l['status'] = $this->normalizeLeaveStatus($l['status'] ?? null);
        }
        unset($l);

        $hStmt = $pdo->prepare('SELECT id, date, name, created_at FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date ASC, id ASC');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidays = $hStmt->fetchAll(\PDO::FETCH_ASSOC);

        $leaveByEmpDate = [];
        foreach ($leaves as $l) {
            $empId = (int)($l['employee_id'] ?? 0);
            $dateStr = (string)($l['date'] ?? '');
            if ($empId <= 0 || $dateStr === '') continue;
            $key = $empId . '|' . $dateStr;
            $curId = isset($leaveByEmpDate[$key]) ? (int)($leaveByEmpDate[$key]['id'] ?? 0) : 0;
            $newId = (int)($l['id'] ?? 0);
            if ($newId >= $curId) $leaveByEmpDate[$key] = $l;
        }

        $daysByEmpDate = [];
        foreach ($days as $d) {
            $empId = (int)($d['employee_id'] ?? 0);
            $dateStr = (string)($d['date'] ?? '');
            if ($empId <= 0 || $dateStr === '') continue;
            $daysByEmpDate[$empId . '|' . $dateStr] = $d;
        }

        foreach ($leaveByEmpDate as $key => $l) {
            $status = strtolower((string)($l['status'] ?? ''));
            if ($status !== 'approved') continue;
            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $leaveStatus = $dayPart === 'full' ? 'Leave' : 'Half Leave';

            if (isset($daysByEmpDate[$key])) {
                $d = $daysByEmpDate[$key];
                $d['late_minutes'] = 0;
                $d['early_leave_minutes'] = 0;
                if ($dayPart === 'full') {
                    $d['status'] = $leaveStatus;
                } elseif ((string)($d['status'] ?? '') === 'Absent' && (int)($d['worked_minutes'] ?? 0) <= 0) {
                    $d['status'] = $leaveStatus;
                }
                $daysByEmpDate[$key] = $d;
            } else {
                [$empIdRaw, $dateStr] = explode('|', $key, 2);
                $daysByEmpDate[$key] = [
                    'employee_id' => (int)$empIdRaw,
                    'date' => $dateStr,
                    'in_time' => null,
                    'out_time' => null,
                    'worked_minutes' => 0,
                    'late_minutes' => 0,
                    'early_leave_minutes' => 0,
                    'overtime_minutes' => 0,
                    'status' => $leaveStatus,
                ];
            }
        }

        $days = array_values($daysByEmpDate);
        usort($days, function ($a, $b) {
            $d = strcmp((string)($b['date'] ?? ''), (string)($a['date'] ?? ''));
            if ($d !== 0) return $d;
            return (int)($b['employee_id'] ?? 0) <=> (int)($a['employee_id'] ?? 0);
        });

        $workingDaysByEmployee = [];
        foreach ($employees as $e) {
            $raw = (string)($e['working_days'] ?? '');
            $parts = $raw !== '' ? array_map('trim', explode(',', $raw)) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
            $set = [];
            foreach ($parts as $p) {
                if ($p === '') continue;
                $set[strtolower($p)] = true;
            }
            $workingDaysByEmployee[(int)$e['id']] = $set;
        }

        $holidaySet = [];
        foreach ($holidays as $h) {
            $d = (string)($h['date'] ?? '');
            if ($d !== '') $holidaySet[$d] = true;
        }

        $leaveTotalsByEmployee = [];
        foreach ($leaveByEmpDate as $key => $l) {
            $status = strtolower((string)($l['status'] ?? ''));
            if ($status !== 'approved') continue;
            $empId = (int)($l['employee_id'] ?? 0);
            $dateStr = (string)($l['date'] ?? '');
            if ($empId <= 0 || $dateStr === '') continue;
            if (isset($holidaySet[$dateStr])) continue;

            $wd = $workingDaysByEmployee[$empId] ?? null;
            if (is_array($wd)) {
                $dowKey = strtolower((new \DateTimeImmutable($dateStr, new \DateTimeZone('Asia/Dhaka')))->format('D'));
                if (!isset($wd[$dowKey])) continue;
            }

            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $amount = $dayPart === 'full' ? 1.0 : 0.5;
            $type = strtolower((string)($l['leave_type'] ?? 'casual'));
            $isUnpaid = $type === 'unpaid';
            if (!isset($leaveTotalsByEmployee[$empId])) {
                $leaveTotalsByEmployee[$empId] = [
                    'paid' => 0.0,
                    'unpaid' => 0.0,
                    'total' => 0.0,
                ];
            }
            $leaveTotalsByEmployee[$empId]['total'] += $amount;
            if ($isUnpaid) $leaveTotalsByEmployee[$empId]['unpaid'] += $amount;
            else $leaveTotalsByEmployee[$empId]['paid'] += $amount;
        }

        echo json_encode(['employees' => $employees, 'attendance' => $attendance, 'days' => $days, 'leaves' => $leaves, 'holidays' => $holidays, 'leave_totals' => $leaveTotalsByEmployee]);
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
        $lStmt = $pdo->prepare('SELECT id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ? ORDER BY date ASC, id ASC');
        $lStmt->execute([(int)$tenantId, (int)$employeeId, $start, $end]);
        $leaves = $lStmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($leaves as &$l) {
            $l['status'] = $this->normalizeLeaveStatus($l['status'] ?? null);
        }
        unset($l);

        $hStmt = $pdo->prepare('SELECT id, date, name, created_at FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date ASC, id ASC');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidays = $hStmt->fetchAll(\PDO::FETCH_ASSOC);

        $workingDays = $this->getEmployeeWorkingDays($pdo, (int)$tenantId, (int)$employeeId);

        $workingDaysSet = [];
        foreach ($workingDays as $d) $workingDaysSet[strtolower($d)] = true;
        $holidaySet = [];
        foreach ($holidays as $h) {
            $d = (string)($h['date'] ?? '');
            if ($d !== '') $holidaySet[$d] = true;
        }
        $totals = ['paid' => 0.0, 'unpaid' => 0.0, 'total' => 0.0];
        foreach ($leaves as $l) {
            $status = strtolower((string)($l['status'] ?? ''));
            if ($status !== 'approved') continue;
            $dateStr = (string)($l['date'] ?? '');
            if ($dateStr === '' || isset($holidaySet[$dateStr])) continue;
            $dowKey = strtolower((new \DateTimeImmutable($dateStr, new \DateTimeZone('Asia/Dhaka')))->format('D'));
            if (!isset($workingDaysSet[$dowKey])) continue;
            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $amount = $dayPart === 'full' ? 1.0 : 0.5;
            $type = strtolower((string)($l['leave_type'] ?? 'casual'));
            $isUnpaid = $type === 'unpaid';
            $totals['total'] += $amount;
            if ($isUnpaid) $totals['unpaid'] += $amount;
            else $totals['paid'] += $amount;
        }

        echo json_encode([
            'attendance' => $attendance,
            'leaves' => $leaves,
            'holidays' => $holidays,
            'working_days' => implode(',', $workingDays),
            'leave_totals' => $totals,
            'month' => $month
        ]);
    }

    public function payslipPreview()
    {
        header('Content-Type: application/json');
        $employeeId = (int)($_GET['employee_id'] ?? 0);
        $month = $_GET['month'] ?? date('Y-m');
        $baseSalaryRaw = $_GET['base_salary'] ?? null;

        if ($employeeId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id required']);
            return;
        }

        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        if (!is_string($month) || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            http_response_code(400);
            echo json_encode(['error' => 'month must be YYYY-MM']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $start = $month . '-01';
        $end = date('Y-m-t', strtotime($start));

        $workingDays = $this->getEmployeeWorkingDays($pdo, (int)$tenantId, (int)$employeeId);
        $workingDaysSet = [];
        foreach ($workingDays as $d) $workingDaysSet[strtolower($d)] = true;

        $hStmt = $pdo->prepare('SELECT date FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ?');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidaySet = [];
        foreach ($hStmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $holidaySet[(string)($r['date'] ?? '')] = true;
        }

        $workdayCount = 0;
        $cursor = new \DateTimeImmutable($start, new \DateTimeZone('Asia/Dhaka'));
        $endDt = new \DateTimeImmutable($end, new \DateTimeZone('Asia/Dhaka'));
        while ($cursor <= $endDt) {
            $dateStr = $cursor->format('Y-m-d');
            $dowKey = strtolower($cursor->format('D'));
            if (!isset($holidaySet[$dateStr]) && isset($workingDaysSet[$dowKey])) {
                $workdayCount += 1;
            }
            $cursor = $cursor->modify('+1 day');
        }

        $lStmt = $pdo->prepare('SELECT date, leave_type, day_part, status FROM leaves WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ?');
        $lStmt->execute([(int)$tenantId, (int)$employeeId, $start, $end]);
        $leaves = $lStmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($leaves as &$l) {
            $l['status'] = $this->normalizeLeaveStatus($l['status'] ?? null);
        }
        unset($l);

        $paid = 0.0;
        $unpaid = 0.0;
        foreach ($leaves as $l) {
            $status = strtolower((string)($l['status'] ?? ''));
            if ($status !== 'approved') continue;
            $dateStr = (string)($l['date'] ?? '');
            if ($dateStr === '' || isset($holidaySet[$dateStr])) continue;
            $dowKey = strtolower((new \DateTimeImmutable($dateStr, new \DateTimeZone('Asia/Dhaka')))->format('D'));
            if (!isset($workingDaysSet[$dowKey])) continue;

            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $amount = $dayPart === 'full' ? 1.0 : 0.5;
            $type = strtolower((string)($l['leave_type'] ?? 'casual'));
            if ($type === 'unpaid') $unpaid += $amount;
            else $paid += $amount;
        }

        $baseSalary = null;
        if ($baseSalaryRaw !== null && $baseSalaryRaw !== '') {
            $baseSalary = (float)$baseSalaryRaw;
        }
        $unpaidDeduction = null;
        $netSalary = null;
        if ($baseSalary !== null && $workdayCount > 0) {
            $unpaidDeduction = round(($baseSalary / $workdayCount) * $unpaid, 2);
            $netSalary = round($baseSalary - $unpaidDeduction, 2);
        }

        echo json_encode([
            'employee_id' => $employeeId,
            'month' => $month,
            'workdays' => $workdayCount,
            'paid_leave_days' => $paid,
            'unpaid_leave_days' => $unpaid,
            'base_salary' => $baseSalary,
            'unpaid_deduction' => $unpaidDeduction,
            'net_salary' => $netSalary,
        ]);
    }

    public function leavesList()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $employeeId = $_GET['employee_id'] ?? null;
        if (($user['role'] ?? null) === 'employee') {
            $mapped = (int)($user['employee_id'] ?? 0);
            if ($mapped <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
            $employeeId = $mapped;
        }
        $month = $_GET['month'] ?? null;
        if (is_string($month) && preg_match('/^\d{4}-\d{2}$/', $month)) {
            $start = $month . '-01';
            $end = date('Y-m-t', strtotime($start));
        } else {
            $startRaw = $_GET['start'] ?? date('Y-m-d');
            $endRaw = $_GET['end'] ?? $startRaw;
            [$start, $end] = $this->normalizeRange((string)$startRaw, (string)$endRaw);
        }

        $where = 'WHERE tenant_id=? AND date BETWEEN ? AND ?';
        $params = [(int)$tenantId, $start, $end];
        if ($employeeId !== null && $employeeId !== '') {
            $where .= ' AND employee_id=?';
            $params[] = (int)$employeeId;
        }

        $stmt = $pdo->prepare("SELECT id, tenant_id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves $where ORDER BY date ASC, employee_id ASC, id ASC");
        $stmt->execute($params);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            $r['status'] = $this->normalizeLeaveStatus($r['status'] ?? null);
        }
        unset($r);
        echo json_encode(['leaves' => $rows]);
    }

    public function leavesCreate()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $employeeId = (int)($in['employee_id'] ?? 0);
        $date = $this->normalizeDate($in['date'] ?? null);
        $leaveType = $this->normalizeLeaveType($in['leave_type'] ?? null);
        $dayPart = $this->normalizeDayPart($in['day_part'] ?? null);
        $reason = trim((string)($in['reason'] ?? ''));
        $status = $this->normalizeLeaveStatus($in['status'] ?? null);

        if ($employeeId <= 0 || !$date) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id and valid date required']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $existingStmt = $pdo->prepare('SELECT id FROM leaves WHERE tenant_id=? AND employee_id=? AND date=? ORDER BY id DESC LIMIT 1');
        $existingStmt->execute([(int)$tenantId, (int)$employeeId, $date]);
        $existingId = $existingStmt->fetchColumn();

        if ($existingId) {
            $up = $pdo->prepare('UPDATE leaves SET leave_type=?, day_part=?, reason=?, status=? WHERE tenant_id=? AND id=?');
            $up->execute([$leaveType, $dayPart, $reason !== '' ? $reason : null, $status, (int)$tenantId, (int)$existingId]);
            $id = (int)$existingId;
        } else {
            $ins = $pdo->prepare('INSERT INTO leaves(tenant_id, employee_id, date, leave_type, day_part, reason, status) VALUES(?, ?, ?, ?, ?, ?, ?)');
            $ins->execute([(int)$tenantId, (int)$employeeId, $date, $leaveType, $dayPart, $reason !== '' ? $reason : null, $status]);
            $id = (int)$pdo->lastInsertId();
        }

        $outStmt = $pdo->prepare('SELECT id, tenant_id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves WHERE tenant_id=? AND id=?');
        $outStmt->execute([(int)$tenantId, $id]);
        $row = $outStmt->fetch(\PDO::FETCH_ASSOC);
        if (is_array($row)) {
            $row['status'] = $this->normalizeLeaveStatus($row['status'] ?? null);
        }
        echo json_encode(['leave' => $row]);
    }

    public function leavesUpdate()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $id = (int)($in['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'id required']);
            return;
        }

        $curStmt = $pdo->prepare('SELECT id, employee_id, date, leave_type, day_part, reason, status FROM leaves WHERE tenant_id=? AND id=? LIMIT 1');
        $curStmt->execute([(int)$tenantId, $id]);
        $cur = $curStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$cur) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }

        $canManage = \App\Core\Auth::hasPermission($user, 'leaves.manage');

        $employeeId = (int)($cur['employee_id'] ?? 0);
        $newDate = $canManage && array_key_exists('date', $in) ? $this->normalizeDate($in['date'] ?? null) : (string)($cur['date'] ?? '');
        if (!$newDate) {
            http_response_code(400);
            echo json_encode(['error' => 'valid date required']);
            return;
        }

        if ($canManage && $newDate !== (string)($cur['date'] ?? '')) {
            $dup = $pdo->prepare('SELECT 1 FROM leaves WHERE tenant_id=? AND employee_id=? AND date=? AND id<>? LIMIT 1');
            $dup->execute([(int)$tenantId, $employeeId, $newDate, $id]);
            if ($dup->fetchColumn()) {
                http_response_code(409);
                echo json_encode(['error' => 'Leave already exists for this date']);
                return;
            }
        }

        $newType = $canManage && array_key_exists('leave_type', $in) ? $this->normalizeLeaveType($in['leave_type'] ?? null) : $this->normalizeLeaveType($cur['leave_type'] ?? null);
        $newDayPart = $canManage && array_key_exists('day_part', $in) ? $this->normalizeDayPart($in['day_part'] ?? null) : $this->normalizeDayPart($cur['day_part'] ?? null);
        $newReason = $canManage && array_key_exists('reason', $in) ? trim((string)($in['reason'] ?? '')) : (string)($cur['reason'] ?? '');
        $newStatus = array_key_exists('status', $in) ? $this->normalizeLeaveStatus($in['status'] ?? null) : (string)($cur['status'] ?? 'approved');

        if (!$canManage) {
            $currentStatus = strtolower((string)($cur['status'] ?? 'pending_manager'));
            $currentStatus = $this->normalizeLeaveStatus($currentStatus);
            if (!in_array($newStatus, ['pending', 'approved', 'rejected'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'invalid status transition']);
                return;
            }
            if ($currentStatus !== 'pending') {
                http_response_code(409);
                echo json_encode(['error' => 'already reviewed']);
                return;
            }
        }

        $up = $pdo->prepare('UPDATE leaves SET date=?, leave_type=?, day_part=?, reason=?, status=? WHERE tenant_id=? AND id=?');
        $up->execute([$newDate, $newType, $newDayPart, $newReason !== '' ? $newReason : null, $newStatus, (int)$tenantId, $id]);

        $outStmt = $pdo->prepare('SELECT id, tenant_id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves WHERE tenant_id=? AND id=?');
        $outStmt->execute([(int)$tenantId, $id]);
        $row = $outStmt->fetch(\PDO::FETCH_ASSOC);
        if (is_array($row)) {
            $row['status'] = $this->normalizeLeaveStatus($row['status'] ?? null);
        }
        echo json_encode(['leave' => $row]);
    }

    public function leavesApply()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $canManage = \App\Core\Auth::hasPermission($user, 'leaves.manage');
        $employeeId = (int)($in['employee_id'] ?? 0);
        if (($user['role'] ?? null) === 'employee' && !$canManage) {
            $mapped = (int)($user['employee_id'] ?? 0);
            if ($mapped <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
            $employeeId = $mapped;
        }
        $start = $this->normalizeDate($in['start_date'] ?? null);
        $end = $this->normalizeDate($in['end_date'] ?? null);
        $leaveType = $this->normalizeLeaveType($in['leave_type'] ?? null);
        $dayPart = $this->normalizeDayPart($in['day_part'] ?? null);
        $reason = trim((string)($in['reason'] ?? ''));
        $status = $this->normalizeLeaveStatus($in['status'] ?? null);
        if (($user['role'] ?? null) === 'employee' && !$canManage) $status = 'pending';

        if ($employeeId <= 0 || !$start || !$end) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id, start_date, end_date required']);
            return;
        }

        if ($start !== $end && $dayPart !== 'full') {
            http_response_code(400);
            echo json_encode(['error' => 'day_part must be full for multi-day leave']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $workingDays = $this->getEmployeeWorkingDays($pdo, (int)$tenantId, (int)$employeeId);
        $workingDaysSet = [];
        foreach ($workingDays as $d) $workingDaysSet[strtolower($d)] = true;

        $hStmt = $pdo->prepare('SELECT date FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ?');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidaySet = [];
        foreach ($hStmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $holidaySet[(string)($r['date'] ?? '')] = true;
        }

        $dates = [];
        $cursor = new \DateTimeImmutable($start, new \DateTimeZone('Asia/Dhaka'));
        $endDt = new \DateTimeImmutable($end, new \DateTimeZone('Asia/Dhaka'));
        while ($cursor <= $endDt) {
            $dateStr = $cursor->format('Y-m-d');
            $dowKey = strtolower($cursor->format('D'));
            if (!isset($holidaySet[$dateStr]) && isset($workingDaysSet[$dowKey])) {
                $dates[] = $dateStr;
            }
            $cursor = $cursor->modify('+1 day');
        }

        if (!$dates) {
            echo json_encode(['created' => 0, 'skipped' => 0, 'dates' => []]);
            return;
        }

        $skipped = 0;
        $created = 0;
        $ins = $pdo->prepare('INSERT INTO leaves(tenant_id, employee_id, date, leave_type, day_part, reason, status) VALUES(?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE leave_type=VALUES(leave_type), day_part=VALUES(day_part), reason=VALUES(reason), status=VALUES(status)');
        foreach ($dates as $dateStr) {
            try {
                $ins->execute([(int)$tenantId, (int)$employeeId, $dateStr, $leaveType, $dayPart, $reason !== '' ? $reason : null, $status]);
                $created += 1;
            } catch (\Exception $e) {
                $skipped += 1;
            }
        }

        echo json_encode(['created' => $created, 'skipped' => $skipped, 'dates' => $dates]);
    }

    public function holidaysList()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $month = $_GET['month'] ?? null;
        if (is_string($month) && preg_match('/^\d{4}-\d{2}$/', $month)) {
            $start = $month . '-01';
            $end = date('Y-m-t', strtotime($start));
        } else {
            $startRaw = $_GET['start'] ?? date('Y-m-d');
            $endRaw = $_GET['end'] ?? $startRaw;
            [$start, $end] = $this->normalizeRange((string)$startRaw, (string)$endRaw);
        }

        $stmt = $pdo->prepare('SELECT id, tenant_id, date, name, created_at FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date ASC, id ASC');
        $stmt->execute([(int)$tenantId, $start, $end]);
        echo json_encode(['holidays' => $stmt->fetchAll(\PDO::FETCH_ASSOC)]);
    }

    public function holidaysCreate()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $date = $this->normalizeDate($in['date'] ?? null);
        $name = trim((string)($in['name'] ?? ''));
        if (!$date || $name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'date and name required']);
            return;
        }

        $stmt = $pdo->prepare('INSERT INTO holidays(tenant_id, date, name) VALUES(?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)');
        $stmt->execute([(int)$tenantId, $date, $name]);

        $out = $pdo->prepare('SELECT id, tenant_id, date, name, created_at FROM holidays WHERE tenant_id=? AND date=? ORDER BY id DESC LIMIT 1');
        $out->execute([(int)$tenantId, $date]);
        echo json_encode(['holiday' => $out->fetch(\PDO::FETCH_ASSOC)]);
    }

    public function holidaysUpdate()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $id = (int)($in['id'] ?? 0);
        $date = array_key_exists('date', $in) ? $this->normalizeDate($in['date'] ?? null) : null;
        $name = array_key_exists('name', $in) ? trim((string)($in['name'] ?? '')) : null;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'id required']);
            return;
        }

        $curStmt = $pdo->prepare('SELECT id, date, name FROM holidays WHERE tenant_id=? AND id=? LIMIT 1');
        $curStmt->execute([(int)$tenantId, $id]);
        $cur = $curStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$cur) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }

        $newDate = $date ?: (string)($cur['date'] ?? '');
        $newName = $name !== null ? $name : (string)($cur['name'] ?? '');
        if (!$newDate || $newName === '') {
            http_response_code(400);
            echo json_encode(['error' => 'date and name required']);
            return;
        }

        if ($newDate !== (string)($cur['date'] ?? '')) {
            $dup = $pdo->prepare('SELECT 1 FROM holidays WHERE tenant_id=? AND date=? AND id<>? LIMIT 1');
            $dup->execute([(int)$tenantId, $newDate, $id]);
            if ($dup->fetchColumn()) {
                http_response_code(409);
                echo json_encode(['error' => 'Holiday already exists for this date']);
                return;
            }
        }

        $stmt = $pdo->prepare('UPDATE holidays SET date=?, name=? WHERE tenant_id=? AND id=?');
        $stmt->execute([$newDate, $newName, (int)$tenantId, $id]);

        $out = $pdo->prepare('SELECT id, tenant_id, date, name, created_at FROM holidays WHERE tenant_id=? AND id=?');
        $out->execute([(int)$tenantId, $id]);
        echo json_encode(['holiday' => $out->fetch(\PDO::FETCH_ASSOC)]);
    }

    public function holidaysDelete()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $id = (int)($in['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'id required']);
            return;
        }

        $stmt = $pdo->prepare('DELETE FROM holidays WHERE tenant_id=? AND id=?');
        $stmt->execute([(int)$tenantId, $id]);
        echo json_encode(['ok' => true]);
    }

    public function leavesDelete()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $id = (int)($in['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'id required']);
            return;
        }

        $del = $pdo->prepare('DELETE FROM leaves WHERE tenant_id=? AND id=?');
        $del->execute([(int)$tenantId, $id]);
        echo json_encode(['ok' => true]);
    }
}
