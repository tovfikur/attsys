<?php

namespace App\Payroll;

final class PayrollCalendar
{
    public static function summarizeRange(
        string $start,
        string $end,
        array $workingDays,
        array $holidayDatesSet,
        array $leaveByDate,
        array $attendanceByDate
    ): array {
        $startDt = new \DateTimeImmutable($start);
        $endDt = new \DateTimeImmutable($end);
        if ($startDt > $endDt) {
            $tmp = $startDt;
            $startDt = $endDt;
            $endDt = $tmp;
        }

        $workingDaysSet = array_fill_keys($workingDays, true);
        $totalDays = (int)$endDt->diff($startDt)->days + 1;

        $scheduledWorkDays = 0.0;
        $presentDays = 0.0;
        $paidLeaveDays = 0.0;
        $unpaidLeaveDays = 0.0;
        $absentDays = 0.0;
        $weeklyOffDays = 0;
        $holidayDays = 0;

        for ($d = $startDt; $d <= $endDt; $d = $d->modify('+1 day')) {
            $date = $d->format('Y-m-d');
            $dow = $d->format('D');

            $isWorkDay = isset($workingDaysSet[$dow]);
            $isHoliday = isset($holidayDatesSet[$date]);
            if (!$isWorkDay) $weeklyOffDays++;
            if ($isHoliday) $holidayDays++;

            $scheduled = $isWorkDay && !$isHoliday;
            if (!$scheduled) continue;
            $scheduledWorkDays += 1.0;

            $leavePaid = 0.0;
            $leaveUnpaid = 0.0;
            foreach (($leaveByDate[$date] ?? []) as $lr) {
                $frac = self::dayPartFraction($lr['day_part'] ?? null);
                $isPaid = (int)($lr['is_paid'] ?? 1) ? 1 : 0;
                if ($isPaid) $leavePaid += $frac;
                else $leaveUnpaid += $frac;
            }
            $leaveTotal = min(1.0, $leavePaid + $leaveUnpaid);
            $leavePaid = min(1.0, $leavePaid);
            $leaveUnpaid = min(1.0, $leaveUnpaid);

            if ($leavePaid > 0) $paidLeaveDays += $leavePaid;
            if ($leaveUnpaid > 0) $unpaidLeaveDays += $leaveUnpaid;

            $att = $attendanceByDate[$date] ?? null;
            $attStatus = $att ? (string)($att['status'] ?? '') : '';
            $isPresent = $att && $attStatus !== 'Absent' && $attStatus !== 'Incomplete';

            if ($isPresent) {
                $presentDays += max(0.0, 1.0 - $leaveTotal);
                continue;
            }

            $missing = max(0.0, 1.0 - $leaveTotal);
            if ($missing > 0) $absentDays += $missing;
        }

        $payableDays = max(0.0, $scheduledWorkDays - $unpaidLeaveDays - $absentDays);

        return [
            'total_days' => $totalDays,
            'working_days' => $scheduledWorkDays,
            'present_days' => $presentDays,
            'paid_leave_days' => $paidLeaveDays,
            'unpaid_leave_days' => $unpaidLeaveDays,
            'absent_days' => $absentDays,
            'weekly_off_days' => $weeklyOffDays,
            'payable_days' => $payableDays,
            'holidays' => $holidayDays,
        ];
    }

    private static function dayPartFraction(?string $raw): float
    {
        if (!is_string($raw)) return 1.0;
        $v = strtolower(trim($raw));
        if ($v === '' || $v === 'full') return 1.0;
        if ($v === 'half') return 0.5;
        if ($v === 'am' || $v === 'pm') return 0.5;
        return 1.0;
    }
}

