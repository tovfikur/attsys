<?php

namespace App\Core;

class AttendanceProcessor
{
    public function processRange(int $tenantId, string $startDate, string $endDate): array
    {
        $pdo = Database::get();
        $byEmpDate = [];
        $utcTz = new \DateTimeZone('UTC');
        $localTz = new \DateTimeZone('Asia/Dhaka');

        $empShiftStmt = $pdo->prepare('SELECT e.id AS employee_id, s.start_time, s.end_time, s.late_tolerance_minutes, s.early_exit_tolerance_minutes, s.break_duration_minutes FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=?');
        $empShiftStmt->execute([$tenantId]);
        $shiftsByEmployee = [];
        foreach ($empShiftStmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $shiftsByEmployee[(int)$r['employee_id']] = $r;
        }

        $defaultShiftStmt = $pdo->prepare('SELECT start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, break_duration_minutes FROM shifts WHERE tenant_id=? AND is_default=1 ORDER BY id DESC LIMIT 1');
        $defaultShiftStmt->execute([$tenantId]);
        $defaultShift = $defaultShiftStmt->fetch(\PDO::FETCH_ASSOC) ?: null;

        $stmt = $pdo->prepare('SELECT employee_id, event_type, occurred_at_utc FROM raw_events WHERE tenant_id=? AND occurred_at_utc BETWEEN ? AND ? ORDER BY occurred_at_utc ASC');
        $rangeStartUtc = $startDate . ' 00:00:00';
        $rangeEndUtc = $endDate . ' 23:59:59';
        $rangeStartLocal = new \DateTimeImmutable($startDate . ' 00:00:00', $localTz);
        $rangeEndLocal = new \DateTimeImmutable($endDate . ' 23:59:59', $localTz);
        $rangeStartUtc = $rangeStartLocal->setTimezone($utcTz)->format('Y-m-d H:i:s');
        $rangeEndUtc = $rangeEndLocal->setTimezone($utcTz)->format('Y-m-d H:i:s');
        $stmt->execute([$tenantId, $rangeStartUtc, $rangeEndUtc]);
        $rows = $stmt->fetchAll();

        if ($rows) {
            foreach ($rows as $r) {
                $occurredUtc = (string)($r['occurred_at_utc'] ?? '');
                $dtUtc = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $occurredUtc, $utcTz);
                $dateLocal = $dtUtc ? $dtUtc->setTimezone($localTz)->format('Y-m-d') : substr($occurredUtc, 0, 10);
                $key = $r['employee_id'] . '|' . $dateLocal;
                if (!isset($byEmpDate[$key])) $byEmpDate[$key] = ['in' => null, 'out' => null, 'worked' => 0, 'has_in' => false, 'has_out' => false, 'punches' => []];
                if ($r['event_type'] === 'clockin') {
                    $byEmpDate[$key]['has_in'] = true;
                    if (!$byEmpDate[$key]['in'] || $occurredUtc < (string)$byEmpDate[$key]['in']) $byEmpDate[$key]['in'] = $occurredUtc;
                } elseif ($r['event_type'] === 'clockout') {
                    $byEmpDate[$key]['has_out'] = true;
                    if (!$byEmpDate[$key]['out'] || $occurredUtc > (string)$byEmpDate[$key]['out']) $byEmpDate[$key]['out'] = $occurredUtc;
                } elseif ($r['event_type'] === 'punch') {
                    $byEmpDate[$key]['has_in'] = true;
                    $byEmpDate[$key]['punches'][] = $occurredUtc;
                }
            }

            foreach ($byEmpDate as &$v) {
                $punches = $v['punches'] ?? [];
                if (!is_array($punches) || !$punches) continue;

                sort($punches, \SORT_STRING);

                $firstPunch = $punches[0] ?? null;
                if ($firstPunch) {
                    if (!$v['in'] || (string)$firstPunch < (string)$v['in']) $v['in'] = $firstPunch;
                }

                $pairCount = (int)floor(count($punches) / 2);
                if ($pairCount > 0) {
                    if ((count($punches) % 2) === 0) $v['has_out'] = true;
                    $worked = 0;
                    for ($i = 0; $i + 1 < count($punches); $i += 2) {
                        $inDt = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$punches[$i], $utcTz);
                        $outDt = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$punches[$i + 1], $utcTz);
                        if (!$inDt || !$outDt) continue;
                        $inTs = $inDt->getTimestamp();
                        $outTs = $outDt->getTimestamp();
                        if ($outTs <= $inTs) continue;
                        $worked += (int)floor(($outTs - $inTs) / 60);
                    }
                    $v['worked'] = max((int)$v['worked'], $worked);

                    $lastCompleteOut = $punches[($pairCount * 2) - 1] ?? null;
                    if ($lastCompleteOut) {
                        if (!$v['out'] || (string)$lastCompleteOut > (string)$v['out']) $v['out'] = $lastCompleteOut;
                    }
                }
            }
            unset($v);
        } else {
            $stmt2 = $pdo->prepare('SELECT ar.employee_id, ar.date, ar.clock_in, ar.clock_out, ar.duration_minutes FROM attendance_records ar JOIN employees e ON e.id=ar.employee_id WHERE e.tenant_id=? AND ar.date BETWEEN ? AND ? ORDER BY ar.date ASC, ar.clock_in ASC, ar.id ASC');
            $stmt2->execute([$tenantId, $startDate, $endDate]);
            $rows2 = $stmt2->fetchAll();
            foreach ($rows2 as $r) {
                $date = (string)$r['date'];
                $key = $r['employee_id'] . '|' . $date;
                if (!isset($byEmpDate[$key])) $byEmpDate[$key] = ['in' => null, 'out' => null, 'worked' => 0, 'has_in' => false, 'has_out' => false, 'punches' => []];

                $byEmpDate[$key]['has_in'] = true;
                $clockIn = $r['clock_in'] ?? null;
                if ($clockIn && (!$byEmpDate[$key]['in'] || (string)$clockIn < (string)$byEmpDate[$key]['in'])) {
                    $byEmpDate[$key]['in'] = $clockIn;
                }

                $clockOut = $r['clock_out'] ?? null;
                if ($clockOut) {
                    $byEmpDate[$key]['has_out'] = true;
                    if (!$byEmpDate[$key]['out'] || (string)$clockOut > (string)$byEmpDate[$key]['out']) {
                        $byEmpDate[$key]['out'] = $clockOut;
                    }
                }

                $dur = $r['duration_minutes'] ?? null;
                if (is_numeric($dur)) {
                    $byEmpDate[$key]['worked'] += max(0, (int)$dur);
                } else {
                    $inTs = $clockIn ? strtotime((string)$clockIn) : false;
                    $outTs = $clockOut ? strtotime((string)$clockOut) : false;
                    if ($inTs !== false && $outTs !== false) {
                        $byEmpDate[$key]['worked'] += max(0, (int)floor(($outTs - $inTs) / 60));
                    }
                }
            }
        }

        $result = [];
        $up = $pdo->prepare('INSERT INTO attendance_days(tenant_id, employee_id, date, in_time, out_time, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, status) VALUES (?,?,?,?,?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE in_time=VALUES(in_time), out_time=VALUES(out_time), worked_minutes=VALUES(worked_minutes), late_minutes=VALUES(late_minutes), early_leave_minutes=VALUES(early_leave_minutes), overtime_minutes=VALUES(overtime_minutes), status=VALUES(status)');
        foreach ($byEmpDate as $k => $v) {
            [$emp, $date] = explode('|', $k);
            $in = $v['in'];
            $out = $v['out'];
            $worked = isset($v['worked']) ? max(0, (int)$v['worked']) : 0;
            if ($worked === 0 && $in && $out) {
                $inDt = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$in, $utcTz);
                $outDt = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$out, $utcTz);
                if ($inDt && $outDt) {
                    $worked = max(0, (int)floor(($outDt->getTimestamp() - $inDt->getTimestamp()) / 60));
                }
            }

            $empId = (int)$emp;
            $shift = $shiftsByEmployee[$empId] ?? $defaultShift;
            $lateMinutes = 0;
            $earlyLeaveMinutes = 0;
            $overtimeMinutes = 0;

            if ($shift && $in) {
                $inUtc = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$in, $utcTz);
                $outUtc = $out ? \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$out, $utcTz) : null;
                $inLocal = $inUtc ? $inUtc->setTimezone($localTz) : null;
                $outLocal = $outUtc ? $outUtc->setTimezone($localTz) : null;

                $shiftStart = new \DateTimeImmutable($date . ' ' . $shift['start_time'], $localTz);
                $shiftEnd = new \DateTimeImmutable($date . ' ' . $shift['end_time'], $localTz);
                if ($shiftEnd->getTimestamp() <= $shiftStart->getTimestamp()) $shiftEnd = $shiftEnd->modify('+1 day');

                if ($inLocal) {
                    $lateThreshold = $shiftStart->getTimestamp() + ((int)($shift['late_tolerance_minutes'] ?? 0) * 60);
                    if ($inLocal->getTimestamp() > $lateThreshold) $lateMinutes = max(0, (int)floor(($inLocal->getTimestamp() - $shiftStart->getTimestamp()) / 60));
                }

                if ($outLocal) {
                    $earlyThreshold = $shiftEnd->getTimestamp() - ((int)($shift['early_exit_tolerance_minutes'] ?? 0) * 60);
                    if ($outLocal->getTimestamp() < $earlyThreshold) $earlyLeaveMinutes = max(0, (int)floor(($shiftEnd->getTimestamp() - $outLocal->getTimestamp()) / 60));
                    if ($outLocal->getTimestamp() > $shiftEnd->getTimestamp()) $overtimeMinutes = max(0, (int)floor(($outLocal->getTimestamp() - $shiftEnd->getTimestamp()) / 60));
                }
            }

            $statusBase = ($v['has_in'] && $v['has_out']) ? 'Present' : ($v['has_in'] ? 'Incomplete' : 'Absent');
            $tags = [];
            if ($statusBase === 'Present') {
                if ($lateMinutes > 0) $tags[] = 'Late';
                if ($earlyLeaveMinutes > 0) $tags[] = 'Early Leave';
                if ($overtimeMinutes > 0) $tags[] = 'Overtime';
            }
            $status = ($statusBase === 'Present' && $tags) ? implode(', ', $tags) : $statusBase;

            $up->execute([$tenantId, $empId, $date, $in, $out, $worked, $lateMinutes, $earlyLeaveMinutes, $overtimeMinutes, $status]);
            $result[] = ['employee_id' => $empId, 'date' => $date, 'in_time' => $in, 'out_time' => $out, 'worked_minutes' => $worked, 'late_minutes' => $lateMinutes, 'early_leave_minutes' => $earlyLeaveMinutes, 'overtime_minutes' => $overtimeMinutes, 'status' => $status];
        }

        return $result;
    }
}
