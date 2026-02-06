<?php

namespace App\Payroll;

use App\Core\Database;
use App\Core\AttendanceStore;
use App\Core\EmployeesStore;
use App\Core\AttendanceProcessor;
use DateTime;
use DateTimeZone;

use App\Core\Mailer;

class PayrollService
{
    private $store;
    private $attStore;
    private $empStore;
    private $processor;
    private $tenantId;
    private $db;
    private $mailer;

    public function __construct(int $tenantId)
    {
        $this->tenantId = $tenantId;
        $this->store = new PayrollStore($tenantId);
        $this->attStore = new AttendanceStore(Database::get(), $tenantId);
        $this->empStore = new EmployeesStore(Database::get(), $tenantId);
        $this->processor = new AttendanceProcessor();
        $this->db = Database::get();
        $this->mailer = new Mailer();
    }

    public function createCycle(string $name, string $start, string $end)
    {
        return $this->store->createCycle($name, $start, $end);
    }

    public function addLoan(array $data)
    {
        // Validation
        if ($data['monthly_installment'] > $data['amount']) {
            throw new \Exception("Installment cannot be greater than loan amount");
        }
        
        $data['total_repayment_amount'] = $data['amount'] + ($data['amount'] * ($data['interest_rate'] ?? 0) / 100);
        
        return $this->store->createLoan($data);
    }

    public function addAdvance(array $data)
    {
        $data['type'] = 'advance';
        $data['interest_rate'] = 0;
        // Ideally, advance is fully recovered in the immediate next payroll
        // So installment = amount
        $data['monthly_installment'] = $data['amount'];
        
        return $this->addLoan($data);
    }

    public function runPayroll(int $cycleId)
    {
        $cycle = $this->store->getCycle($cycleId);
        if (!$cycle) throw new \Exception("Cycle not found");
        if (in_array($cycle['status'], ['approved', 'locked', 'paid'], true)) {
            throw new \Exception("Cycle cannot be recalculated after approval or payment");
        }

        // Ensure attendance data is processed and up-to-date
        $this->processor->processRange($this->tenantId, $cycle['start_date'], $cycle['end_date']);

        $this->store->markCycleProcessed($cycleId);

        $employees = $this->empStore->all();
        $results = [];

        foreach ($employees as $emp) {
            if ($emp['status'] !== 'active') continue;
            
            try {
                $payslipId = $this->calculateEmployeeSalary($emp, $cycle);
                $results[] = ['employee_id' => $emp['id'], 'payslip_id' => $payslipId, 'status' => 'success'];
            } catch (\Exception $e) {
                $results[] = ['employee_id' => $emp['id'], 'status' => 'error', 'message' => $e->getMessage()];
            }
        }

        return $results;
    }

    public function getEmployeeDayStatuses(int $employeeId, string $start, string $end): array
    {
        $workingDays = $this->getEmployeeWorkingDays($employeeId);
        $workingDaysSet = array_fill_keys($workingDays, true);

        $holidaysSet = [];
        $stmtH = $this->db->prepare('SELECT date, name FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ?');
        $stmtH->execute([$this->tenantId, $start, $end]);
        foreach ($stmtH->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $d = (string)($r['date'] ?? '');
            if ($d === '') continue;
            $holidaysSet[$d] = (string)($r['name'] ?? '');
        }

        $leavesByDate = [];
        $stmtL = $this->db->prepare("
            SELECT l.date, l.leave_type, l.day_part, COALESCE(lt.is_paid, CASE WHEN l.leave_type='unpaid' THEN 0 ELSE 1 END) AS is_paid
            FROM leaves l
            LEFT JOIN leave_types lt ON lt.tenant_id=l.tenant_id AND lt.code=l.leave_type
            WHERE l.tenant_id=? AND l.employee_id=? AND l.date BETWEEN ? AND ? AND l.status='approved'
        ");
        $stmtL->execute([$this->tenantId, $employeeId, $start, $end]);
        foreach ($stmtL->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $d = (string)($r['date'] ?? '');
            if ($d === '') continue;
            if (!isset($leavesByDate[$d])) $leavesByDate[$d] = [];
            $leavesByDate[$d][] = $r;
        }

        $attendanceByDate = [];
        $stmtA = $this->db->prepare("
            SELECT date, status, late_minutes, early_leave_minutes, overtime_minutes, worked_minutes
            FROM attendance_days
            WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ?
        ");
        $stmtA->execute([$this->tenantId, $employeeId, $start, $end]);
        foreach ($stmtA->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $d = (string)($r['date'] ?? '');
            if ($d === '') continue;
            $attendanceByDate[$d] = $r;
        }

        $startDt = new \DateTimeImmutable($start);
        $endDt = new \DateTimeImmutable($end);
        if ($startDt > $endDt) {
            $tmp = $startDt;
            $startDt = $endDt;
            $endDt = $tmp;
        }

        $out = [];
        for ($d = $startDt; $d <= $endDt; $d = $d->modify('+1 day')) {
            $date = $d->format('Y-m-d');
            $dow = $d->format('D');

            $isWorkDay = isset($workingDaysSet[$dow]);
            $holidayName = $holidaysSet[$date] ?? null;
            $isHoliday = $holidayName !== null;
            $isWeeklyOff = !$isWorkDay;
            $isScheduled = $isWorkDay && !$isHoliday;

            $leavePaid = 0.0;
            $leaveUnpaid = 0.0;
            $leaveTypes = [];
            foreach (($leavesByDate[$date] ?? []) as $lr) {
                $isPaid = (int)($lr['is_paid'] ?? 1) ? 1 : 0;
                $frac = $this->dayPartToFraction($lr['day_part'] ?? null);
                if ($isPaid) $leavePaid += $frac;
                else $leaveUnpaid += $frac;
                $leaveTypes[] = (string)($lr['leave_type'] ?? '');
            }
            $leavePaid = min(1.0, $leavePaid);
            $leaveUnpaid = min(1.0, $leaveUnpaid);

            $att = $attendanceByDate[$date] ?? null;
            $attStatus = $att ? (string)($att['status'] ?? '') : null;
            $present = $att && $attStatus !== 'Absent' && $attStatus !== 'Incomplete';

            $status = 'n/a';
            if ($isHoliday) $status = 'holiday';
            elseif ($isWeeklyOff) $status = 'weekly_off';
            elseif ($leavePaid > 0 && $leaveUnpaid > 0) $status = 'leave_mixed';
            elseif ($leaveUnpaid > 0 && $present) $status = 'present_and_unpaid_leave';
            elseif ($leavePaid > 0 && $present) $status = 'present_and_paid_leave';
            elseif ($leaveUnpaid > 0) $status = 'unpaid_leave';
            elseif ($leavePaid > 0) $status = 'paid_leave';
            elseif ($present) $status = 'present';
            else $status = 'absent';

            $out[] = [
                'date' => $date,
                'day' => $dow,
                'scheduled_workday' => $isScheduled ? 1 : 0,
                'weekly_off' => $isWeeklyOff ? 1 : 0,
                'holiday' => $isHoliday ? 1 : 0,
                'holiday_name' => $holidayName,
                'leave_paid' => $leavePaid,
                'leave_unpaid' => $leaveUnpaid,
                'leave_types' => array_values(array_filter(array_unique($leaveTypes))),
                'attendance_status' => $attStatus,
                'late_minutes' => $att ? (int)($att['late_minutes'] ?? 0) : 0,
                'early_leave_minutes' => $att ? (int)($att['early_leave_minutes'] ?? 0) : 0,
                'overtime_minutes' => $att ? (int)($att['overtime_minutes'] ?? 0) : 0,
                'worked_minutes' => $att ? (int)($att['worked_minutes'] ?? 0) : 0,
                'status' => $status,
            ];
        }

        return $out;
    }

    public function emailPayslip(int $payslipId)
    {
        $payslip = $this->store->getPayslip($payslipId);
        if (!$payslip) {
            throw new \Exception("Payslip not found");
        }

        if (empty($payslip['email'])) {
            throw new \Exception("Employee does not have an email address");
        }

        // Fetch cycle to get dates
        $cycle = $this->store->getCycle($payslip['payroll_cycle_id']);
        if ($cycle) {
            $payslip['start_date'] = $cycle['start_date'];
            $payslip['end_date'] = $cycle['end_date'];
            $payslip['cycle_name'] = $cycle['name'];
        }

        $html = $this->generatePayslipEmailHtml($payslip);
        $dateStr = isset($payslip['start_date']) ? date('F Y', strtotime($payslip['start_date'])) : 'Unknown Period';
        $subject = "Payslip for " . $dateStr;
        
        return $this->mailer->send($payslip['email'], $subject, $html);
    }

    public function emailPayslipsForCycle(int $cycleId)
    {
        $payslips = $this->store->getPayslips($cycleId);
        $results = [
            'total' => count($payslips),
            'sent' => 0,
            'failed' => 0,
            'errors' => []
        ];

        foreach ($payslips as $payslip) {
            try {
                // Fetch full details including email (getPayslips might check email, but getPayslip definitely has it)
                // Actually, getPayslips now fetches email too.
                if (empty($payslip['email'])) {
                    // Skip silently or log? Let's skip.
                    continue;
                }
                
                // We need items for the HTML generation, which getPayslips (list) might not have.
                // Let's call emailPayslip directly which re-fetches full details.
                $this->emailPayslip($payslip['id']);
                $results['sent']++;
            } catch (\Exception $e) {
                $results['failed']++;
                $results['errors'][] = "Employee {$payslip['employee_code']}: " . $e->getMessage();
            }
        }

        return $results;
    }

    private function generatePayslipEmailHtml(array $payslip)
    {
        $period = "Unknown Period";
        if (isset($payslip['cycle_name'])) {
             $period = $payslip['cycle_name'] . " (" . $payslip['start_date'] . " to " . $payslip['end_date'] . ")";
        } elseif (isset($payslip['payroll_cycle_id'])) {
             $cycle = $this->store->getCycle($payslip['payroll_cycle_id']);
             if ($cycle) {
                 $period = $cycle['name'] . " (" . $cycle['start_date'] . " to " . $cycle['end_date'] . ")";
             }
        }

        $itemsHtml = "";
        if (isset($payslip['items']) && is_array($payslip['items'])) {
            foreach ($payslip['items'] as $item) {
                $amount = number_format($item['amount'], 2);
                $type = ucfirst($item['type']);
                $itemsHtml .= "<tr><td>{$item['name']}</td><td>{$type}</td><td style='text-align:right'>{$amount}</td></tr>";
            }
        }

        return "
            <html>
            <body style='font-family: Arial, sans-serif;'>
                <h2>Payslip for {$payslip['employee_name']}</h2>
                <p><strong>Employee Code:</strong> {$payslip['employee_code']}</p>
                <p><strong>Department:</strong> {$payslip['department']}</p>
                <p><strong>Period:</strong> {$period}</p>
                <hr>
                <table style='width: 100%; border-collapse: collapse;'>
                    <thead>
                        <tr style='background-color: #f2f2f2;'>
                            <th style='text-align:left; padding: 8px;'>Description</th>
                            <th style='text-align:left; padding: 8px;'>Type</th>
                            <th style='text-align:right; padding: 8px;'>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {$itemsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan='2' style='padding: 8px; font-weight: bold;'>Gross Salary</td>
                            <td style='padding: 8px; text-align:right; font-weight: bold;'>" . number_format($payslip['gross_salary'], 2) . "</td>
                        </tr>
                        <tr>
                            <td colspan='2' style='padding: 8px; font-weight: bold;'>Total Deductions</td>
                            <td style='padding: 8px; text-align:right; font-weight: bold;'>" . number_format($payslip['total_deductions'], 2) . "</td>
                        </tr>
                         <tr>
                            <td colspan='2' style='padding: 8px; font-weight: bold;'>Tax</td>
                            <td style='padding: 8px; text-align:right; font-weight: bold;'>" . number_format($payslip['tax_deducted'], 2) . "</td>
                        </tr>
                        <tr style='background-color: #e6f7ff;'>
                            <td colspan='2' style='padding: 8px; font-weight: bold;'>Net Salary</td>
                            <td style='padding: 8px; text-align:right; font-weight: bold;'>" . number_format($payslip['net_salary'], 2) . "</td>
                        </tr>
                    </tfoot>
                </table>
                <p style='margin-top: 20px; font-size: 0.8em; color: #666;'>This is a system generated email.</p>
            </body>
            </html>
        ";
    }

    public function getPayslip(int $id)
    {
        return $this->store->getPayslip($id);
    }

    public function generatePayslipHtml(int $payslipId)
    {
        $payslip = $this->store->getPayslip($payslipId);
        if (!$payslip) {
            throw new \Exception("Payslip not found");
        }

        $period = "N/A";
        if (!empty($payslip['payroll_cycle_id'])) {
             $stmt = $this->pdo->prepare("SELECT name, start_date, end_date FROM payroll_cycles WHERE id = ?");
             $stmt->execute([$payslip['payroll_cycle_id']]);
             $cycle = $stmt->fetch();
             if ($cycle) {
                 $period = $cycle['name'] . " (" . $cycle['start_date'] . " to " . $cycle['end_date'] . ")";
             }
        }

        $itemsHtml = "";
        $earningsHtml = "";
        $deductionsHtml = "";
        
        if (isset($payslip['items']) && is_array($payslip['items'])) {
            foreach ($payslip['items'] as $item) {
                $amount = number_format($item['amount'], 2);
                $row = "<tr>
                    <td style='padding: 8px; border-bottom: 1px solid #eee;'>{$item['name']}</td>
                    <td style='padding: 8px; border-bottom: 1px solid #eee; text-align: right;'>{$amount}</td>
                </tr>";
                
                if ($item['type'] === 'earning') {
                    $earningsHtml .= $row;
                } else {
                    $deductionsHtml .= $row;
                }
            }
        }

        // Add Tax as deduction row if > 0
        if ($payslip['tax_deducted'] > 0) {
             $deductionsHtml .= "<tr>
                <td style='padding: 8px; border-bottom: 1px solid #eee;'>Tax / TDS</td>
                <td style='padding: 8px; border-bottom: 1px solid #eee; text-align: right;'>" . number_format($payslip['tax_deducted'], 2) . "</td>
            </tr>";
        }

        $gross = number_format($payslip['gross_salary'], 2);
        $totalDed = number_format($payslip['total_deductions'] + $payslip['tax_deducted'], 2);
        $net = number_format($payslip['net_salary'], 2);
        $date = date('d M Y');

        return "
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payslip - {$payslip['employee_name']}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; }
                    .header p { margin: 5px 0 0; color: #666; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f9f9f9; padding: 20px; border-radius: 8px; }
                    .info-item { margin-bottom: 5px; }
                    .info-label { font-weight: bold; color: #555; width: 120px; display: inline-block; }
                    .tables-container { display: flex; gap: 30px; margin-bottom: 30px; }
                    .table-box { flex: 1; }
                    .table-box h3 { border-bottom: 2px solid #ddd; padding-bottom: 10px; margin-bottom: 15px; font-size: 16px; text-transform: uppercase; color: #444; }
                    table { width: 100%; border-collapse: collapse; font-size: 14px; }
                    th { text-align: left; }
                    .total-row { font-weight: bold; background: #f0f0f0; }
                    .total-row td { padding: 10px 8px; }
                    .net-pay { background: #333; color: white; padding: 20px; text-align: center; border-radius: 8px; margin-top: 30px; }
                    .net-pay-label { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9; }
                    .net-pay-amount { font-size: 32px; font-weight: bold; margin-top: 5px; }
                    .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
                    .print-btn { position: fixed; bottom: 20px; right: 20px; padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 25px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2); font-weight: bold; }
                    @media print {
                        .print-btn { display: none; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <button class='print-btn' onclick='window.print()'>Print / Save PDF</button>
                
                <div class='header'>
                    <h1>Payslip</h1>
                    <p>{$payslip['employee_name']} • {$period}</p>
                </div>

                <div class='info-grid'>
                    <div>
                        <div class='info-item'><span class='info-label'>Employee Code:</span> {$payslip['employee_code']}</div>
                        <div class='info-item'><span class='info-label'>Department:</span> {$payslip['department']}</div>
                        <div class='info-item'><span class='info-label'>Designation:</span> {$payslip['designation']}</div>
                    </div>
                    <div>
                         <div class='info-item'><span class='info-label'>Date of Joining:</span> {$payslip['date_of_joining']}</div>
                         <div class='info-item'><span class='info-label'>Generated On:</span> {$date}</div>
                    </div>
                </div>

                <div class='tables-container'>
                    <div class='table-box'>
                        <h3>Earnings</h3>
                        <table>
                            <tbody>{$earningsHtml}</tbody>
                            <tfoot>
                                <tr class='total-row'>
                                    <td>Total Earnings</td>
                                    <td style='text-align: right;'>{$gross}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <div class='table-box'>
                        <h3>Deductions</h3>
                        <table>
                            <tbody>{$deductionsHtml}</tbody>
                            <tfoot>
                                <tr class='total-row'>
                                    <td>Total Deductions</td>
                                    <td style='text-align: right;'>{$totalDed}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <div class='net-pay'>
                    <div class='net-pay-label'>Net Payable Salary</div>
                    <div class='net-pay-amount'>{$net}</div>
                </div>

                <div class='footer'>
                    <p>This is a system generated payslip. Signature not required.</p>
                </div>
            </body>
            </html>
        ";
    }

    private function calculateEmployeeSalary($employee, $cycle)
    {
        $empId = $employee['id'];
        $startDate = $cycle['start_date'];
        $endDate = $cycle['end_date'];

        // 1. Get Salary Structure
        $structure = $this->store->getSalaryStructure($empId);
        if (!$structure) {
            throw new \Exception("No active salary structure found for employee {$employee['code']}");
        }

        // 2. Get Attendance Data
        // We reuse logic from AttendanceProcessor/Controller to get summaries
        // For simplicity, we'll implement a focused summary fetcher here or use raw queries
        // Using raw queries for performance in batch
        $attendanceData = $this->getAttendanceSummary($empId, $startDate, $endDate);

        // 3. Calculation Constants
        $baseSalary = (float)$structure['base_salary'];
        $daysInCycle = (int)($attendanceData['total_days'] ?? 0);
        $scheduledWorkDays = (float)($attendanceData['working_days'] ?? 0);

        $prorationBasis = (string)$this->store->getSetting('proration_basis', 'calendar');
        $prorationBasis = strtolower(trim($prorationBasis));
        $daysPerMonth = (float)$this->store->getSetting('days_per_month', 30);

        if ($prorationBasis === 'working') {
            $denom = $scheduledWorkDays > 0 ? $scheduledWorkDays : 1;
            $perDaySalary = $baseSalary / $denom;
        } elseif ($prorationBasis === 'fixed_days_per_month') {
            $denom = $daysPerMonth > 0 ? $daysPerMonth : 30;
            $perDaySalary = $baseSalary / $denom;
        } else {
            $denom = $daysInCycle > 0 ? $daysInCycle : 1;
            $perDaySalary = $baseSalary / $denom;
        }
        
        // 4. Calculate Earnings
        $earnings = [];
        $deductions = [];

        // Basic
        $earnings[] = ['name' => 'Basic Salary', 'type' => 'earning', 'amount' => $baseSalary, 'is_variable' => 0];
        $grossEarning = $baseSalary;

        // Fixed Allowances
        if (!empty($structure['items'])) {
            foreach ($structure['items'] as $item) {
                $amount = (float)$item['amount'];
                if (!empty($item['is_percentage']) && $item['is_percentage']) {
                     $amount = ($baseSalary * (float)$item['percentage']) / 100;
                }

                if ($item['type'] === 'earning') {
                    $earnings[] = ['name' => $item['name'], 'type' => 'earning', 'amount' => $amount, 'is_variable' => 0];
                    $grossEarning += $amount;
                } else {
                    $deductions[] = ['name' => $item['name'], 'type' => 'deduction', 'amount' => $amount, 'is_variable' => 0];
                }
            }
        }

        // 5. Variable Calculations
        
        // Unpaid Leave Deduction
        $unpaidDays = $attendanceData['unpaid_leave_days'];
        $unpaidDeduction = round($unpaidDays * $perDaySalary, 2);
        if ($unpaidDeduction > 0) {
            $deductions[] = ['name' => "Unpaid Leave ($unpaidDays days)", 'type' => 'deduction', 'amount' => $unpaidDeduction, 'is_variable' => 1];
        }

        // Absence Deduction (Scheduled workdays with no attendance and no approved leave)
        $absentDays = (float)($attendanceData['absent_days'] ?? 0);
        $absentDeduction = round($absentDays * $perDaySalary, 2);
        if ($absentDeduction > 0) {
            $deductions[] = ['name' => "Absence ($absentDays days)", 'type' => 'deduction', 'amount' => $absentDeduction, 'is_variable' => 1];
        }

        // Overtime (Simple Formula: Hourly Rate = Basic / 240)
        // 240 = 30 days * 8 hours
        $overtimeHours = $attendanceData['overtime_hours'];
        
        $otRateMultiplier = (float)$this->store->getSetting('overtime_rate_multiplier', 1.5);
        $workHoursPerDay = (float)$this->store->getSetting('work_hours_per_day', 8);
        $daysPerMonth = (float)$this->store->getSetting('days_per_month', 30);
        
        $hourlyRate = ($daysPerMonth > 0 && $workHoursPerDay > 0) ? ($baseSalary / $daysPerMonth) / $workHoursPerDay : 0;
        $otAmount = round($overtimeHours * $hourlyRate * $otRateMultiplier, 2);
        if ($otAmount > 0) {
            $earnings[] = ['name' => "Overtime ($overtimeHours hrs)", 'type' => 'earning', 'amount' => $otAmount, 'is_variable' => 1];
            $grossEarning += $otAmount;
        }

        // Late Penalty
        $lateMinutes = $attendanceData['late_minutes'];
        if ($lateMinutes > 0) {
            // Simple formula: Deduction = (Late Minutes / 60) * Hourly Rate
            // No multiplier, just straight deduction for time lost
            $latePenaltyMultiplier = (float)$this->store->getSetting('late_penalty_multiplier', 1);
            $lateDeduction = round(($lateMinutes / 60) * $hourlyRate * max(0, $latePenaltyMultiplier), 2);
            if ($lateDeduction > 0) {
                $deductions[] = ['name' => "Late Penalty ($lateMinutes mins)", 'type' => 'deduction', 'amount' => $lateDeduction, 'is_variable' => 1];
            }
        }

        // Early Leave Penalty
        $earlyMinutes = $attendanceData['early_leave_minutes'];
        if ($earlyMinutes > 0) {
            $earlyPenaltyMultiplier = (float)$this->store->getSetting('early_leave_penalty_multiplier', 1);
            $earlyDeduction = round(($earlyMinutes / 60) * $hourlyRate * max(0, $earlyPenaltyMultiplier), 2);
            if ($earlyDeduction > 0) {
                $deductions[] = ['name' => "Early Leave Penalty ($earlyMinutes mins)", 'type' => 'deduction', 'amount' => $earlyDeduction, 'is_variable' => 1];
            }
        }

        // Variable Pay (Bonuses / Incentives / Commissions / Penalties)
        $bonusIds = [];
        $nonTaxableBonus = 0;
        $bonuses = $this->store->getBonusesForEmployeeCycle($empId, $cycle['id']);
        foreach ($bonuses as $bonus) {
            $amount = (float)$bonus['amount'];
            if ($amount <= 0) continue;
            $bonusIds[] = (int)$bonus['id'];
            $kind = strtolower((string)($bonus['kind'] ?? 'bonus'));
            $direction = strtolower((string)($bonus['direction'] ?? ''));
            if ($direction !== 'earning' && $direction !== 'deduction') {
                $direction = in_array($kind, ['penalty', 'fine'], true) ? 'deduction' : 'earning';
            }

            $labelKind = $kind ? ucfirst($kind) : 'Bonus';
            $label = "{$labelKind}: {$bonus['title']}";

            if ($direction === 'deduction') {
                $deductions[] = [
                    'name' => $label,
                    'type' => 'deduction',
                    'amount' => $amount,
                    'is_variable' => 1
                ];
            } else {
                $earnings[] = [
                    'name' => $label,
                    'type' => 'earning',
                    'amount' => $amount,
                    'is_variable' => 1
                ];
                $grossEarning += $amount;
                if (empty($bonus['taxable'])) {
                    $nonTaxableBonus += $amount;
                }
            }
        }

        // 6. Loans & Advances Deduction
        $loans = $this->store->getActiveLoans($empId);
        $totalLoanDeduction = 0;
        foreach ($loans as $loan) {
            // Check if loan starts before or during this cycle
            if ($loan['start_date'] > $endDate) continue;

            $balance = (float)$loan['current_balance'];
            if ($balance <= 0) continue;

            // Calculate installment
            $installment = min($loan['monthly_installment'], $balance);
            
            if ($installment > 0) {
                $deductions[] = [
                    'name' => "Loan Repayment (ID: {$loan['id']})", 
                    'type' => 'deduction', 
                    'amount' => $installment, 
                    'is_variable' => 1,
                    'meta' => ['loan_id' => $loan['id']]
                ];
                $totalLoanDeduction += $installment;
            }
        }

        // 7. Tax Calculation (Simplified Progressive)
        // TODO: Fetch Tax Slabs
        $taxableIncome = max(0, $grossEarning - $nonTaxableBonus);
        $tax = $this->calculateTax($taxableIncome);
        if ($tax > 0) {
            $deductions[] = ['name' => 'Income Tax', 'type' => 'deduction', 'amount' => $tax, 'is_variable' => 1];
        }

        // 7b. Provident Fund (Employee Contribution) as Deduction
        $pfEmployeePercent = (float)$this->store->getSetting('pf_employee_contribution_percent', 0);
        if ($pfEmployeePercent > 0) {
            $pfEmployeeAmount = round(($baseSalary * $pfEmployeePercent) / 100, 2);
            if ($pfEmployeeAmount > 0) {
                $deductions[] = [
                    'name' => 'Provident Fund (Employee)',
                    'type' => 'deduction',
                    'amount' => $pfEmployeeAmount,
                    'is_variable' => 1
                ];
            }
        }

        // 8. Final Totals
        $totalDeductions = 0;
        foreach ($deductions as $d) $totalDeductions += $d['amount'];
        
        $netSalary = $grossEarning - $totalDeductions;

        // 9. Save Payslip
        $payslipData = [
            'payroll_cycle_id' => $cycle['id'],
            'employee_id' => $empId,
            'salary_structure_id' => $structure['id'],
            'total_days' => (int)($attendanceData['total_days'] ?? $daysInCycle),
            'working_days' => $attendanceData['working_days'], // Scheduled working days
            'present_days' => $attendanceData['present_days'],
            'paid_leave_days' => $attendanceData['paid_leave_days'],
            'unpaid_leave_days' => $unpaidDays,
            'absent_days' => $absentDays,
            'weekly_off_days' => (int)($attendanceData['weekly_off_days'] ?? 0),
            'payable_days' => (float)($attendanceData['payable_days'] ?? 0),
            'holidays' => $attendanceData['holidays'],
            'late_minutes' => $attendanceData['late_minutes'],
            'overtime_hours' => $overtimeHours,
            'gross_salary' => $grossEarning,
            'total_deductions' => $totalDeductions,
            'net_salary' => $netSalary,
            'tax_deducted' => $tax
        ];

        $allItems = array_merge($earnings, $deductions);
        
        $payslipId = $this->store->savePayslip($payslipData, $allItems);
        $this->store->markBonusesApplied($bonusIds, $payslipId);
        return $payslipId;
    }

    public function addPayslipItem(int $payslipId, array $data)
    {
        // 1. Add the item
        $this->store->addPayslipItem($payslipId, $data);
        
        // 2. Recalculate
        return $this->recalculatePayslip($payslipId);
    }

    private function recalculatePayslip(int $payslipId)
    {
        // Get Payslip and Items
        $payslip = $this->store->getPayslip($payslipId);
        $items = $payslip['items'];

        // Calculate Gross
        $gross = 0;
        foreach ($items as $item) {
            if ($item['type'] === 'earning') {
                $gross += $item['amount'];
            }
        }

        // Recalculate Tax
        // Need to pass gross to calculateTax
        $tax = $this->calculateTax($gross);
        
        // Update Tax Item in DB (if it exists or needs to be created)
        // Only if tax > 0 or existing tax > 0
        if ($tax > 0 || $this->hasItem($items, 'Income Tax')) {
            $this->store->updatePayslipItemByName($payslipId, 'Income Tax', $tax);
        }
        
        // Re-fetch items because tax changed
        $payslip = $this->store->getPayslip($payslipId);
        $items = $payslip['items'];

        // Calculate Deductions
        $totalDeductions = 0;
        foreach ($items as $item) {
            if ($item['type'] === 'deduction') {
                $totalDeductions += $item['amount'];
            }
        }

        $net = $gross - $totalDeductions;

        // Update Payslip
        $this->store->updatePayslipFinancials($payslipId, $gross, $totalDeductions, $tax, $net);

        return $payslip;
    }

    private function hasItem($items, $name) {
        foreach ($items as $item) {
            if ($item['name'] === $name) return true;
        }
        return false;
    }

    private function parseWorkingDays(?string $raw): array
    {
        if (!is_string($raw) || trim($raw) === '') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        $parts = array_map('trim', explode(',', $raw));
        $out = [];
        foreach ($parts as $p) {
            if ($p === '') continue;
            $out[$p] = true;
        }
        $days = array_keys($out);
        return $days ?: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    }

    private function getEmployeeWorkingDays(int $employeeId): array
    {
        try {
            $stmt = $this->db->prepare('SELECT s.working_days FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? AND e.id=? LIMIT 1');
            $stmt->execute([$this->tenantId, $employeeId]);
            $raw = $stmt->fetchColumn();
            return $this->parseWorkingDays(is_string($raw) ? $raw : null);
        } catch (\Exception $e) {
            return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        }
    }

    private function dayPartToFraction($raw): float
    {
        if (!is_string($raw)) return 1.0;
        $v = strtolower(trim($raw));
        if ($v === '' || $v === 'full') return 1.0;
        if ($v === 'half') return 0.5;
        if ($v === 'am' || $v === 'pm') return 0.5;
        return 1.0;
    }

    private function getAttendanceSummary($empId, $start, $end)
    {
        $workingDays = $this->getEmployeeWorkingDays((int)$empId);

        $holidaysSet = [];
        try {
            $stmtH = $this->db->prepare('SELECT date FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ?');
            $stmtH->execute([$this->tenantId, $start, $end]);
            foreach ($stmtH->fetchAll(\PDO::FETCH_COLUMN) as $d) {
                if (is_string($d)) $holidaysSet[$d] = true;
            }
        } catch (\Exception $e) {
        }

        $leavesByDate = [];
        try {
            $stmtL = $this->db->prepare("
                SELECT l.date, l.leave_type, l.day_part, COALESCE(lt.is_paid, CASE WHEN l.leave_type='unpaid' THEN 0 ELSE 1 END) AS is_paid
                FROM leaves l
                LEFT JOIN leave_types lt ON lt.tenant_id=l.tenant_id AND lt.code=l.leave_type
                WHERE l.tenant_id=? AND l.employee_id=? AND l.date BETWEEN ? AND ? AND l.status='approved'
            ");
            $stmtL->execute([$this->tenantId, $empId, $start, $end]);
            foreach ($stmtL->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $date = (string)($r['date'] ?? '');
                if ($date === '') continue;
                if (!isset($leavesByDate[$date])) $leavesByDate[$date] = [];
                $leavesByDate[$date][] = $r;
            }
        } catch (\Exception $e) {
        }

        $attByDate = [];
        $lateTotal = 0;
        $earlyTotal = 0;
        $otMinutesTotal = 0;
        try {
            $stmtA = $this->db->prepare("
                SELECT date, status, late_minutes, early_leave_minutes, overtime_minutes, worked_minutes
                FROM attendance_days
                WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ?
            ");
            $stmtA->execute([$this->tenantId, $empId, $start, $end]);
            foreach ($stmtA->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $date = (string)($r['date'] ?? '');
                if ($date === '') continue;
                $attByDate[$date] = $r;

                $status = (string)($r['status'] ?? '');
                if ($status === 'Absent' || $status === 'Incomplete') continue;
                $lateTotal += (int)($r['late_minutes'] ?? 0);
                $earlyTotal += (int)($r['early_leave_minutes'] ?? 0);
                $otMinutesTotal += (int)($r['overtime_minutes'] ?? 0);
            }
        } catch (\Exception $e) {
        }

        $summary = PayrollCalendar::summarizeRange($start, $end, $workingDays, $holidaysSet, $leavesByDate, $attByDate);
        $summary['late_minutes'] = $lateTotal;
        $summary['early_leave_minutes'] = $earlyTotal;
        $summary['overtime_hours'] = round($otMinutesTotal / 60, 2);
        return $summary;
    }

    private function calculateTax($income)
    {
        $slabs = $this->store->getTaxSlabs();
        if (empty($slabs)) {
            // Fallback if no slabs defined
            return 0;
        }

        $tax = 0;
        $previousLimit = 0;

        // Ensure slabs are sorted by min_salary (done in store)
        foreach ($slabs as $slab) {
            $min = (float)$slab['min_salary'];
            $max = $slab['max_salary'] !== null ? (float)$slab['max_salary'] : null;
            $rate = (float)$slab['tax_percent'];

            if ($income > $min) {
                $taxableAmount = 0;
                
                if ($max === null) {
                    // Highest slab
                    $taxableAmount = $income - $min;
                } else {
                    // Middle slab
                    // Taxable is either the full slab width or the part of income falling in this slab
                    // But wait, if slabs are 0-1000, 1001-2000...
                    // Standard logic:
                    // Slab 1: 0 - 1000. Width = 1000.
                    // Slab 2: 1000 - 2000. Width = 1000.
                    // Note: Implementation usually assumes slabs start where previous ended.
                    
                    // Let's use the slab definition strictly.
                    // Taxable amount in this slab = min(income, max) - min
                    // However, we must ensure we don't double count if ranges overlap (they shouldn't).
                    // Also need to handle "gap" if min doesn't equal previous max?
                    // Let's assume clean data.
                    
                    $upperBound = min($income, $max);
                    if ($upperBound > $min) {
                        $taxableAmount = $upperBound - $min;
                    }
                }
                
                if ($taxableAmount > 0) {
                    $tax += $taxableAmount * ($rate / 100);
                }
            }
        }

        return round($tax, 2);
    }

    public function lockCycle(int $cycleId)
    {
        $cycle = $this->store->getCycle($cycleId);
        if (!$cycle) throw new \Exception("Cycle not found");
        if ($cycle['status'] !== 'approved') throw new \Exception("Cycle must be approved before locking");

        // 1. Process Loan Repayments (Update Balances)
        $this->processLoanRepayments($cycleId);

        // 2. Post to Accounting
        $this->postPayrollToLedger($cycleId, $cycle);

        // 3. Lock Cycle
        $this->store->updateCycleStatus($cycleId, 'locked');

        return true;
    }

    public function markCyclePaid(int $cycleId)
    {
        $cycle = $this->store->getCycle($cycleId);
        if (!$cycle) throw new \Exception("Cycle not found");
        if ($cycle['status'] !== 'locked') throw new \Exception("Cycle must be locked before payment");

        // 1. Mark all payslips as paid
        $this->store->markPayslipsPaid($cycleId);

        // 1b. Record payment history
        $payslips = $this->store->getPayslips($cycleId);
        $paymentDate = date('Y-m-d');
        foreach ($payslips as $p) {
            $amount = (float)($p['net_salary'] ?? 0);
            if ($amount <= 0) continue;
            $this->store->addPayslipPayment((int)$p['id'], $amount, $paymentDate, 'batch', null);
        }

        // 2. Update Cycle Status
        $this->store->updateCycleStatus($cycleId, 'paid');
        
        // 3. Post Payment to Ledger (Salary Payable Dr, Bank Cr)
        $this->postPaymentToLedger($cycleId, $cycle);

        return true;
    }

    public function recordPayslipPayment(int $payslipId, float $amount, string $paymentDate, string $method = 'bank_transfer', ?string $reference = null): array
    {
        $payslip = $this->store->getPayslip($payslipId);
        if (!$payslip) throw new \Exception("Payslip not found");
        $cycleId = (int)$payslip['payroll_cycle_id'];
        $cycle = $this->store->getCycle($cycleId);
        if (!$cycle) throw new \Exception("Cycle not found");
        if (!in_array($cycle['status'], ['locked', 'paid'], true)) {
            throw new \Exception("Cycle must be locked before payments can be recorded");
        }

        if ($amount <= 0) throw new \Exception("Payment amount must be greater than 0");

        $payments = $this->store->getPayslipPayments($payslipId);
        $paidTotal = 0;
        foreach ($payments as $p) $paidTotal += (float)($p['amount'] ?? 0);
        $net = (float)($payslip['net_salary'] ?? 0);
        $balance = max(0, $net - $paidTotal);
        if ($amount > $balance + 0.01) {
            throw new \Exception("Payment exceeds outstanding balance");
        }

        $paymentId = $this->store->addPayslipPayment($payslipId, $amount, $paymentDate, $method, $reference);
        $newPaidTotal = $paidTotal + $amount;
        $status = $newPaidTotal >= $net - 0.01 ? 'paid' : 'partial';
        $this->store->updatePayslipPaymentStatus($payslipId, $status, $paymentDate);

        $this->postPayslipPaymentToLedger($cycleId, $payslip, $amount, $paymentDate);

        if ($cycle['status'] === 'locked' && $this->store->countUnpaidPayslips($cycleId) === 0) {
            $this->store->updateCycleStatus($cycleId, 'paid');
        }

        return [
            'payment_id' => $paymentId,
            'status' => $status,
            'paid_amount' => $newPaidTotal,
            'balance' => max(0, $net - $newPaidTotal),
        ];
    }

    private function postPaymentToLedger(int $cycleId, array $cycle)
    {
        // Get Totals
        $totals = $this->store->getCycleTotals($cycleId);
        $totalNet = $totals['total_net'];

        if ($totalNet <= 0) return;

        $accPayable = $this->store->getAccountByCode('2001'); // Salary Payable
        $accBank = $this->store->getAccountByCode('1001'); // Bank Account

        if (!$accPayable || !$accBank) {
            // Cannot post if accounts missing, but don't block the paid status update
            // Just log or throw warning? For enterprise, we should probably throw.
            throw new \Exception("Chart of Accounts missing for Payment (2001 or 1001)");
        }

        $items = [
            [
                'account_id' => $accPayable['id'],
                'debit' => $totalNet,
                'credit' => 0
            ],
            [
                'account_id' => $accBank['id'],
                'debit' => 0,
                'credit' => $totalNet
            ]
        ];

        $header = [
            'reference_id' => $cycleId,
            'reference_type' => 'payroll_payment',
            'date' => date('Y-m-d'),
            'description' => "Salary Payment for " . $cycle['name']
        ];

        $this->store->createJournalEntry($header, $items);
    }

    private function postPayslipPaymentToLedger(int $cycleId, array $payslip, float $amount, string $paymentDate): void
    {
        if ($amount <= 0) return;
        $accPayable = $this->store->getAccountByCode('2001'); // Salary Payable
        $accBank = $this->store->getAccountByCode('1001'); // Bank Account

        if (!$accPayable || !$accBank) {
            throw new \Exception("Chart of Accounts missing for Payment (2001 or 1001)");
        }

        $items = [
            [
                'account_id' => $accPayable['id'],
                'debit' => $amount,
                'credit' => 0
            ],
            [
                'account_id' => $accBank['id'],
                'debit' => 0,
                'credit' => $amount
            ]
        ];

        $desc = "Payslip payment for {$payslip['employee_name']} ({$payslip['employee_code']})";
        $header = [
            'reference_id' => $cycleId,
            'reference_type' => 'payslip_payment',
            'date' => $paymentDate,
            'description' => $desc
        ];

        $this->store->createJournalEntry($header, $items);
    }

    private function processLoanRepayments(int $cycleId)
    {
        $payslips = $this->store->getPayslips($cycleId);
        foreach ($payslips as $p) {
            $payslip = $this->store->getPayslip($p['id']); // Fetch with items
            foreach ($payslip['items'] as $item) {
                // Check if this item is a loan repayment
                // In calculateEmployeeSalary, we stored meta or we can parse name
                // "Loan Repayment (ID: 123)"
                if (preg_match('/Loan Repayment \(ID: (\d+)\)/', $item['name'], $matches)) {
                    $loanId = (int)$matches[1];
                    $amount = (float)$item['amount'];
                    $this->store->recordLoanRepayment($loanId, $amount, $p['id'], date('Y-m-d'));
                }
            }
        }
    }

    private function postPayrollToLedger(int $cycleId, array $cycle)
    {
        // Aggregate Totals
        $payslips = $this->store->getPayslips($cycleId);
        if (empty($payslips)) throw new \Exception("No payslips generated for this cycle");

        $totalGross = 0;
        $totalTax = 0;
        $totalNet = 0;
        $totalDeductions = 0;

        foreach ($payslips as $p) {
            $totalGross += $p['gross_salary'];
            $totalTax += $p['tax_deducted'];
            $totalNet += $p['net_salary'];
            $totalDeductions += $p['total_deductions'];
        }

        $totalLoanRepayments = $this->store->getPayslipItemsSumByPattern($cycleId, 'Loan Repayment%');
        $basicSalaryTotal = $this->store->getPayslipItemsSumByPattern($cycleId, 'Basic Salary%');
        $pfEmployerPercent = (float)$this->store->getSetting('pf_employer_contribution_percent', 0);
        $pfEmployerAmount =
            $pfEmployerPercent > 0
                ? round(((float)$basicSalaryTotal * $pfEmployerPercent) / 100, 2)
                : 0;

        // Get Accounts
        $accExpense = $this->store->getAccountByCode('5001'); // Salary Expense
        $accPayable = $this->store->getAccountByCode('2001'); // Salary Payable
        $accTax = $this->store->getAccountByCode('2002'); // Tax Payable
        $accLoans = $this->store->getAccountByCode('1002'); // Employee Loans (Asset)
        $accPF = $this->store->getAccountByCode('2003'); // Provident Fund Payable

        if (!$accExpense || !$accPayable || !$accTax) {
            throw new \Exception("Chart of Accounts not fully configured (Missing 5001, 2001, or 2002)");
        }

        // Prepare Journal Items
        $items = [];

        // Debit Expense
        $items[] = [
            'account_id' => $accExpense['id'],
            'debit' => $totalGross,
            'credit' => 0
        ];

        // Credit Tax
        if ($totalTax > 0) {
            $items[] = [
                'account_id' => $accTax['id'],
                'debit' => 0,
                'credit' => $totalTax
            ];
        }

        // Credit Loan Asset (Repayment reduces asset)
        if ($totalLoanRepayments > 0 && $accLoans) {
            $items[] = [
                'account_id' => $accLoans['id'],
                'debit' => 0,
                'credit' => $totalLoanRepayments
            ];
        }

        // Credit Payable (Net)
        $items[] = [
            'account_id' => $accPayable['id'],
            'debit' => 0,
            'credit' => $totalNet
        ];

        // Check Balance
        // Deductions = Tax + Loan Repayments + Others (PF, etc.)
        $otherDeductions = $totalDeductions - $totalTax - $totalLoanRepayments;
        
        if ($otherDeductions > 0.01) { // Tolerance for float
             if ($accPF) {
                $items[] = [
                    'account_id' => $accPF['id'],
                    'debit' => 0,
                    'credit' => $otherDeductions
                ];
             } else {
                 // Fallback: Add to Payable if no specific account? Or throw error?
                 // For now, if we can't map it, we might have an imbalance or need to put it in suspense.
                 // But wait, if we don't credit it, Debits > Credits.
                 // Let's add it to Tax Payable as a fallback for "Other Liabilities"
                 $items[] = [
                    'account_id' => $accTax['id'], // Fallback
                    'debit' => 0,
                    'credit' => $otherDeductions
                ];
             }
        }

        if ($pfEmployerAmount > 0.01) {
            if (!$accPF) {
                throw new \Exception("Chart of Accounts missing for Provident Fund Payable (2003)");
            }
            $items[] = [
                'account_id' => $accExpense['id'],
                'debit' => $pfEmployerAmount,
                'credit' => 0
            ];
            $items[] = [
                'account_id' => $accPF['id'],
                'debit' => 0,
                'credit' => $pfEmployerAmount
            ];
        }

        // Create Journal Entry
        $header = [
            'reference_id' => $cycleId,
            'reference_type' => 'payroll_cycle',
            'date' => date('Y-m-d'),
            'description' => "Payroll Accrual for " . $cycle['name']
        ];

        $this->store->createJournalEntry($header, $items);
    }

    public function generateBankTransferCsv(int $cycleId)
    {
        $records = $this->store->getBankDetailsForCycle($cycleId);
        if (empty($records)) throw new \Exception("No records found for this cycle");

        $currency = (string)$this->store->getSetting('currency_code', 'USD');
        $csv = "Employee Code,Employee Name,Bank Name,Account Number,Amount,Currency\n";
        foreach ($records as $r) {
            $line = [
                $r['employee_code'],
                $r['employee_name'],
                $r['bank_name'] ?? 'N/A',
                $r['account_number'] ?? 'N/A',
                $r['net_salary'],
                $currency
            ];
            $csv .= implode(',', array_map(function($field) {
                return '"' . str_replace('"', '""', $field) . '"';
            }, $line)) . "\n";
        }

        return $csv;
    }
}
