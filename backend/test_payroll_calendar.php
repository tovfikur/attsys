<?php

require_once __DIR__ . '/src/Payroll/PayrollCalendar.php';

use App\Payroll\PayrollCalendar;

function assertNear(string $label, float $expected, float $actual, float $eps = 0.0001): void
{
    if (abs($expected - $actual) > $eps) {
        fwrite(STDERR, $label . " expected=" . $expected . " actual=" . $actual . "\n");
        exit(1);
    }
}

function assertEq(string $label, $expected, $actual): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, $label . " expected=" . var_export($expected, true) . " actual=" . var_export($actual, true) . "\n");
        exit(1);
    }
}

$workingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
$holidays = ['2026-01-01' => true];

$leavesByDate = [
    '2026-01-05' => [
        ['day_part' => 'full', 'is_paid' => 1],
    ],
    '2026-01-06' => [
        ['day_part' => 'pm', 'is_paid' => 0],
    ],
];

$attendanceByDate = [
    '2026-01-02' => ['status' => 'Present'],
    '2026-01-06' => ['status' => 'Late'],
];

$s = PayrollCalendar::summarizeRange(
    '2026-01-01',
    '2026-01-07',
    $workingDays,
    $holidays,
    $leavesByDate,
    $attendanceByDate
);

assertEq('total_days', 7, $s['total_days']);
assertNear('working_days', 4.0, (float)$s['working_days']);
assertNear('present_days', 1.5, (float)$s['present_days']);
assertNear('paid_leave_days', 1.0, (float)$s['paid_leave_days']);
assertNear('unpaid_leave_days', 0.5, (float)$s['unpaid_leave_days']);
assertNear('absent_days', 1.0, (float)$s['absent_days']);
assertEq('weekly_off_days', 2, $s['weekly_off_days']);
assertEq('holidays', 1, $s['holidays']);
assertNear('payable_days', 2.5, (float)$s['payable_days']);

echo "OK\n";

