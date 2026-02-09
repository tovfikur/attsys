<?php

namespace App\Payroll;

use App\Core\Auth;
use App\Core\Audit;
use App\Core\Database;
use App\Core\TenantResolver;

class PayrollController
{
    private $service;
    private $tenantId;

    public function __construct()
    {
        $pdo = Database::get();
        $tenant = (new TenantResolver($pdo))->resolve();
        
        if (!$tenant || !isset($tenant['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant not resolved']);
            exit;
        }
        
        $this->tenantId = (int)$tenant['id'];
        $this->service = new PayrollService($this->tenantId);
    }

    public function createCycle()
    {
        Auth::requireRole('perm:payroll.manage');
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (empty($input['name']) || empty($input['start_date']) || empty($input['end_date'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing fields']);
            return;
        }

        try {
            $id = $this->service->createCycle($input['name'], $input['start_date'], $input['end_date']);
            Audit::log(
                'payroll.cycle.create',
                ['tenant_id' => $this->tenantId, 'cycle_id' => (int)$id, 'name' => (string)$input['name']],
                Auth::currentUser()
            );
            echo json_encode(['id' => $id, 'message' => 'Cycle created']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getCycles()
    {
        Auth::requireRole('perm:payroll.read');
        $store = new PayrollStore($this->tenantId);
        echo json_encode(['cycles' => $store->getCycles()]);
    }

    public function runCycle()
    {
        Auth::requireRole('perm:payroll.run');
        $id = $_GET['id'] ?? 0;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }

        try {
            \App\Core\Audit::log('payroll.run', ['tenant_id' => $this->tenantId, 'cycle_id' => (int)$id], Auth::currentUser());
            $results = $this->service->runPayroll((int)$id);
            echo json_encode(['results' => $results]);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getPayslips()
    {
        Auth::requireRole('perm:payroll.read'); // Employees should only see their own
        $cycleId = $_GET['cycle_id'] ?? 0;
        if (!$cycleId) {
             http_response_code(400);
             echo json_encode(['error' => 'Cycle ID required']);
             return;
        }
        
        $store = new PayrollStore($this->tenantId);
        echo json_encode($store->getPayslips((int)$cycleId));
    }
    
    public function getPayslipDetail()
    {
        // TODO: Check ownership if employee
        $id = $_GET['id'] ?? 0;
        if (!$id) {
             http_response_code(400);
             echo json_encode(['error' => 'Payslip ID required']);
             return;
        }
        
        $store = new PayrollStore($this->tenantId);
        echo json_encode($store->getPayslip((int)$id));
    }

    public function getBonuses()
    {
        Auth::requireRole('perm:payroll.manage');
        $cycleId = $_GET['cycle_id'] ?? 0;
        if (!$cycleId) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        echo json_encode(['bonuses' => $store->getBonusesByCycle((int)$cycleId)]);
    }

    public function saveBonus()
    {
        Auth::requireRole('perm:payroll.manage');
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['employee_id']) || empty($input['payroll_cycle_id']) || empty($input['title']) || !isset($input['amount'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing fields']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        try {
            $id = $store->saveBonus($input);
            Audit::log(
                'payroll.variable_pay.save',
                ['tenant_id' => $this->tenantId, 'id' => $id, 'employee_id' => (int)$input['employee_id'], 'cycle_id' => (int)$input['payroll_cycle_id']],
                Auth::currentUser()
            );
            echo json_encode(['id' => $id, 'message' => 'Bonus saved']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function deleteBonus()
    {
        Auth::requireRole('perm:payroll.manage');
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? 0;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Bonus ID required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        try {
            $store->deleteBonus((int)$id);
            Audit::log(
                'payroll.variable_pay.delete',
                ['tenant_id' => $this->tenantId, 'id' => (int)$id],
                Auth::currentUser()
            );
            echo json_encode(['message' => 'Bonus deleted']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getStructure()
    {
        Auth::requireRole('admin');
        $empId = $_GET['employee_id'] ?? 0;
        
        if (!$empId) {
            http_response_code(400);
            echo json_encode(['error' => 'Employee ID required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        $structure = $store->getSalaryStructure((int)$empId);
        
        echo json_encode(['structure' => $structure]);
    }

    public function getStructureHistory()
    {
        Auth::requireRole('admin');
        $empId = $_GET['employee_id'] ?? 0;
        
        if (!$empId) {
            http_response_code(400);
            echo json_encode(['error' => 'Employee ID required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        $history = $store->getSalaryHistory((int)$empId);
        
        echo json_encode(['history' => $history]);
    }

    public function getComponents()
    {
        Auth::requireRole('admin');
        $store = new PayrollStore($this->tenantId);
        echo json_encode(['components' => $store->getComponents()]);
    }

    public function saveStructure()
    {
        Auth::requireRole('perm:employees.write');
        $empId = $_GET['employee_id'] ?? 0;
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$empId || empty($input['effective_from']) || empty($input['base_salary'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing fields']);
            return;
        }

        // Validate bank details required for bank_transfer and cheque
        $paymentMethod = strtolower(trim($input['payment_method'] ?? 'bank_transfer'));
        if (in_array($paymentMethod, ['bank_transfer', 'cheque'], true)) {
            $store = new PayrollStore($this->tenantId);
            $bankAccounts = $store->getEmployeeBankAccounts((int)$empId);
            
            if (empty($bankAccounts)) {
                http_response_code(400);
                echo json_encode([
                    'error' => 'Bank details required',
                    'message' => 'Payment method "' . ucfirst(str_replace('_', ' ', $paymentMethod)) . '" requires bank account details. Please add bank account first.',
                    'payment_method' => $paymentMethod
                ]);
                return;
            }
        }

        $store = new PayrollStore($this->tenantId);
        try {
            $id = $store->saveSalaryStructure((int)$empId, $input);
            Audit::log(
                'payroll.structure.save',
                ['tenant_id' => $this->tenantId, 'employee_id' => (int)$empId, 'structure_id' => (int)$id],
                Auth::currentUser()
            );
            echo json_encode(['id' => $id, 'message' => 'Structure saved']);
        } catch (\Exception $e) {
             http_response_code(500);
             echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function addItem()
    {
        Auth::requireRole('perm:payroll.manage');
        $id = $_GET['id'] ?? 0;
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$id || empty($input['name']) || empty($input['type']) || !isset($input['amount'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing fields']);
            return;
        }

        try {
            $payslip = $this->service->addPayslipItem((int)$id, $input);
            Audit::log(
                'payroll.payslip.item.add',
                ['tenant_id' => $this->tenantId, 'payslip_id' => (int)$id, 'name' => (string)($input['name'] ?? ''), 'type' => (string)($input['type'] ?? '')],
                Auth::currentUser()
            );
            echo json_encode(['message' => 'Item added', 'payslip' => $payslip]);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function createLoan()
    {
        Auth::requireRole('perm:payroll.manage');
        $input = json_decode(file_get_contents('php://input'), true);
        
        // Basic validation
        if (empty($input['employee_id']) || empty($input['amount']) || empty($input['monthly_installment']) || empty($input['start_date'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            return;
        }

        try {
            // Validate loan amount against employee salary
            $empId = (int)$input['employee_id'];
            $loanAmount = (float)$input['amount'];
            
            // Get employee's current salary structure
            $store = new PayrollStore($this->tenantId);
            $structure = $store->getActiveSalaryStructure($empId);
            
            if ($structure) {
                $baseSalary = (float)($structure['base_salary'] ?? 0);
                $maxLoanMultiplier = (float)$store->getSetting('max_loan_multiplier', 3.0);
                $maxLoanAmount = $baseSalary * $maxLoanMultiplier;
                
                if ($loanAmount > $maxLoanAmount) {
                    http_response_code(400);
                    echo json_encode([
                        'error' => "Loan amount exceeds allowable limit",
                        'max_allowed' => $maxLoanAmount,
                        'employee_salary' => $baseSalary,
                        'multiplier' => $maxLoanMultiplier,
                        'message' => sprintf(
                            'Loan amount ($%.2f) exceeds maximum allowed ($%.2f = %.1fx monthly salary)',
                            $loanAmount,
                            $maxLoanAmount,
                            $maxLoanMultiplier
                        )
                    ]);
                    return;
                }
            }
            
            // Default type to 'loan' if not set
            $input['type'] = $input['type'] ?? 'loan';
            $id = $this->service->addLoan($input);
            Audit::log(
                'payroll.loan.create',
                ['tenant_id' => $this->tenantId, 'loan_id' => (int)$id, 'employee_id' => (int)$input['employee_id'], 'type' => (string)($input['type'] ?? 'loan'), 'amount' => (float)$input['amount']],
                Auth::currentUser()
            );
            echo json_encode(['id' => $id, 'message' => 'Loan created successfully']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function createAdvance()
    {
        Auth::requireRole('perm:payroll.manage');
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['employee_id']) || empty($input['amount']) || empty($input['start_date'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            return;
        }
        try {
            $id = $this->service->addAdvance($input);
            Audit::log(
                'payroll.advance.create',
                ['tenant_id' => $this->tenantId, 'advance_id' => (int)$id, 'employee_id' => (int)$input['employee_id'], 'amount' => (float)$input['amount']],
                Auth::currentUser()
            );
            echo json_encode(['id' => $id, 'message' => 'Advance created successfully']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getLoans()
    {
        Auth::requireRole('perm:payroll.read');
        $empId = $_GET['employee_id'] ?? 0;
        $status = $_GET['status'] ?? '';
        
        $store = new PayrollStore($this->tenantId);
        
        $filters = [];
        if ($empId) $filters['employee_id'] = (int)$empId;
        if ($status) $filters['status'] = $status;
        
        echo json_encode(['loans' => $store->getAllLoans($filters)]);
    }

    public function updateLoanStatus()
    {
        Auth::requireRole('perm:payroll.manage');
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? 0;
        $status = $input['status'] ?? '';

        if (!$id || !$status) {
            http_response_code(400);
            echo json_encode(['error' => 'Loan ID and Status required']);
            return;
        }

        try {
            $store = new PayrollStore($this->tenantId);
            $store->updateLoanStatus((int)$id, $status);
            Audit::log(
                'payroll.loan.status_update',
                ['tenant_id' => $this->tenantId, 'loan_id' => (int)$id, 'status' => (string)$status],
                Auth::currentUser()
            );
            echo json_encode(['message' => 'Loan status updated']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function lockCycle()
    {
        Auth::requireRole('perm:payroll.lock');
        $input = json_decode(file_get_contents('php://input'), true);
        $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }

        try {
            \App\Core\Audit::log('payroll.lock', ['tenant_id' => $this->tenantId, 'cycle_id' => (int)$id], Auth::currentUser());
            $this->service->lockCycle((int)$id);
            echo json_encode(['message' => 'Cycle locked and posted to accounting']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function viewPayslip()
    {
        $user = Auth::currentUser();
        if (!$user) {
             http_response_code(401);
             echo "Unauthorized";
             return;
        }

        $id = $_GET['id'] ?? 0;
        if (!$id) {
             http_response_code(400);
             echo "Payslip ID required";
             return;
        }
        
        $store = new PayrollStore($this->tenantId);
        $payslip = $store->getPayslip((int)$id);
        
        if (!$payslip) {
            http_response_code(404);
            echo "Payslip not found";
            return;
        }

        // Check ownership or payroll access
        $isAdmin =
            Auth::hasPermission($user, 'payroll.read') ||
            Auth::hasPermission($user, 'payroll.manage') ||
            Auth::hasPermission($user, 'payroll.run') ||
            Auth::hasPermission($user, 'payroll.approve') ||
            Auth::hasPermission($user, 'payroll.lock') ||
            Auth::hasPermission($user, 'payroll.pay') ||
            Auth::hasPermission($user, 'attendance.write') ||
            $user['role'] === 'admin' ||
            $user['role'] === 'superadmin' ||
            $user['role'] === 'tenant_owner' ||
            $user['role'] === 'hr_admin';
        $isOwner = isset($user['employee_id']) && (int)$user['employee_id'] === (int)$payslip['employee_id'];

        if (!$isAdmin && !$isOwner) {
             http_response_code(403);
             echo "Forbidden";
             return;
        }

        // Generate HTML
        $companyName = "My Company"; // TODO: Fetch from settings
        
        // Group items
        $earnings = [];
        $deductions = [];
        foreach ($payslip['items'] as $item) {
            if ($item['type'] === 'earning') $earnings[] = $item;
            else $deductions[] = $item;
        }

        header('Content-Type: text/html');
        ?>
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payslip #<?php echo $payslip['id']; ?></title>
            <style>
                body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
                .company-name { font-size: 24px; font-weight: bold; }
                .payslip-title { font-size: 18px; margin-top: 10px; }
                .details { display: flex; justify-content: space-between; margin-bottom: 20px; }
                .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                .table th { background-color: #f2f2f2; }
                .totals { display: flex; justify-content: flex-end; }
                .totals table { width: 50%; }
                .net-salary { font-size: 18px; font-weight: bold; background-color: #e8f5e9; }
                @media print {
                    body { max-width: 100%; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company-name"><?php echo htmlspecialchars($companyName); ?></div>
                <div class="payslip-title">Payslip for <?php echo htmlspecialchars($payslip['employee_name']); ?></div>
            </div>

            <div class="details">
                <div>
                    <strong>Employee Code:</strong> <?php echo htmlspecialchars($payslip['employee_code']); ?><br>
                    <strong>Designation:</strong> <?php echo htmlspecialchars($payslip['designation'] ?? 'N/A'); ?><br>
                    <strong>Department:</strong> <?php echo htmlspecialchars($payslip['department'] ?? 'N/A'); ?>
                </div>
                <div>
                    <strong>Payslip ID:</strong> #<?php echo $payslip['id']; ?><br>
                    <strong>Date:</strong> <?php echo date('Y-m-d'); ?><br>
                    <strong>Days Paid:</strong> <?php echo $payslip['total_days'] - $payslip['unpaid_leave_days']; ?>
                </div>
            </div>

            <table class="table">
                <thead>
                    <tr>
                        <th>Earnings</th>
                        <th>Amount</th>
                        <th>Deductions</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <?php
                    $maxRows = max(count($earnings), count($deductions));
                    for ($i = 0; $i < $maxRows; $i++) {
                        $earning = $earnings[$i] ?? null;
                        $deduction = $deductions[$i] ?? null;
                        echo "<tr>";
                        echo "<td>" . ($earning ? htmlspecialchars($earning['name']) : '') . "</td>";
                        echo "<td>" . ($earning ? number_format($earning['amount'], 2) : '') . "</td>";
                        echo "<td>" . ($deduction ? htmlspecialchars($deduction['name']) : '') . "</td>";
                        echo "<td>" . ($deduction ? number_format($deduction['amount'], 2) : '') . "</td>";
                        echo "</tr>";
                    }
                    ?>
                </tbody>
            </table>

            <div class="totals">
                <table class="table">
                    <tr>
                        <td><strong>Total Earnings</strong></td>
                        <td><?php echo number_format($payslip['gross_salary'], 2); ?></td>
                    </tr>
                    <tr>
                        <td><strong>Total Deductions</strong></td>
                        <td><?php echo number_format($payslip['total_deductions'], 2); ?></td>
                    </tr>
                    <tr class="net-salary">
                        <td><strong>Net Salary</strong></td>
                        <td><?php echo number_format($payslip['net_salary'], 2); ?></td>
                    </tr>
                </table>
            </div>
            
            <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #666;">
                This is a computer-generated document. No signature is required.<br>
                Generated on <?php echo date('Y-m-d H:i:s'); ?>
            </div>
            
            <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; font-size: 16px;">Print / Save as PDF</button>
        </body>
        </html>
        <?php
    }

    public function markPaid()
    {
        Auth::requireRole('perm:payroll.pay');
        $input = json_decode(file_get_contents('php://input'), true);
        $id = (int)($input['id'] ?? ($_GET['id'] ?? 0));

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }

        try {
            \App\Core\Audit::log('payroll.pay', ['tenant_id' => $this->tenantId, 'cycle_id' => (int)$id], Auth::currentUser());
            $this->service->markCyclePaid((int)$id);
            echo json_encode(['message' => 'Cycle marked as paid and posted to accounting']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function approveCycle()
    {
        Auth::requireRole('perm:payroll.approve');
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? 0;
        $note = $input['note'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }

        try {
            $user = Auth::currentUser() ?? [];
            $store = new PayrollStore($this->tenantId);
            $cycle = $store->getCycle((int)$id);
            if (!$cycle) {
                http_response_code(404);
                echo json_encode(['error' => 'Cycle not found']);
                return;
            }
            if (!in_array($cycle['status'], ['processing', 'calculated'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Cycle must be processed before approval']);
                return;
            }
            $store->approveCycle((int)$id, (int)($user['id'] ?? 0), (string)($user['role'] ?? ''), (string)($user['name'] ?? ''), $note);
            \App\Core\Audit::log('payroll.approve', ['tenant_id' => $this->tenantId, 'cycle_id' => (int)$id, 'note' => $note], $user);
            echo json_encode(['message' => 'Cycle approved']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function rejectCycle()
    {
        Auth::requireRole('perm:payroll.approve');
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? 0;
        $note = $input['note'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }

        try {
            $user = Auth::currentUser() ?? [];
            $store = new PayrollStore($this->tenantId);
            $cycle = $store->getCycle((int)$id);
            if (!$cycle) {
                http_response_code(404);
                echo json_encode(['error' => 'Cycle not found']);
                return;
            }
            if (!in_array($cycle['status'], ['processing', 'calculated'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Cycle must be processed before rejection']);
                return;
            }
            $store->rejectCycle((int)$id, (int)($user['id'] ?? 0), (string)($user['role'] ?? ''), (string)($user['name'] ?? ''), $note);
            \App\Core\Audit::log('payroll.reject', ['tenant_id' => $this->tenantId, 'cycle_id' => (int)$id, 'note' => $note], $user);
            echo json_encode(['message' => 'Cycle rejected']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getCycleApprovals()
    {
        Auth::requireRole('perm:payroll.read');
        $id = $_GET['id'] ?? 0;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }
        $store = new PayrollStore($this->tenantId);
        echo json_encode(['approvals' => $store->getCycleApprovals((int)$id)]);
    }

    public function getReports()
    {
        Auth::requireRole('perm:payroll.read');
        $cycleId = $_GET['cycle_id'] ?? 0;
        if (!$cycleId) {
             http_response_code(400);
             echo json_encode(['error' => 'Cycle ID required']);
             return;
        }

        $store = new PayrollStore($this->tenantId);
        
        $deptCost = $store->getDepartmentCost((int)$cycleId);
        $totals = $store->getCycleTotals((int)$cycleId);
        $cycle = $store->getCycle((int)$cycleId);
        $taxReport = $store->getTaxReport((int)$cycleId);
        $overtimeReport = $store->getOvertimeReport((int)$cycleId);
        $deductionReport = $store->getDeductionReport((int)$cycleId);
        
        echo json_encode([
            'cycle' => $cycle,
            'totals' => $totals,
            'department_cost' => $deptCost,
            'tax_report' => $taxReport,
            'overtime_report' => $overtimeReport,
            'deduction_report' => $deductionReport
        ]);
    }

    public function downloadTaxSummary()
    {
        Auth::requireRole('perm:payroll.read');
        $cycleId = $_GET['cycle_id'] ?? 0;
        if (!$cycleId) {
             http_response_code(400);
             echo json_encode(['error' => 'Cycle ID required']);
             return;
        }
        $store = new PayrollStore($this->tenantId);
        $taxReport = $store->getTaxReport((int)$cycleId);
        $currency = (string)$store->getSetting('currency_code', 'USD');
        $csv = "Employee Code,Employee Name,Department,Gross Salary,Tax Deducted,Currency\n";
        foreach ($taxReport as $r) {
            $line = [
                $r['code'],
                $r['name'],
                $r['department'] ?? '',
                $r['gross_salary'],
                $r['tax_deducted'],
                $currency
            ];
            $csv .= implode(',', array_map(function($field) {
                return '"' . str_replace('"', '""', (string)$field) . '"';
            }, $line)) . "\n";
        }
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="tax_summary_cycle_' . (int)$cycleId . '.csv"');
        echo $csv;
    }

    public function downloadCycleReport()
    {
        Auth::requireRole('perm:payroll.read');
        $cycleId = (int)($_GET['cycle_id'] ?? 0);
        $kind = strtolower(trim((string)($_GET['kind'] ?? '')));
        if ($cycleId <= 0 || $kind === '') {
            http_response_code(400);
            echo json_encode(['error' => 'cycle_id and kind are required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);

        $escape = function ($field) {
            $s = (string)$field;
            return '"' . str_replace('"', '""', $s) . '"';
        };

        $rows = [];
        $header = [];
        if ($kind === 'department_cost') {
            $header = ['Department', 'Employee Count', 'Total Gross', 'Total Net'];
            foreach ($store->getDepartmentCost($cycleId) as $r) {
                $rows[] = [
                    $r['department'] ?? '',
                    $r['employee_count'] ?? 0,
                    $r['total_gross'] ?? 0,
                    $r['total_net'] ?? 0,
                ];
            }
        } elseif ($kind === 'overtime') {
            $header = ['Employee Code', 'Employee Name', 'Department', 'Overtime Hours', 'Overtime Pay'];
            foreach ($store->getOvertimeReport($cycleId) as $r) {
                $rows[] = [
                    $r['code'] ?? '',
                    $r['name'] ?? '',
                    $r['department'] ?? '',
                    $r['overtime_hours'] ?? 0,
                    $r['overtime_pay'] ?? 0,
                ];
            }
        } elseif ($kind === 'deductions') {
            $header = ['Employee Code', 'Employee Name', 'Deduction', 'Amount'];
            foreach ($store->getDeductionReport($cycleId) as $r) {
                $rows[] = [
                    $r['code'] ?? '',
                    $r['name'] ?? '',
                    $r['deduction_name'] ?? '',
                    $r['amount'] ?? 0,
                ];
            }
        } elseif ($kind === 'payments') {
            $header = ['Employee Code', 'Employee Name', 'Net Salary', 'Paid Amount', 'Balance', 'Payment Status', 'Last Payment Date'];
            foreach ($store->getPayslipPaymentSummaryForCycle($cycleId) as $r) {
                $rows[] = [
                    $r['employee_code'] ?? '',
                    $r['employee_name'] ?? '',
                    $r['net_salary'] ?? 0,
                    $r['paid_amount'] ?? 0,
                    $r['balance'] ?? 0,
                    $r['payment_status'] ?? '',
                    $r['last_payment_date'] ?? '',
                ];
            }
        } elseif ($kind === 'journal') {
            $header = ['Entry ID', 'Date', 'Reference Type', 'Reference ID', 'Description', 'Account Code', 'Account Name', 'Debit', 'Credit'];
            $entries = array_merge(
                $store->getJournalEntriesByReference('payroll_cycle', $cycleId),
                $store->getJournalEntriesByReference('payroll_payment', $cycleId)
            );
            foreach ($entries as $je) {
                $items = is_array($je['items'] ?? null) ? $je['items'] : [];
                if (!$items) {
                    $rows[] = [
                        $je['id'] ?? '',
                        $je['date'] ?? '',
                        $je['reference_type'] ?? '',
                        $je['reference_id'] ?? '',
                        $je['description'] ?? '',
                        '',
                        '',
                        '',
                        '',
                    ];
                    continue;
                }
                foreach ($items as $it) {
                    $rows[] = [
                        $je['id'] ?? '',
                        $je['date'] ?? '',
                        $je['reference_type'] ?? '',
                        $je['reference_id'] ?? '',
                        $je['description'] ?? '',
                        $it['account_code'] ?? '',
                        $it['account_name'] ?? '',
                        $it['debit'] ?? 0,
                        $it['credit'] ?? 0,
                    ];
                }
            }
        } elseif ($kind === 'tax') {
            $header = ['Employee Code', 'Employee Name', 'Department', 'Gross Salary', 'Tax Deducted'];
            foreach ($store->getTaxReport($cycleId) as $r) {
                $rows[] = [
                    $r['code'] ?? '',
                    $r['name'] ?? '',
                    $r['department'] ?? '',
                    $r['gross_salary'] ?? 0,
                    $r['tax_deducted'] ?? 0,
                ];
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Unknown kind']);
            return;
        }

        $csv = implode(',', array_map($escape, $header)) . "\n";
        foreach ($rows as $r) {
            $csv .= implode(',', array_map($escape, $r)) . "\n";
        }

        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="' . $kind . '_cycle_' . $cycleId . '.csv"');
        echo $csv;
    }

    public function getYearlyReport()
    {
        Auth::requireRole('perm:payroll.read');
        $year = $_GET['year'] ?? date('Y');
        
        $store = new PayrollStore($this->tenantId);
        $report = $store->getYearlyPayrollCost((int)$year);
        
        echo json_encode(['year' => $year, 'report' => $report]);
    }

    public function getEmployeeHistory()
    {
        Auth::requireRole('perm:payroll.read'); // Or self
        $empId = $_GET['employee_id'] ?? 0;
        $year = $_GET['year'] ?? date('Y');
        
        if (!$empId) {
            http_response_code(400);
            echo json_encode(['error' => 'Employee ID required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        $history = $store->getEmployeePayrollHistory((int)$empId, (int)$year);
        
        echo json_encode(['employee_id' => $empId, 'year' => $year, 'history' => $history]);
    }

    public function downloadBankExport()
    {
        Auth::requireRole('perm:payroll.read');
        $cycleId = $_GET['cycle_id'] ?? 0;
        
        if (!$cycleId) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }

        try {
            Audit::log(
                'payroll.bank_export.download',
                ['tenant_id' => $this->tenantId, 'cycle_id' => (int)$cycleId],
                Auth::currentUser()
            );
            $csv = $this->service->generateBankTransferCsv((int)$cycleId);
            
            header('Content-Type: text/csv');
            header('Content-Disposition: attachment; filename="bank_transfer_cycle_' . $cycleId . '.csv"');
            echo $csv;
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getMyPayslips()
    {
        $user = Auth::currentUser();
        if (!$user || empty($user['employee_id'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized or not an employee']);
            return;
        }

        $year = $_GET['year'] ?? date('Y');
        $store = new PayrollStore($this->tenantId);
        $history = $store->getEmployeePayrollHistory((int)$user['employee_id'], (int)$year);
        
        echo json_encode(['year' => $year, 'payslips' => $history]);
    }

    public function getMyLoans()
    {
        $user = Auth::currentUser();
        if (!$user || empty($user['employee_id'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized or not an employee']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        $loans = $store->getLoansByEmployee((int)$user['employee_id']);
        
        echo json_encode(['loans' => $loans]);
    }

    public function applyForLoan()
    {
        $user = Auth::currentUser();
        if (!$user || empty($user['employee_id'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized or not an employee']);
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        
        // Basic validation
        if (empty($input['amount']) || empty($input['monthly_installment']) || empty($input['start_date'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            return;
        }

        try {
            // Force employee_id to current user
            $input['employee_id'] = (int)$user['employee_id'];
            $input['type'] = $input['type'] ?? 'loan';
            $input['status'] = 'pending'; // Force status to pending
            
            $id = $this->service->addLoan($input);
            Audit::log(
                'payroll.loan.apply',
                ['tenant_id' => $this->tenantId, 'loan_id' => (int)$id, 'employee_id' => (int)$user['employee_id'], 'amount' => (float)$input['amount']],
                $user
            );
            echo json_encode(['id' => $id, 'message' => 'Loan application submitted successfully']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getMyDayStatus()
    {
        $user = Auth::currentUser();
        if (!$user || empty($user['employee_id'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized or not an employee']);
            return;
        }
        $start = (string)($_GET['start'] ?? '');
        $end = (string)($_GET['end'] ?? '');
        if ($start === '' || $end === '') {
            http_response_code(400);
            echo json_encode(['error' => 'start and end are required (YYYY-MM-DD)']);
            return;
        }
        $days = $this->service->getEmployeeDayStatuses((int)$user['employee_id'], $start, $end);
        echo json_encode(['days' => $days]);
    }

    public function getDayStatus()
    {
        Auth::requireRole('perm:payroll.read');
        $employeeId = (int)($_GET['employee_id'] ?? 0);
        $start = (string)($_GET['start'] ?? '');
        $end = (string)($_GET['end'] ?? '');
        if ($employeeId <= 0 || $start === '' || $end === '') {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id, start, end are required']);
            return;
        }
        $days = $this->service->getEmployeeDayStatuses($employeeId, $start, $end);
        echo json_encode(['days' => $days]);
    }

    public function getJournalEntries()
    {
        Auth::requireRole('perm:payroll.read');
        $cycleId = $_GET['cycle_id'] ?? 0;
        
        if (!$cycleId) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        
        // Fetch both accrual (payroll_cycle) and payment (payroll_payment) entries
        $accrualEntries = $store->getJournalEntriesByReference('payroll_cycle', (int)$cycleId);
        $paymentEntries = $store->getJournalEntriesByReference('payroll_payment', (int)$cycleId);
        
        echo json_encode(['entries' => array_merge($accrualEntries, $paymentEntries)]);
    }

    public function emailPayslips()
    {
        Auth::requireRole('perm:payroll.manage');
        $input = json_decode(file_get_contents('php://input'), true);
        
        $cycleId = $input['cycle_id'] ?? 0;
        $payslipId = $input['payslip_id'] ?? 0;
        
        try {
            if ($cycleId) {
                $result = $this->service->emailPayslipsForCycle((int)$cycleId);
                echo json_encode(['result' => $result]);
            } elseif ($payslipId) {
                $this->service->emailPayslip((int)$payslipId);
                echo json_encode(['message' => 'Email sent successfully']);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Cycle ID or Payslip ID required']);
            }
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getBankAccounts()
    {
        Auth::requireRole('perm:employees.write');
        $employeeId = (int)($_GET['employee_id'] ?? 0);
        if ($employeeId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Employee ID required']);
            return;
        }
        $store = new PayrollStore($this->tenantId);
        echo json_encode(['accounts' => $store->getEmployeeBankAccounts($employeeId)]);
    }

    public function upsertBankAccount()
    {
        Auth::requireRole('perm:employees.write');
        $employeeId = (int)($_GET['employee_id'] ?? 0);
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        if ($employeeId <= 0 || empty($input['bank_name']) || empty($input['account_number']) || empty($input['account_holder_name'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            return;
        }
        try {
            $store = new PayrollStore($this->tenantId);
            $id = $store->saveEmployeeBankAccount($employeeId, [
                'id' => $input['id'] ?? null,
                'bank_name' => (string)$input['bank_name'],
                'account_number' => (string)$input['account_number'],
                'branch_code' => (string)($input['branch_code'] ?? ''),
                'account_holder_name' => (string)$input['account_holder_name'],
                'is_primary' => (bool)($input['is_primary'] ?? false),
            ]);
            Audit::log(
                'payroll.bank_account.save',
                ['tenant_id' => $this->tenantId, 'employee_id' => $employeeId, 'account_id' => (int)$id, 'bank_name' => (string)$input['bank_name'], 'is_primary' => (int)($input['is_primary'] ?? 0)],
                Auth::currentUser()
            );
            echo json_encode(['id' => $id, 'message' => 'Bank account saved']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function deleteBankAccount()
    {
        Auth::requireRole('perm:employees.write');
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Account ID required']);
            return;
        }
        try {
            $store = new PayrollStore($this->tenantId);
            $store->deleteEmployeeBankAccount($id);
            Audit::log(
                'payroll.bank_account.delete',
                ['tenant_id' => $this->tenantId, 'account_id' => $id],
                Auth::currentUser()
            );
            echo json_encode(['message' => 'Bank account deleted']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function setPrimaryBankAccount()
    {
        Auth::requireRole('perm:employees.write');
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $employeeId = (int)($input['employee_id'] ?? 0);
        $accountId = (int)($input['account_id'] ?? 0);
        if ($employeeId <= 0 || $accountId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Employee ID and Account ID required']);
            return;
        }
        try {
            $store = new PayrollStore($this->tenantId);
            $store->setPrimaryBankAccount($employeeId, $accountId);
            Audit::log(
                'payroll.bank_account.set_primary',
                ['tenant_id' => $this->tenantId, 'employee_id' => $employeeId, 'account_id' => $accountId],
                Auth::currentUser()
            );
            echo json_encode(['message' => 'Primary bank account set']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getSettings()
    {
        Auth::requireRole('perm:payroll.settings');
        $store = new PayrollStore($this->tenantId);
        echo json_encode(['settings' => $store->getAllSettings()]);
    }

    public function updateSettings()
    {
        Auth::requireRole('perm:payroll.settings');
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!is_array($input)) $input = [];

        $allowedKeys = [
            'overtime_rate_multiplier' => 'float_pos',
            'late_penalty_multiplier' => 'float_nonneg',
            'early_leave_penalty_multiplier' => 'float_nonneg',
            'work_hours_per_day' => 'float_pos',
            'days_per_month' => 'float_pos',
            'currency_code' => 'currency_code',
            'pf_employee_contribution_percent' => 'float_nonneg',
            'pf_employer_contribution_percent' => 'float_nonneg',
            'proration_basis' => 'proration_basis',
            'scheduler_enabled' => 'bool',
            'scheduler_day_of_month' => 'int_1_28',
            'scheduler_auto_run' => 'bool',
            'scheduler_auto_email' => 'bool',
        ];

        $clean = [];
        foreach ($input as $key => $value) {
            $key = (string)$key;
            if (!isset($allowedKeys[$key])) continue;
            $kind = $allowedKeys[$key];

            if ($kind === 'currency_code') {
                $v = strtoupper(trim((string)$value));
                if ($v === '' || strlen($v) > 10) continue;
                $clean[$key] = $v;
                continue;
            }
            if ($kind === 'proration_basis') {
                $v = strtolower(trim((string)$value));
                $allowed = ['calendar' => true, 'working' => true, 'fixed_days_per_month' => true];
                if (!isset($allowed[$v])) continue;
                $clean[$key] = $v;
                continue;
            }
            if ($kind === 'bool') {
                $v = $value;
                if (is_string($v)) $v = strtolower(trim($v));
                $clean[$key] = ($v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'yes') ? 1 : 0;
                continue;
            }
            if ($kind === 'int_1_28') {
                if (!is_numeric($value)) continue;
                $n = (int)$value;
                if ($n < 1 || $n > 28) continue;
                $clean[$key] = $n;
                continue;
            }

            if (!is_numeric($value)) continue;
            $num = (float)$value;
            if ($kind === 'float_pos' && $num <= 0) continue;
            if ($kind === 'float_nonneg' && $num < 0) continue;
            $clean[$key] = $num;
        }

        $store = new PayrollStore($this->tenantId);
        foreach ($clean as $key => $value) {
            $store->saveSetting($key, $value);
        }
        Audit::log(
            'payroll.settings.update',
            ['tenant_id' => $this->tenantId, 'keys' => array_values(array_map('strval', array_keys($clean)))],
            Auth::currentUser()
        );
        echo json_encode(['message' => 'Settings updated']);
    }

    public function getTaxSlabs()
    {
        Auth::requireRole('perm:payroll.settings');
        $store = new PayrollStore($this->tenantId);
        echo json_encode(['slabs' => $store->getTaxSlabs()]);
    }

    public function saveTaxSlab()
    {
        Auth::requireRole('perm:payroll.settings');
        $input = json_decode(file_get_contents('php://input'), true) ?: [];

        $name = trim((string)($input['name'] ?? ''));
        $min = $input['min_salary'] ?? null;
        $max = $input['max_salary'] ?? null;
        $percent = $input['tax_percent'] ?? null;

        if ($name === '' || !is_numeric($min) || !is_numeric($percent)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing fields']);
            return;
        }

        if ($max !== null && $max !== '' && !is_numeric($max)) {
            http_response_code(400);
            echo json_encode(['error' => 'max_salary must be numeric or null']);
            return;
        }

        $data = [
            'name' => $name,
            'min_salary' => (float)$min,
            'max_salary' => ($max === null || $max === '') ? null : (float)$max,
            'tax_percent' => (float)$percent,
        ];
        if (isset($input['id'])) {
            $data['id'] = (int)$input['id'];
        }

        $store = new PayrollStore($this->tenantId);
        try {
            $id = $store->saveTaxSlab($data);
            Audit::log(
                'payroll.tax_slab.save',
                ['tenant_id' => $this->tenantId, 'tax_slab_id' => (int)$id, 'name' => (string)$name],
                Auth::currentUser()
            );
            echo json_encode(['id' => $id, 'message' => 'Tax slab saved']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function deleteTaxSlab()
    {
        Auth::requireRole('perm:payroll.settings');
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $id = (int)($input['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tax slab ID required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        try {
            $store->deleteTaxSlab($id);
            Audit::log(
                'payroll.tax_slab.delete',
                ['tenant_id' => $this->tenantId, 'tax_slab_id' => (int)$id],
                Auth::currentUser()
            );
            echo json_encode(['message' => 'Tax slab deleted']);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function getPayrollPermissions()
    {
        Auth::requireRole('perm:payroll.settings');
        $store = new PayrollStore($this->tenantId);
        $roles = ['tenant_owner', 'hr_admin', 'payroll_admin', 'manager', 'employee'];
        $map = $store->getRolePermissions($roles);
        $out = [];
        foreach ($roles as $r) {
            $out[] = [
                'role_name' => $r,
                'permissions' => $map[$r] ?? [],
            ];
        }
        echo json_encode(['roles' => $out]);
    }

    public function updatePayrollPermissions()
    {
        Auth::requireRole('perm:payroll.settings');
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $rolesIn = $input['roles'] ?? null;
        if (!is_array($rolesIn)) {
            http_response_code(400);
            echo json_encode(['error' => 'roles array required']);
            return;
        }

        $allowedPerms = [
            'payroll.read',
            'payroll.manage',
            'payroll.run',
            'payroll.approve',
            'payroll.lock',
            'payroll.pay',
            'payroll.settings',
        ];
        $allowedRoles = ['tenant_owner', 'hr_admin', 'payroll_admin', 'manager', 'employee'];

        $store = new PayrollStore($this->tenantId);
        foreach ($rolesIn as $r) {
            if (!is_array($r)) continue;
            $roleName = (string)($r['role_name'] ?? '');
            if (!in_array($roleName, $allowedRoles, true)) continue;
            $perms = $r['permissions'] ?? [];
            if (!is_array($perms)) $perms = [];
            $filtered = [];
            foreach ($perms as $p) {
                $p = (string)$p;
                if (in_array($p, $allowedPerms, true)) $filtered[] = $p;
            }
            $store->upsertRolePermissions($roleName, $filtered);
        }

        Audit::log(
            'payroll.permissions.update',
            ['tenant_id' => $this->tenantId],
            Auth::currentUser()
        );
        echo json_encode(['message' => 'Permissions updated']);
    }

    public function getPaymentSummary()
    {
        Auth::requireRole('perm:payroll.pay');
        $cycleId = (int)($_GET['cycle_id'] ?? 0);
        if ($cycleId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Cycle ID required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        echo json_encode(['payslips' => $store->getPayslipPaymentSummaryForCycle($cycleId)]);
    }

    public function getPayslipPayments()
    {
        Auth::requireRole('perm:payroll.pay');
        $payslipId = (int)($_GET['payslip_id'] ?? 0);
        if ($payslipId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Payslip ID required']);
            return;
        }

        $store = new PayrollStore($this->tenantId);
        echo json_encode(['payments' => $store->getPayslipPayments($payslipId)]);
    }

    public function addPayslipPayment()
    {
        Auth::requireRole('perm:payroll.pay');
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $payslipId = (int)($input['payslip_id'] ?? 0);
        $amount = $input['amount'] ?? null;
        $paymentDate = (string)($input['payment_date'] ?? date('Y-m-d'));
        $method = (string)($input['method'] ?? 'bank_transfer');
        $reference = isset($input['reference']) ? (string)$input['reference'] : null;

        if ($payslipId <= 0 || !is_numeric($amount)) {
            http_response_code(400);
            echo json_encode(['error' => 'Payslip ID and amount are required']);
            return;
        }

        try {
            $res = $this->service->recordPayslipPayment($payslipId, (float)$amount, $paymentDate, $method, $reference);
            Audit::log(
                'payroll.payment.record',
                [
                    'tenant_id' => $this->tenantId,
                    'payslip_id' => $payslipId,
                    'amount' => (float)$amount,
                    'payment_id' => (int)($res['payment_id'] ?? 0),
                    'payment_date' => $paymentDate,
                    'method' => $method,
                ],
                Auth::currentUser()
            );
            echo json_encode(array_merge(['message' => 'Payment recorded'], $res));
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
}
