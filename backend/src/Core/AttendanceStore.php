<?php

namespace App\Core;

class AttendanceStore
{
    private $file = __DIR__ . '/../../data/attendance.json';

    public function all($start = null, $end = null, $employeeId = null, $limit = 5000)
    {
        $pdo = Database::get();
        if ($pdo) {
            $tenantId = null;
            $user = \App\Core\Auth::currentUser();
            $tenantId = $user['tenant_id'] ?? null;
            if (!$tenantId) {
                $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
                if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
            }
            if (!$tenantId) return [];

            $limitInt = (int)$limit;
            if ($limitInt <= 0) $limitInt = 5000;
            if ($limitInt > 10000) $limitInt = 10000;

            $where = 'WHERE e.tenant_id=?';
            $params = [$tenantId];

            if ($employeeId !== null && $employeeId !== '') {
                $where .= ' AND ar.employee_id=?';
                $params[] = (int)$employeeId;
            }
            if ($start && $end) {
                $where .= ' AND ar.date BETWEEN ? AND ?';
                $params[] = $start;
                $params[] = $end;
            } elseif ($start) {
                $where .= ' AND ar.date >= ?';
                $params[] = $start;
            } elseif ($end) {
                $where .= ' AND ar.date <= ?';
                $params[] = $end;
            }

            $sql = "SELECT ar.*, e.name as employee_name, e.code as employee_code FROM attendance_records ar JOIN employees e ON e.id=ar.employee_id $where ORDER BY ar.date DESC, ar.id DESC LIMIT $limitInt";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll();
        }
        if (!file_exists($this->file)) return [];
        return json_decode(file_get_contents($this->file), true) ?? [];
    }

    private function getShiftForEmployee($pdo, $employeeId, $tenantId) {
        $stmt = $pdo->prepare("SELECT s.* FROM shifts s JOIN employees e ON e.shift_id = s.id WHERE e.id = ? AND e.tenant_id = ?");
        $stmt->execute([$employeeId, $tenantId]);
        $shift = $stmt->fetch(\PDO::FETCH_ASSOC);

        if ($shift) return $shift;

        $stmt = $pdo->prepare("SELECT * FROM shifts WHERE tenant_id = ? AND is_default = 1 LIMIT 1");
        $stmt->execute([$tenantId]);
        $shift = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($shift) return $shift;
        throw new \Exception('Shift missing');
    }

    private function parseStatusTokens($status): array
    {
        if (!is_string($status) || trim($status) === '') return [];
        $parts = array_map('trim', explode(',', $status));
        $parts = array_values(array_filter($parts, fn($p) => $p !== ''));
        return $parts;
    }

    private function formatStatusFromTokens(array $tokens): string
    {
        $unique = [];
        foreach ($tokens as $t) {
            $t = trim((string)$t);
            if ($t === '') continue;
            if (!in_array($t, $unique, true)) $unique[] = $t;
        }
        return $unique ? implode(', ', $unique) : 'Present';
    }

    private function recomputeDayFlags($pdo, int $employeeId, int $tenantId, string $date): void
    {
        $shift = $this->getShiftForEmployee($pdo, $employeeId, $tenantId);

        $stmt = $pdo->prepare('SELECT id, clock_in, clock_out, duration_minutes, status FROM attendance_records WHERE employee_id=? AND date=? ORDER BY clock_in ASC, id ASC');
        $stmt->execute([$employeeId, $date]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if (!$rows) return;

        $first = $rows[0];
        $lastWithOut = null;
        foreach ($rows as $r) {
            if (!empty($r['clock_out'])) {
                if (!$lastWithOut || (string)$r['clock_out'] > (string)$lastWithOut['clock_out']) $lastWithOut = $r;
            }
        }

        $shiftStartTs = strtotime($date . ' ' . $shift['start_time']);
        $shiftEndTs = strtotime($date . ' ' . $shift['end_time']);
        if ($shiftEndTs !== false && $shiftStartTs !== false && $shiftEndTs <= $shiftStartTs) $shiftEndTs += 86400;

        $firstInTs = strtotime((string)$first['clock_in']);
        $lateMinutes = 0;
        if ($firstInTs !== false && $shiftStartTs !== false) {
            $lateThreshold = $shiftStartTs + ((int)($shift['late_tolerance_minutes'] ?? 0) * 60);
            if ($firstInTs > $lateThreshold) $lateMinutes = max(0, (int)floor(($firstInTs - $shiftStartTs) / 60));
        }

        $earlyLeaveMinutes = 0;
        $overtimeMinutes = 0;
        if ($lastWithOut && $shiftEndTs !== false) {
            $lastOutTs = strtotime((string)$lastWithOut['clock_out']);
            if ($lastOutTs !== false) {
                $earlyThreshold = $shiftEndTs - ((int)($shift['early_exit_tolerance_minutes'] ?? 0) * 60);
                if ($lastOutTs < $earlyThreshold) $earlyLeaveMinutes = max(0, (int)floor(($shiftEndTs - $lastOutTs) / 60));
                if ($lastOutTs > $shiftEndTs) $overtimeMinutes = max(0, (int)floor(($lastOutTs - $shiftEndTs) / 60));
            }
        }

        $upd = $pdo->prepare('UPDATE attendance_records SET status=?, late_minutes=?, early_leave_minutes=?, overtime_minutes=? WHERE id=?');

        foreach ($rows as $r) {
            $tokens = $this->parseStatusTokens($r['status'] ?? null);
            $tokens = array_values(array_filter($tokens, fn($t) => $t !== 'Late' && $t !== 'Early Leave' && $t !== 'Overtime'));

            $lm = 0;
            $em = 0;
            $om = 0;
            if ((int)$r['id'] === (int)$first['id'] && $lateMinutes > 0) {
                $tokens[] = 'Late';
                $lm = $lateMinutes;
            }
            if ($lastWithOut && (int)$r['id'] === (int)$lastWithOut['id'] && $earlyLeaveMinutes > 0) {
                $tokens[] = 'Early Leave';
                $em = $earlyLeaveMinutes;
            }
            if ($lastWithOut && (int)$r['id'] === (int)$lastWithOut['id'] && $overtimeMinutes > 0) {
                $tokens[] = 'Overtime';
                $om = $overtimeMinutes;
            }

            $status = $this->formatStatusFromTokens($tokens);
            $upd->execute([$status, $lm, $em, $om, (int)$r['id']]);
        }
    }

    public function clockIn($employee_id, $tenantOverride = null)
    {
        $pdo = Database::get();
        if ($pdo) {
            $tenantId = null;
            $user = \App\Core\Auth::currentUser();
            $tenantId = $user['tenant_id'] ?? null;
            if ($tenantOverride) { $tenantId = (int)$tenantOverride; }
            if (!$tenantId) { $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null; if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } } }
            
            $chk = $pdo->prepare('SELECT id FROM employees WHERE id=? AND tenant_id=?');
            $chk->execute([(int)$employee_id, (int)$tenantId]);
            if (!$chk->fetch()) throw new \Exception('Employee not in tenant');
            
            // Check open shift
            $stmt = $pdo->prepare('SELECT id FROM attendance_records WHERE employee_id=? AND clock_out IS NULL LIMIT 1');
            $stmt->execute([$employee_id]);
            if ($stmt->fetch()) throw new \Exception('Open shift exists');
            
            $now = date('Y-m-d H:i:s');
            $date = date('Y-m-d');
            
            $stmt = $pdo->prepare('INSERT INTO attendance_records (employee_id, clock_in, clock_out, duration_minutes, date, status, late_minutes, early_leave_minutes, overtime_minutes) VALUES (?, ?, NULL, 0, ?, ?, 0, 0, 0)');
            $stmt->execute([$employee_id, $now, $date, 'Present']);
            $id = $pdo->lastInsertId();

            $this->recomputeDayFlags($pdo, (int)$employee_id, (int)$tenantId, $date);

            $fetch = $pdo->prepare('SELECT id, employee_id, clock_in, clock_out, duration_minutes, date, status, late_minutes, early_leave_minutes, overtime_minutes FROM attendance_records WHERE id=?');
            $fetch->execute([(int)$id]);
            $row = $fetch->fetch(\PDO::FETCH_ASSOC) ?: null;
            
            return [
                'id' => (string)$id,
                'employee_id' => (string)$employee_id,
                'clock_in' => $row['clock_in'] ?? $now,
                'clock_out' => $row['clock_out'] ?? null,
                'duration_minutes' => (int)($row['duration_minutes'] ?? 0),
                'date' => $row['date'] ?? $date,
                'status' => $row['status'] ?? 'Present',
                'late_minutes' => (int)($row['late_minutes'] ?? 0),
                'early_leave_minutes' => (int)($row['early_leave_minutes'] ?? 0),
                'overtime_minutes' => (int)($row['overtime_minutes'] ?? 0)
            ];
        }
        // Fallback to JSON (deprecated but kept for safety)
        $records = $this->all();
        foreach ($records as $r) if ($r['employee_id'] === $employee_id && !$r['clock_out']) throw new \Exception('Open shift exists');
        $rec = [
            'id' => uniqid('att_'),
            'employee_id' => $employee_id,
            'clock_in' => date('c'),
            'clock_out' => null,
            'duration_minutes' => 0,
            'date' => date('Y-m-d')
        ];
        $records[] = $rec;
        file_put_contents($this->file, json_encode($records, JSON_PRETTY_PRINT));
        return $rec;
    }

    public function clockOut($employee_id, $tenantOverride = null)
    {
        $pdo = Database::get();
        if ($pdo) {
            $tenantId = null;
            $user = \App\Core\Auth::currentUser();
            $tenantId = $user['tenant_id'] ?? null;
            if ($tenantOverride) { $tenantId = (int)$tenantOverride; }
            if (!$tenantId) { $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null; if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } } }
            
            $chk = $pdo->prepare('SELECT id FROM employees WHERE id=? AND tenant_id=?');
            $chk->execute([(int)$employee_id, (int)$tenantId]);
            if (!$chk->fetch()) throw new \Exception('Employee not in tenant');
            
            $stmt = $pdo->prepare('SELECT id, clock_in, status FROM attendance_records WHERE employee_id=? AND clock_out IS NULL LIMIT 1');
            $stmt->execute([$employee_id]);
            $r = $stmt->fetch();
            if (!$r) throw new \Exception('No open shift');
            
            $now = date('Y-m-d H:i:s');
            $duration = max(0, (int)floor((strtotime($now) - strtotime($r['clock_in'])) / 60));
            $date = date('Y-m-d', strtotime($r['clock_in']));
            
            $upd = $pdo->prepare('UPDATE attendance_records SET clock_out=?, duration_minutes=? WHERE id=?');
            $upd->execute([$now, $duration, $r['id']]);

            $this->recomputeDayFlags($pdo, (int)$employee_id, (int)$tenantId, $date);

            $fetch = $pdo->prepare('SELECT id, employee_id, clock_in, clock_out, duration_minutes, date, status, late_minutes, early_leave_minutes, overtime_minutes FROM attendance_records WHERE id=?');
            $fetch->execute([(int)$r['id']]);
            $row = $fetch->fetch(\PDO::FETCH_ASSOC) ?: null;
            
            return [
                'id' => (string)$r['id'],
                'employee_id' => (string)$employee_id,
                'clock_in' => $row['clock_in'] ?? $r['clock_in'],
                'clock_out' => $row['clock_out'] ?? $now,
                'duration_minutes' => (int)($row['duration_minutes'] ?? $duration),
                'date' => $row['date'] ?? $date,
                'status' => $row['status'] ?? ($r['status'] ?? 'Present'),
                'late_minutes' => (int)($row['late_minutes'] ?? 0),
                'early_leave_minutes' => (int)($row['early_leave_minutes'] ?? 0),
                'overtime_minutes' => (int)($row['overtime_minutes'] ?? 0)
            ];
        }
        
        // Fallback
        $records = $this->all();
        foreach ($records as &$r) {
            if ($r['employee_id'] === $employee_id && !$r['clock_out']) {
                $r['clock_out'] = date('c');
                $r['duration_minutes'] = max(0, (int)floor((strtotime($r['clock_out']) - strtotime($r['clock_in'])) / 60));
                file_put_contents($this->file, json_encode($records, JSON_PRETTY_PRINT));
                return $r;
            }
        }
        throw new \Exception('No open shift');
    }
}
