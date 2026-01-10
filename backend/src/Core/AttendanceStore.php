<?php

namespace App\Core;

class AttendanceStore
{
    private $file = __DIR__ . '/../../data/attendance.json';

    public function all()
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
            $stmt = $pdo->prepare('SELECT ar.*, e.name as employee_name FROM attendance_records ar JOIN employees e ON e.id=ar.employee_id WHERE e.tenant_id=? ORDER BY ar.id DESC');
            $stmt->execute([$tenantId]);
            return $stmt->fetchAll();
        }
        if (!file_exists($this->file)) return [];
        return json_decode(file_get_contents($this->file), true) ?? [];
    }

    private function getShiftForEmployee($pdo, $employeeId, $tenantId) {
        // 1. Check if employee has a specific shift assigned
        $stmt = $pdo->prepare("SELECT s.* FROM shifts s JOIN employees e ON e.shift_id = s.id WHERE e.id = ? AND e.tenant_id = ?");
        $stmt->execute([$employeeId, $tenantId]);
        $shift = $stmt->fetch(\PDO::FETCH_ASSOC);

        if ($shift) return $shift;

        // 2. Fallback to default shift for tenant
        $stmt = $pdo->prepare("SELECT * FROM shifts WHERE tenant_id = ? AND is_default = 1 LIMIT 1");
        $stmt->execute([$tenantId]);
        return $stmt->fetch(\PDO::FETCH_ASSOC);
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
            
            // Shift Logic
            $shift = $this->getShiftForEmployee($pdo, $employee_id, $tenantId);
            $status = 'Present';
            $lateMinutes = 0;
            
            if ($shift) {
                $shiftStart = $date . ' ' . $shift['start_time'];
                $lateThreshold = strtotime($shiftStart) + ($shift['late_tolerance_minutes'] * 60);
                
                if (strtotime($now) > $lateThreshold) {
                    $status = 'Late';
                    $lateMinutes = (int)floor((strtotime($now) - strtotime($shiftStart)) / 60);
                }
            }

            $stmt = $pdo->prepare('INSERT INTO attendance_records (employee_id, clock_in, clock_out, duration_minutes, date, status, late_minutes) VALUES (?, ?, NULL, 0, ?, ?, ?)');
            $stmt->execute([$employee_id, $now, $date, $status, $lateMinutes]);
            $id = $pdo->lastInsertId();
            
            return [
                'id' => (string)$id,
                'employee_id' => (string)$employee_id,
                'clock_in' => $now,
                'clock_out' => null,
                'duration_minutes' => 0,
                'date' => $date,
                'status' => $status,
                'late_minutes' => $lateMinutes
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
            
            // Shift Logic
            $shift = $this->getShiftForEmployee($pdo, $employee_id, $tenantId);
            $earlyLeaveMinutes = 0;
            $status = $r['status']; // Keep existing status (e.g., Late)
            
            if ($shift) {
                $shiftEnd = $date . ' ' . $shift['end_time'];
                $earlyThreshold = strtotime($shiftEnd) - ($shift['early_exit_tolerance_minutes'] * 60);
                
                if (strtotime($now) < $earlyThreshold) {
                    $earlyLeaveMinutes = (int)floor((strtotime($shiftEnd) - strtotime($now)) / 60);
                    // Append Early Leave status if not already set (or handle as multi-status)
                    // For now, let's append it
                    $status = $status . ', Early Leave';
                }
            }

            $upd = $pdo->prepare('UPDATE attendance_records SET clock_out=?, duration_minutes=?, status=?, early_leave_minutes=? WHERE id=?');
            $upd->execute([$now, $duration, $status, $earlyLeaveMinutes, $r['id']]);
            
            return [
                'id' => (string)$r['id'],
                'employee_id' => (string)$employee_id,
                'clock_in' => $r['clock_in'],
                'clock_out' => $now,
                'duration_minutes' => $duration,
                'date' => $date,
                'status' => $status,
                'early_leave_minutes' => $earlyLeaveMinutes
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
