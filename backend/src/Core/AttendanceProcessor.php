<?php

namespace App\Core;

class AttendanceProcessor
{
    public function processRange(int $tenantId, string $startDate, string $endDate): array
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT employee_id, event_type, occurred_at_utc FROM raw_events WHERE tenant_id=? AND occurred_at_utc BETWEEN ? AND ? ORDER BY occurred_at_utc ASC');
        $stmt->execute([$tenantId, $startDate.' 00:00:00', $endDate.' 23:59:59']);
        $rows = $stmt->fetchAll();
        $byEmpDate = [];
        foreach ($rows as $r) {
            $date = substr($r['occurred_at_utc'], 0, 10);
            $key = $r['employee_id'].'|'.$date;
            if (!isset($byEmpDate[$key])) $byEmpDate[$key] = ['in'=>null,'out'=>null];
            if ($r['event_type'] === 'clockin') {
                if (!$byEmpDate[$key]['in']) $byEmpDate[$key]['in'] = $r['occurred_at_utc'];
            } elseif ($r['event_type'] === 'clockout') {
                $byEmpDate[$key]['out'] = $r['occurred_at_utc'];
            }
        }
        $result = [];
        foreach ($byEmpDate as $k => $v) {
            [$emp, $date] = explode('|', $k);
            $in = $v['in'];
            $out = $v['out'];
            $worked = 0;
            if ($in && $out) $worked = max(0, (int)floor((strtotime($out) - strtotime($in)) / 60));
            $status = ($in && $out) ? 'Present' : 'Absent';
            $up = $pdo->prepare('INSERT INTO attendance_days(tenant_id, employee_id, date, in_time, out_time, worked_minutes, status) VALUES (?,?,?,?,?, ?, ?) ON DUPLICATE KEY UPDATE in_time=VALUES(in_time), out_time=VALUES(out_time), worked_minutes=VALUES(worked_minutes), status=VALUES(status)');
            $up->execute([$tenantId, (int)$emp, $date, $in, $out, $worked, $status]);
            $result[] = ['employee_id'=>(int)$emp,'date'=>$date,'in_time'=>$in,'out_time'=>$out,'worked_minutes'=>$worked,'status'=>$status];
        }
        return $result;
    }
}

