<?php

namespace App\Payroll;

use App\Core\Database;
use App\Core\Crypto;
use PDO;

class PayrollStore
{
    private $pdo;
    private $tenantId;

    public function __construct(int $tenantId)
    {
        $this->pdo = Database::get();
        $this->tenantId = $tenantId;
    }

    // --- Salary Components ---
    public function getComponents()
    {
        $stmt = $this->pdo->prepare("SELECT * FROM salary_components WHERE tenant_id = ?");
        $stmt->execute([$this->tenantId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function createComponent(array $data)
    {
        $stmt = $this->pdo->prepare("INSERT INTO salary_components (tenant_id, name, type, is_taxable, is_recurring, gl_code) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $this->tenantId,
            $data['name'],
            $data['type'],
            $data['is_taxable'] ?? 1,
            $data['is_recurring'] ?? 1,
            $data['gl_code'] ?? null
        ]);
        return $this->pdo->lastInsertId();
    }

    // --- Employee Salary Structure ---
    public function getSalaryStructure(int $employeeId)
    {
        $stmt = $this->pdo->prepare("SELECT * FROM employee_salary_structures WHERE tenant_id = ? AND employee_id = ? AND status = 'active' ORDER BY effective_from DESC LIMIT 1");
        $stmt->execute([$this->tenantId, $employeeId]);
        $structure = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($structure) {
            $stmtItems = $this->pdo->prepare("
                SELECT i.*, c.name, c.type 
                FROM employee_salary_items i
                JOIN salary_components c ON i.component_id = c.id
                WHERE i.salary_structure_id = ?
            ");
            $stmtItems->execute([$structure['id']]);
            $structure['items'] = $stmtItems->fetchAll(PDO::FETCH_ASSOC);
        }

        return $structure;
    }

    public function getSalaryHistory(int $employeeId)
    {
        $stmt = $this->pdo->prepare("
            SELECT * FROM employee_salary_structures 
            WHERE tenant_id = ? AND employee_id = ?
            ORDER BY effective_from DESC
        ");
        $stmt->execute([$this->tenantId, $employeeId]);
        $structures = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($structures as &$struct) {
            $stmtItems = $this->pdo->prepare("
                SELECT i.*, c.name, c.type 
                FROM employee_salary_items i
                JOIN salary_components c ON i.component_id = c.id
                WHERE i.salary_structure_id = ?
            ");
            $stmtItems->execute([$struct['id']]);
            $struct['items'] = $stmtItems->fetchAll(PDO::FETCH_ASSOC);
        }
        return $structures;
    }

    public function saveSalaryStructure(int $employeeId, array $data)
    {
        $this->pdo->beginTransaction();
        try {
            // Deactivate old structures? Or just add new one with effective date?
            // For now, let's just insert new one. logic for "active" relies on date/status.
            
            $stmt = $this->pdo->prepare("INSERT INTO employee_salary_structures (tenant_id, employee_id, effective_from, base_salary, payment_method, status) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $this->tenantId,
                $employeeId,
                $data['effective_from'],
                $data['base_salary'],
                $data['payment_method'] ?? 'bank_transfer',
                'active'
            ]);
            $structureId = $this->pdo->lastInsertId();

            if (!empty($data['items'])) {
                $stmtItem = $this->pdo->prepare("INSERT INTO employee_salary_items (tenant_id, salary_structure_id, component_id, amount, is_percentage, percentage) VALUES (?, ?, ?, ?, ?, ?)");
                foreach ($data['items'] as $item) {
                    $stmtItem->execute([
                        $this->tenantId,
                        $structureId,
                        $item['component_id'],
                        $item['amount'],
                        $item['is_percentage'] ?? 0,
                        $item['percentage'] ?? 0
                    ]);
                }
            }
            
            $this->pdo->commit();
            return $structureId;
        } catch (\Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function getEmployeeBankAccounts(int $employeeId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT *
            FROM employee_bank_accounts
            WHERE tenant_id = ? AND employee_id = ?
            ORDER BY is_primary DESC, id DESC
        ");
        $stmt->execute([$this->tenantId, $employeeId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            $r['account_number'] = Crypto::decryptString($r['account_number'] ?? null);
            $r['branch_code'] = Crypto::decryptString($r['branch_code'] ?? null);
        }
        unset($r);
        return $rows;
    }

    public function saveEmployeeBankAccount(int $employeeId, array $data): int
    {
        $this->pdo->beginTransaction();
        try {
            $chk = $this->pdo->prepare("SELECT id FROM employees WHERE tenant_id = ? AND id = ? LIMIT 1");
            $chk->execute([$this->tenantId, $employeeId]);
            if (!$chk->fetchColumn()) {
                throw new \Exception('Employee not found');
            }

            $isPrimary = !empty($data['is_primary']) ? 1 : 0;
            if ($isPrimary) {
                $this->pdo
                    ->prepare("UPDATE employee_bank_accounts SET is_primary = 0 WHERE tenant_id = ? AND employee_id = ?")
                    ->execute([$this->tenantId, $employeeId]);
            }

            $id = (int)($data['id'] ?? 0);
            $encAccountNumber = Crypto::encryptString((string)($data['account_number'] ?? ''));
            $encBranchCode = Crypto::encryptString(isset($data['branch_code']) ? (string)$data['branch_code'] : null);
            if ($id > 0) {
                $stmt = $this->pdo->prepare("
                    UPDATE employee_bank_accounts
                    SET bank_name = ?, account_number = ?, branch_code = ?, account_holder_name = ?, is_primary = ?
                    WHERE tenant_id = ? AND employee_id = ? AND id = ?
                ");
                $stmt->execute([
                    $data['bank_name'],
                    $encAccountNumber,
                    $encBranchCode,
                    $data['account_holder_name'],
                    $isPrimary,
                    $this->tenantId,
                    $employeeId,
                    $id
                ]);
            } else {
                $stmt = $this->pdo->prepare("
                    INSERT INTO employee_bank_accounts (tenant_id, employee_id, bank_name, account_number, branch_code, account_holder_name, is_primary)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $this->tenantId,
                    $employeeId,
                    $data['bank_name'],
                    $encAccountNumber,
                    $encBranchCode,
                    $data['account_holder_name'],
                    $isPrimary
                ]);
                $id = (int)$this->pdo->lastInsertId();
            }

            $this->pdo->commit();
            return $id;
        } catch (\Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function deleteEmployeeBankAccount(int $id): void
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare("
                SELECT employee_id, is_primary
                FROM employee_bank_accounts
                WHERE tenant_id = ? AND id = ?
                LIMIT 1
            ");
            $stmt->execute([$this->tenantId, $id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                $this->pdo->rollBack();
                return;
            }

            $employeeId = (int)$row['employee_id'];
            $wasPrimary = (int)$row['is_primary'] === 1;
            $this->pdo
                ->prepare("DELETE FROM employee_bank_accounts WHERE tenant_id = ? AND id = ?")
                ->execute([$this->tenantId, $id]);

            if ($wasPrimary) {
                $this->pdo
                    ->prepare("UPDATE employee_bank_accounts SET is_primary = 1 WHERE tenant_id = ? AND employee_id = ? ORDER BY id DESC LIMIT 1")
                    ->execute([$this->tenantId, $employeeId]);
            }

            $this->pdo->commit();
        } catch (\Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function setPrimaryBankAccount(int $employeeId, int $accountId): void
    {
        $this->pdo->beginTransaction();
        try {
            $this->pdo
                ->prepare("UPDATE employee_bank_accounts SET is_primary = 0 WHERE tenant_id = ? AND employee_id = ?")
                ->execute([$this->tenantId, $employeeId]);
            $this->pdo
                ->prepare("UPDATE employee_bank_accounts SET is_primary = 1 WHERE tenant_id = ? AND employee_id = ? AND id = ?")
                ->execute([$this->tenantId, $employeeId, $accountId]);
            $this->pdo->commit();
        } catch (\Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    // --- Bonuses ---
    public function getBonusesByCycle(int $cycleId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT b.*, e.name as employee_name, e.code as employee_code
            FROM payroll_bonuses b
            JOIN employees e ON b.employee_id = e.id
            WHERE b.tenant_id = ? AND b.payroll_cycle_id = ?
            ORDER BY b.id DESC
        ");
        $stmt->execute([$this->tenantId, $cycleId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getBonusesForEmployeeCycle(int $employeeId, int $cycleId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT *
            FROM payroll_bonuses
            WHERE tenant_id = ? AND employee_id = ? AND payroll_cycle_id = ? AND status <> 'cancelled'
            ORDER BY id DESC
        ");
        $stmt->execute([$this->tenantId, $employeeId, $cycleId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function saveBonus(array $data): int
    {
        $this->pdo->beginTransaction();
        try {
            $chk = $this->pdo->prepare("SELECT id FROM employees WHERE tenant_id = ? AND id = ? LIMIT 1");
            $chk->execute([$this->tenantId, $data['employee_id']]);
            if (!$chk->fetchColumn()) {
                throw new \Exception('Employee not found');
            }

            $status = $data['status'] ?? 'pending';
            if (!in_array($status, ['pending', 'applied', 'cancelled'], true)) {
                $status = 'pending';
            }

            $kind = strtolower(trim((string)($data['kind'] ?? 'bonus')));
            if (!in_array($kind, ['bonus', 'commission', 'incentive', 'penalty', 'fine'], true)) {
                $kind = 'bonus';
            }
            $direction = strtolower(trim((string)($data['direction'] ?? 'earning')));
            if (!in_array($direction, ['earning', 'deduction'], true)) {
                $direction = in_array($kind, ['penalty', 'fine'], true) ? 'deduction' : 'earning';
            }

            $taxable = $direction === 'earning' && !empty($data['taxable']) ? 1 : 0;
            $id = (int)($data['id'] ?? 0);
            if ($id > 0) {
                $stmt = $this->pdo->prepare("
                    UPDATE payroll_bonuses
                    SET employee_id = ?, payroll_cycle_id = ?, title = ?, amount = ?, taxable = ?, status = ?, kind = ?, direction = ?
                    WHERE tenant_id = ? AND id = ?
                ");
                $stmt->execute([
                    $data['employee_id'],
                    $data['payroll_cycle_id'],
                    $data['title'],
                    $data['amount'],
                    $taxable,
                    $status,
                    $kind,
                    $direction,
                    $this->tenantId,
                    $id
                ]);
            } else {
                $stmt = $this->pdo->prepare("
                    INSERT INTO payroll_bonuses (tenant_id, employee_id, payroll_cycle_id, title, amount, taxable, status, kind, direction)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $this->tenantId,
                    $data['employee_id'],
                    $data['payroll_cycle_id'],
                    $data['title'],
                    $data['amount'],
                    $taxable,
                    $status,
                    $kind,
                    $direction
                ]);
                $id = (int)$this->pdo->lastInsertId();
            }

            $this->pdo->commit();
            return $id;
        } catch (\Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function deleteBonus(int $id): void
    {
        $stmt = $this->pdo->prepare("SELECT status FROM payroll_bonuses WHERE tenant_id = ? AND id = ? LIMIT 1");
        $stmt->execute([$this->tenantId, $id]);
        $status = $stmt->fetchColumn();
        if (!$status) {
            return;
        }
        if ($status === 'applied') {
            throw new \Exception('Applied bonuses cannot be deleted');
        }

        $this->pdo
            ->prepare("DELETE FROM payroll_bonuses WHERE tenant_id = ? AND id = ?")
            ->execute([$this->tenantId, $id]);
    }

    public function markBonusesApplied(array $bonusIds, int $payslipId): void
    {
        if (count($bonusIds) === 0) {
            return;
        }
        $placeholders = implode(',', array_fill(0, count($bonusIds), '?'));
        $params = array_merge([$payslipId, $this->tenantId], $bonusIds);
        $stmt = $this->pdo->prepare("
            UPDATE payroll_bonuses
            SET status = 'applied', applied_payslip_id = ?, applied_at = NOW()
            WHERE tenant_id = ? AND id IN ($placeholders)
        ");
        $stmt->execute($params);
    }

    // --- Payroll Cycles ---
    public function createCycle(string $name, string $start, string $end)
    {
        $stmt = $this->pdo->prepare("INSERT INTO payroll_cycles (tenant_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, 'draft')");
        $stmt->execute([$this->tenantId, $name, $start, $end]);
        return $this->pdo->lastInsertId();
    }

    public function getCycle(int $id)
    {
        $stmt = $this->pdo->prepare("SELECT * FROM payroll_cycles WHERE id = ? AND tenant_id = ?");
        $stmt->execute([$id, $this->tenantId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
    
    public function getCycleByRange(string $start, string $end) {
        $stmt = $this->pdo->prepare("SELECT * FROM payroll_cycles WHERE tenant_id = ? AND start_date = ? AND end_date = ?");
        $stmt->execute([$this->tenantId, $start, $end]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function getCycles()
    {
        $stmt = $this->pdo->prepare("
            SELECT c.*, 
            (SELECT COUNT(*) FROM payslips p WHERE p.payroll_cycle_id = c.id) as processed_count,
            (SELECT SUM(net_salary) FROM payslips p WHERE p.payroll_cycle_id = c.id) as total_net
            FROM payroll_cycles c
            WHERE c.tenant_id = ?
            ORDER BY c.start_date DESC
        ");
        $stmt->execute([$this->tenantId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function markCycleProcessed(int $cycleId)
    {
        $stmt = $this->pdo->prepare("UPDATE payroll_cycles SET status = 'processing', processed_at = NOW() WHERE id = ? AND tenant_id = ?");
        $stmt->execute([$cycleId, $this->tenantId]);
    }

    // --- Payslips ---
    public function savePayslip(array $data, array $items)
    {
        // Check if exists
        $stmtCheck = $this->pdo->prepare("SELECT id FROM payslips WHERE tenant_id = ? AND payroll_cycle_id = ? AND employee_id = ?");
        $stmtCheck->execute([$this->tenantId, $data['payroll_cycle_id'], $data['employee_id']]);
        $existing = $stmtCheck->fetchColumn();

        if ($existing) {
            // Update or Delete/Recreate. Let's Delete/Recreate for simplicity of items
            $this->pdo->prepare("DELETE FROM payslips WHERE id = ?")->execute([$existing]);
        }

        $stmt = $this->pdo->prepare("
            INSERT INTO payslips (
                tenant_id, payroll_cycle_id, employee_id, salary_structure_id,
                total_days, working_days, present_days, paid_leave_days, unpaid_leave_days,
                absent_days, weekly_off_days, payable_days,
                holidays, late_minutes, overtime_hours,
                gross_salary, total_deductions, net_salary, tax_deducted,
                payment_status
            ) VALUES (
                ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?,
                ?
            )
        ");
        
        $stmt->execute([
            $this->tenantId, $data['payroll_cycle_id'], $data['employee_id'], $data['salary_structure_id'],
            $data['total_days'], $data['working_days'], $data['present_days'], $data['paid_leave_days'], $data['unpaid_leave_days'],
            $data['absent_days'], $data['weekly_off_days'], $data['payable_days'],
            $data['holidays'], $data['late_minutes'], $data['overtime_hours'],
            $data['gross_salary'], $data['total_deductions'], $data['net_salary'], $data['tax_deducted'],
            'pending'
        ]);
        
        $payslipId = $this->pdo->lastInsertId();

        $stmtItem = $this->pdo->prepare("INSERT INTO payslip_items (tenant_id, payslip_id, name, type, amount, is_variable) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($items as $item) {
            $stmtItem->execute([
                $this->tenantId,
                $payslipId,
                $item['name'],
                $item['type'],
                $item['amount'],
                $item['is_variable'] ?? 0
            ]);
        }
        
        return $payslipId;
    }

    public function getPayslips(int $cycleId)
    {
        $stmt = $this->pdo->prepare("
            SELECT p.*, e.name as employee_name, e.code as employee_code, e.email 
            FROM payslips p
            JOIN employees e ON p.employee_id = e.id
            WHERE p.tenant_id = ? AND p.payroll_cycle_id = ?
        ");
        $stmt->execute([$this->tenantId, $cycleId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function addPayslipItem(int $payslipId, array $data)
    {
        $stmt = $this->pdo->prepare("INSERT INTO payslip_items (tenant_id, payslip_id, name, type, amount, is_variable) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $this->tenantId,
            $payslipId,
            $data['name'],
            $data['type'],
            $data['amount'],
            1 // Manual adjustments are variable
        ]);
        return $this->pdo->lastInsertId();
    }

    public function updatePayslipItemByName(int $payslipId, string $name, float $amount)
    {
        // Check if exists
        $stmt = $this->pdo->prepare("SELECT id FROM payslip_items WHERE payslip_id = ? AND name = ?");
        $stmt->execute([$payslipId, $name]);
        $exists = $stmt->fetchColumn();

        if ($exists) {
            $stmt = $this->pdo->prepare("UPDATE payslip_items SET amount = ? WHERE id = ?");
            $stmt->execute([$amount, $exists]);
        } else {
            // Create if tax didn't exist (e.g. previously 0 income)
            $this->addPayslipItem($payslipId, [
                'name' => $name,
                'type' => 'deduction',
                'amount' => $amount
            ]);
        }
    }

    public function updatePayslipFinancials(int $payslipId, float $gross, float $deductions, float $tax, float $net)
    {
        $stmt = $this->pdo->prepare("UPDATE payslips SET gross_salary = ?, total_deductions = ?, tax_deducted = ?, net_salary = ? WHERE id = ?");
        $stmt->execute([$gross, $deductions, $tax, $net, $payslipId]);
    }
    
    public function getPayslip(int $id) {
         $stmt = $this->pdo->prepare("
            SELECT p.*, e.name as employee_name, e.code as employee_code, e.designation, e.department, e.date_of_joining, e.email
            FROM payslips p
            JOIN employees e ON p.employee_id = e.id
            WHERE p.tenant_id = ? AND p.id = ?
        ");
        $stmt->execute([$this->tenantId, $id]);
        $payslip = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($payslip) {
            $stmtItems = $this->pdo->prepare("SELECT * FROM payslip_items WHERE payslip_id = ?");
            $stmtItems->execute([$id]);
            $payslip['items'] = $stmtItems->fetchAll(PDO::FETCH_ASSOC);
        }
        
        return $payslip;
    }

    // --- Accounting & Banking ---

    public function getAccountByCode(string $code)
    {
        $stmt = $this->pdo->prepare("SELECT * FROM chart_of_accounts WHERE tenant_id = ? AND code = ?");
        $stmt->execute([$this->tenantId, $code]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function createJournalEntry(array $header, array $items)
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare("INSERT INTO journal_entries (tenant_id, reference_id, reference_type, date, description) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([
                $this->tenantId,
                $header['reference_id'],
                $header['reference_type'],
                $header['date'],
                $header['description']
            ]);
            $journalId = $this->pdo->lastInsertId();

            $stmtItem = $this->pdo->prepare("INSERT INTO journal_items (tenant_id, journal_entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)");
            foreach ($items as $item) {
                $stmtItem->execute([
                    $this->tenantId,
                    $journalId,
                    $item['account_id'],
                    $item['debit'],
                    $item['credit']
                ]);
            }
            
            $this->pdo->commit();
            return $journalId;
        } catch (\Exception $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function getBankDetailsForCycle(int $cycleId)
    {
        $stmt = $this->pdo->prepare("
            SELECT 
                p.net_salary,
                e.name as employee_name,
                e.code as employee_code,
                b.bank_name,
                b.account_number,
                b.branch_code,
                b.account_holder_name
            FROM payslips p
            JOIN employees e ON p.employee_id = e.id
            LEFT JOIN employee_bank_accounts b ON b.employee_id = e.id AND b.is_primary = 1
            WHERE p.tenant_id = ? AND p.payroll_cycle_id = ?
        ");
        $stmt->execute([$this->tenantId, $cycleId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            $r['account_number'] = Crypto::decryptString($r['account_number'] ?? null);
            $r['branch_code'] = Crypto::decryptString($r['branch_code'] ?? null);
        }
        unset($r);
        return $rows;
    }

    public function getPayslipItemsSumByPattern(int $cycleId, string $pattern)
    {
        $stmt = $this->pdo->prepare("
            SELECT SUM(pi.amount) 
            FROM payslip_items pi
            JOIN payslips p ON pi.payslip_id = p.id
            WHERE p.payroll_cycle_id = ? AND p.tenant_id = ? AND pi.name LIKE ?
        ");
        $stmt->execute([$cycleId, $this->tenantId, $pattern]);
        return $stmt->fetchColumn() ?: 0;
    }

    public function getDepartmentCost(int $cycleId)
    {
        $stmt = $this->pdo->prepare("
            SELECT e.department, SUM(p.gross_salary) as total_gross, SUM(p.net_salary) as total_net, COUNT(p.id) as employee_count
            FROM payslips p
            JOIN employees e ON p.employee_id = e.id
            WHERE p.payroll_cycle_id = ? AND p.tenant_id = ?
            GROUP BY e.department
        ");
        $stmt->execute([$cycleId, $this->tenantId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getCycleTotals(int $cycleId)
    {
        $stmt = $this->pdo->prepare("
            SELECT 
                SUM(gross_salary) as total_gross, 
                SUM(net_salary) as total_net, 
                SUM(total_deductions) as total_deductions,
                SUM(tax_deducted) as total_tax, 
                SUM(overtime_hours) as total_ot_hours 
            FROM payslips 
            WHERE payroll_cycle_id = ? AND tenant_id = ?
        ");
        $stmt->execute([$cycleId, $this->tenantId]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    // --- Reports ---
    public function getTaxReport(int $cycleId)
    {
        $stmt = $this->pdo->prepare("
            SELECT e.name, e.code, e.department, p.gross_salary, p.tax_deducted
            FROM payslips p
            JOIN employees e ON p.employee_id = e.id
            WHERE p.payroll_cycle_id = ? AND p.tenant_id = ? AND p.tax_deducted > 0
            ORDER BY e.department, e.name
        ");
        $stmt->execute([$cycleId, $this->tenantId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getOvertimeReport(int $cycleId)
    {
        $stmt = $this->pdo->prepare("
            SELECT e.name, e.code, e.department, p.overtime_hours, 
            (SELECT amount FROM payslip_items WHERE payslip_id = p.id AND name LIKE 'Overtime%') as overtime_pay
            FROM payslips p
            JOIN employees e ON p.employee_id = e.id
            WHERE p.payroll_cycle_id = ? AND p.tenant_id = ? AND p.overtime_hours > 0
            ORDER BY p.overtime_hours DESC
        ");
        $stmt->execute([$cycleId, $this->tenantId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getDeductionReport(int $cycleId)
    {
         $stmt = $this->pdo->prepare("
            SELECT e.name, e.code, pi.name as deduction_name, pi.amount
            FROM payslip_items pi
            JOIN payslips p ON pi.payslip_id = p.id
            JOIN employees e ON p.employee_id = e.id
            WHERE p.payroll_cycle_id = ? AND p.tenant_id = ? AND pi.type = 'deduction'
            ORDER BY pi.name, e.name
        ");
        $stmt->execute([$cycleId, $this->tenantId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function markPayslipsPaid(int $cycleId)
    {
        $stmt = $this->pdo->prepare("UPDATE payslips SET payment_status = 'paid' WHERE payroll_cycle_id = ? AND tenant_id = ?");
        $stmt->execute([$cycleId, $this->tenantId]);
    }

    public function getPayslipPaymentSummaryForCycle(int $cycleId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT
                p.id as payslip_id,
                p.employee_id,
                e.name as employee_name,
                e.code as employee_code,
                p.net_salary,
                p.payment_status,
                COALESCE(SUM(pp.amount), 0) as paid_amount,
                MAX(pp.payment_date) as last_payment_date
            FROM payslips p
            JOIN employees e ON p.employee_id = e.id
            LEFT JOIN payslip_payments pp
                ON pp.payslip_id = p.id AND pp.tenant_id = p.tenant_id
            WHERE p.payroll_cycle_id = ? AND p.tenant_id = ?
            GROUP BY p.id
            ORDER BY e.name ASC
        ");
        $stmt->execute([$cycleId, $this->tenantId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            $net = (float)($r['net_salary'] ?? 0);
            $paid = (float)($r['paid_amount'] ?? 0);
            $r['balance'] = max(0, $net - $paid);
        }
        unset($r);
        return $rows;
    }

    public function getPayslipPayments(int $payslipId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT id, payslip_id, amount, payment_date, method, reference, created_at
            FROM payslip_payments
            WHERE tenant_id = ? AND payslip_id = ?
            ORDER BY id DESC
        ");
        $stmt->execute([$this->tenantId, $payslipId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function addPayslipPayment(int $payslipId, float $amount, string $paymentDate, string $method, ?string $reference): int
    {
        $stmt = $this->pdo->prepare("
            INSERT INTO payslip_payments (tenant_id, payslip_id, amount, payment_date, method, reference)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$this->tenantId, $payslipId, $amount, $paymentDate, $method, $reference]);
        return (int)$this->pdo->lastInsertId();
    }

    public function updatePayslipPaymentStatus(int $payslipId, string $status, ?string $paymentDate): void
    {
        $stmt = $this->pdo->prepare("
            UPDATE payslips
            SET payment_status = ?, payment_date = ?
            WHERE tenant_id = ? AND id = ?
        ");
        $stmt->execute([$status, $paymentDate, $this->tenantId, $payslipId]);
    }

    public function countUnpaidPayslips(int $cycleId): int
    {
        $stmt = $this->pdo->prepare("
            SELECT COUNT(*)
            FROM payslips
            WHERE tenant_id = ? AND payroll_cycle_id = ? AND payment_status <> 'paid'
        ");
        $stmt->execute([$this->tenantId, $cycleId]);
        return (int)$stmt->fetchColumn();
    }

    public function updateCycleStatus(int $cycleId, string $status)
    {
        $stmt = $this->pdo->prepare("UPDATE payroll_cycles SET status = ? WHERE id = ? AND tenant_id = ?");
        $stmt->execute([$status, $cycleId, $this->tenantId]);
    }

    public function approveCycle(int $cycleId, int $userId, string $userRole, string $userName, ?string $note)
    {
        $stmt = $this->pdo->prepare("UPDATE payroll_cycles SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ? AND tenant_id = ?");
        $stmt->execute([$userId, $cycleId, $this->tenantId]);
        $this->addCycleApprovalHistory($cycleId, 'approved', $userId, $userRole, $userName, $note);
    }

    public function rejectCycle(int $cycleId, int $userId, string $userRole, string $userName, ?string $note)
    {
        $stmt = $this->pdo->prepare("UPDATE payroll_cycles SET status = 'draft', approved_by = NULL, approved_at = NULL WHERE id = ? AND tenant_id = ?");
        $stmt->execute([$cycleId, $this->tenantId]);
        $this->addCycleApprovalHistory($cycleId, 'rejected', $userId, $userRole, $userName, $note);
    }

    public function addCycleApprovalHistory(int $cycleId, string $action, int $userId, string $userRole, string $userName, ?string $note)
    {
        $stmt = $this->pdo->prepare("INSERT INTO payroll_cycle_approvals (tenant_id, payroll_cycle_id, action, note, user_id, user_role, user_name) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $this->tenantId,
            $cycleId,
            $action,
            $note,
            $userId,
            $userRole,
            $userName
        ]);
    }

    public function getCycleApprovals(int $cycleId)
    {
        $stmt = $this->pdo->prepare("SELECT * FROM payroll_cycle_approvals WHERE tenant_id = ? AND payroll_cycle_id = ? ORDER BY id DESC");
        $stmt->execute([$this->tenantId, $cycleId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // Duplicate removed
    
    public function getYearlyPayrollCost(int $year)
    {
        $stmt = $this->pdo->prepare("
            SELECT 
                MONTH(c.end_date) as month,
                SUM(p.gross_salary) as total_gross,
                SUM(p.net_salary) as total_net,
                SUM(p.tax_deducted) as total_tax,
                COUNT(p.id) as employee_count
            FROM payslips p
            JOIN payroll_cycles c ON p.payroll_cycle_id = c.id
            WHERE p.tenant_id = ? AND YEAR(c.end_date) = ?
            GROUP BY MONTH(c.end_date)
            ORDER BY month
        ");
        $stmt->execute([$this->tenantId, $year]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getEmployeePayrollHistory(int $employeeId, int $year)
    {
        $stmt = $this->pdo->prepare("
            SELECT 
                c.name as cycle_name,
                c.end_date,
                p.gross_salary,
                p.net_salary,
                p.tax_deducted,
                p.id as payslip_id
            FROM payslips p
            JOIN payroll_cycles c ON p.payroll_cycle_id = c.id
            WHERE p.tenant_id = ? AND p.employee_id = ? AND YEAR(c.end_date) = ?
            ORDER BY c.end_date DESC
        ");
        $stmt->execute([$this->tenantId, $employeeId, $year]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getLoans(int $employeeId = 0)
    {
        $sql = "SELECT * FROM loans WHERE tenant_id = ?";
        $params = [$this->tenantId];

        if ($employeeId > 0) {
            $sql .= " AND employee_id = ?";
            $params[] = $employeeId;
        }

        $sql .= " ORDER BY created_at DESC";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // --- Settings ---
    public function getSetting(string $key, $default = null)
    {
        $stmt = $this->pdo->prepare("SELECT setting_value FROM payroll_settings WHERE tenant_id = ? AND setting_key = ?");
        $stmt->execute([$this->tenantId, $key]);
        $val = $stmt->fetchColumn();
        return $val !== false ? $val : $default;
    }

    public function saveSetting(string $key, $value)
    {
        $stmt = $this->pdo->prepare("
            INSERT INTO payroll_settings (tenant_id, setting_key, setting_value) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        ");
        return $stmt->execute([$this->tenantId, $key, $value]);
    }
    
    public function getAllSettings() {
        $stmt = $this->pdo->prepare("SELECT setting_key, setting_value FROM payroll_settings WHERE tenant_id = ?");
        $stmt->execute([$this->tenantId]);
        return $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    }

    public function getRolePermissions(array $roleNames): array
    {
        if (count($roleNames) === 0) return [];
        $placeholders = implode(',', array_fill(0, count($roleNames), '?'));
        $stmt = $this->pdo->prepare("
            SELECT name, permissions
            FROM roles
            WHERE name IN ($placeholders)
        ");
        $stmt->execute($roleNames);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $map = [];
        foreach ($rows as $r) {
            $name = (string)($r['name'] ?? '');
            $permsRaw = (string)($r['permissions'] ?? '[]');
            $perms = json_decode($permsRaw, true);
            if (!is_array($perms)) $perms = [];
            $map[$name] = array_values(array_unique(array_map('strval', $perms)));
        }
        return $map;
    }

    public function upsertRolePermissions(string $roleName, array $permissions): void
    {
        $permissions = array_values(array_unique(array_map('strval', $permissions)));
        $json = json_encode($permissions, JSON_UNESCAPED_SLASHES);
        if ($json === false) $json = '[]';
        $stmt = $this->pdo->prepare("
            INSERT INTO roles (name, permissions)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE permissions = VALUES(permissions)
        ");
        $stmt->execute([$roleName, $json]);
    }

    // --- Tax Slabs ---
    public function getTaxSlabs()
    {
        $stmt = $this->pdo->prepare("SELECT * FROM tax_slabs WHERE tenant_id = ? ORDER BY min_salary ASC");
        $stmt->execute([$this->tenantId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function saveTaxSlab(array $data)
    {
        if (isset($data['id'])) {
            $stmt = $this->pdo->prepare("
                UPDATE tax_slabs 
                SET name = ?, min_salary = ?, max_salary = ?, tax_percent = ? 
                WHERE id = ? AND tenant_id = ?
            ");
            return $stmt->execute([
                $data['name'], 
                $data['min_salary'], 
                $data['max_salary'], 
                $data['tax_percent'], 
                $data['id'], 
                $this->tenantId
            ]);
        } else {
            $stmt = $this->pdo->prepare("
                INSERT INTO tax_slabs (tenant_id, name, min_salary, max_salary, tax_percent) 
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $this->tenantId,
                $data['name'],
                $data['min_salary'],
                $data['max_salary'],
                $data['tax_percent']
            ]);
            return $this->pdo->lastInsertId();
        }
    }

    public function deleteTaxSlab(int $id)
    {
        $stmt = $this->pdo->prepare("DELETE FROM tax_slabs WHERE id = ? AND tenant_id = ?");
        return $stmt->execute([$id, $this->tenantId]);
    }

    // --- Loan Management ---
    public function createLoan(array $data)
    {
        $status = $data['status'] ?? 'active';
        $stmt = $this->pdo->prepare("
            INSERT INTO loans (
                tenant_id, employee_id, type, amount, interest_rate, 
                total_repayment_amount, monthly_installment, start_date, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $this->tenantId,
            $data['employee_id'],
            $data['type'],
            $data['amount'],
            $data['interest_rate'] ?? 0,
            $data['total_repayment_amount'],
            $data['monthly_installment'],
            $data['start_date'],
            $status
        ]);
        return $this->pdo->lastInsertId();
    }

    public function updateLoanStatus(int $id, string $status)
    {
        $stmt = $this->pdo->prepare("UPDATE loans SET status = ? WHERE id = ? AND tenant_id = ?");
        return $stmt->execute([$status, $id, $this->tenantId]);
    }

    public function getActiveLoans(int $employeeId)
    {
        $stmt = $this->pdo->prepare("
            SELECT l.*, 
                   (l.total_repayment_amount - COALESCE(SUM(r.amount), 0)) as current_balance
            FROM loans l
            LEFT JOIN loan_repayments r ON l.id = r.loan_id
            WHERE l.tenant_id = ? AND l.employee_id = ? AND l.status = 'active'
            GROUP BY l.id
        ");
        $stmt->execute([$this->tenantId, $employeeId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getLoansByEmployee(int $employeeId)
    {
        $stmt = $this->pdo->prepare("
            SELECT l.*, 
                   (l.total_repayment_amount - COALESCE(SUM(r.amount), 0)) as current_balance
            FROM loans l
            LEFT JOIN loan_repayments r ON l.id = r.loan_id
            WHERE l.tenant_id = ? AND l.employee_id = ?
            GROUP BY l.id
            ORDER BY l.created_at DESC
        ");
        $stmt->execute([$this->tenantId, $employeeId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getAllLoans(array $filters = [])
    {
        $sql = "
            SELECT l.*, e.name as employee_name, e.code as employee_code,
                   (l.total_repayment_amount - COALESCE(SUM(r.amount), 0)) as current_balance
            FROM loans l
            LEFT JOIN loan_repayments r ON l.id = r.loan_id
            JOIN employees e ON l.employee_id = e.id
            WHERE l.tenant_id = ?
        ";
        
        $params = [$this->tenantId];

        if (!empty($filters['status'])) {
            $sql .= " AND l.status = ?";
            $params[] = $filters['status'];
        }
        
        if (!empty($filters['employee_id'])) {
            $sql .= " AND l.employee_id = ?";
            $params[] = $filters['employee_id'];
        }

        $sql .= " GROUP BY l.id ORDER BY l.created_at DESC";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getLoanBalance(int $loanId)
    {
        // Calculate balance: Total Repayment - Sum(Repayments)
        $stmt = $this->pdo->prepare("SELECT total_repayment_amount FROM loans WHERE id = ?");
        $stmt->execute([$loanId]);
        $total = $stmt->fetchColumn();

        $stmtRepaid = $this->pdo->prepare("SELECT SUM(amount) FROM loan_repayments WHERE loan_id = ?");
        $stmtRepaid->execute([$loanId]);
        $repaid = $stmtRepaid->fetchColumn() ?: 0;

        return $total - $repaid;
    }

    public function recordLoanRepayment(int $loanId, float $amount, ?int $payslipId, string $date)
    {
        $stmt = $this->pdo->prepare("INSERT INTO loan_repayments (tenant_id, loan_id, payslip_id, payment_date, amount) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([
            $this->tenantId,
            $loanId,
            $payslipId,
            $date,
            $amount
        ]);

        // Check if loan is fully paid
        $balance = $this->getLoanBalance($loanId);
        if ($balance <= 0) {
            $stmtUpdate = $this->pdo->prepare("UPDATE loans SET status = 'closed' WHERE id = ?");
            $stmtUpdate->execute([$loanId]);
        }
    }

    public function getJournalEntriesByReference(string $refType, int $refId)
    {
        $stmt = $this->pdo->prepare("
            SELECT je.* 
            FROM journal_entries je
            WHERE je.tenant_id = ? AND je.reference_type = ? AND je.reference_id = ?
            ORDER BY je.date DESC, je.id DESC
        ");
        $stmt->execute([$this->tenantId, $refType, $refId]);
        $entries = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($entries as &$entry) {
            $stmtItems = $this->pdo->prepare("
                SELECT ji.*, ca.name as account_name, ca.code as account_code, ca.type as account_type
                FROM journal_items ji
                JOIN chart_of_accounts ca ON ji.account_id = ca.id
                WHERE ji.journal_entry_id = ?
                ORDER BY ji.debit DESC
            ");
            $stmtItems->execute([$entry['id']]);
            $entry['items'] = $stmtItems->fetchAll(PDO::FETCH_ASSOC);
        }

        return $entries;
    }
}
