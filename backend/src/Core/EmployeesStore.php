<?php

namespace App\Core;

class EmployeesStore
{
    private $file = __DIR__ . '/../../data/employees.json';

    private function resolveTenantId($pdo): ?int
    {
        $user = Auth::currentUser() ?? [];
        $tenantId = $user['tenant_id'] ?? null;
        if ($tenantId) return (int)$tenantId;

        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        if (!$hint) return null;
        $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
        $t->execute([$hint]);
        $row = $t->fetch();
        return $row ? (int)$row['id'] : null;
    }

    private function ensureEmployeeDeviceSyncIdsTable($pdo): void
    {
        $pdo->exec("CREATE TABLE IF NOT EXISTS employee_device_sync_ids (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            employee_id INT NOT NULL,
            device_id VARCHAR(64) NOT NULL,
            device_employee_id VARCHAR(64) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_emp_device (tenant_id, employee_id, device_id),
            UNIQUE KEY uniq_device_empid (tenant_id, device_id, device_employee_id)
        )");
    }

    public function all()
    {
        $pdo = Database::get();
        if ($pdo) {
            $user = Auth::currentUser() ?? [];
            $role = $user['role'] ?? null;
            if ($role === 'superadmin') {
                $stmt = $pdo->query('SELECT id, tenant_id, name, code, status, created_at FROM employees ORDER BY id DESC');
                return array_map(fn($r) => [
                    'id' => (string)$r['id'],
                    'tenant_id' => (string)$r['tenant_id'],
                    'name' => $r['name'],
                    'code' => $r['code'],
                    'status' => $r['status'],
                    'created_at' => $r['created_at']
                ], $stmt->fetchAll());
            }

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
            if (!$tenantId) return [];

            $stmt = $pdo->prepare('SELECT id, tenant_id, name, code, status, created_at FROM employees WHERE tenant_id=? ORDER BY id DESC');
            $stmt->execute([(int)$tenantId]);
            return array_map(fn($r) => [
                'id' => (string)$r['id'],
                'tenant_id' => (string)$r['tenant_id'],
                'name' => $r['name'],
                'code' => $r['code'],
                'status' => $r['status'],
                'created_at' => $r['created_at']
            ], $stmt->fetchAll());
        }
        if (!file_exists($this->file)) return [];
        return json_decode(file_get_contents($this->file), true) ?? [];
    }

    public function getDeviceSyncIds($employeeId): array
    {
        $employeeId = (string)$employeeId;
        $pdo = Database::get();
        if (!$pdo) return [];

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) throw new \Exception('Tenant context missing');

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetch()) throw new \Exception('Not found');

        $this->ensureEmployeeDeviceSyncIdsTable($pdo);
        $stmt = $pdo->prepare('SELECT device_id, device_employee_id FROM employee_device_sync_ids WHERE tenant_id=? AND employee_id=? ORDER BY device_id ASC');
        $stmt->execute([(int)$tenantId, (int)$employeeId]);
        return array_map(fn($r) => [
            'device_id' => (string)$r['device_id'],
            'device_employee_id' => (string)$r['device_employee_id'],
        ], $stmt->fetchAll());
    }

    public function create($name, $code)
    {
        $pdo = Database::get();
        if ($pdo) {
            $user = Auth::currentUser();
            $tenantId = $user['tenant_id'] ?? null;
            
            if (!$tenantId) {
                 // Try from header if not in user context (e.g. API token)
                $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
                if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
            }
            
            if (!$tenantId) throw new \Exception('Tenant context missing');

            // Unique per tenant
            $stmt = $pdo->prepare('SELECT id FROM employees WHERE tenant_id=? AND code=?');
            $stmt->execute([$tenantId, $code]);
            if ($stmt->fetch()) throw new \Exception('Employee code exists');
            $shiftStmt = $pdo->prepare('SELECT id FROM shifts WHERE tenant_id=? AND is_default=1 ORDER BY id DESC LIMIT 1');
            $shiftStmt->execute([(int)$tenantId]);
            $shiftId = $shiftStmt->fetchColumn();
            if (!$shiftId) {
                $insShift = $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, break_duration_minutes, working_days, is_default) VALUES (?, 'Standard Shift', '09:00:00', '17:00:00', 15, 15, 0, 'Mon,Tue,Wed,Thu,Fri', 1)");
                $insShift->execute([(int)$tenantId]);
                $shiftId = $pdo->lastInsertId();
            }

            $stmt = $pdo->prepare('INSERT INTO employees (tenant_id, shift_id, name, code, status) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([(int)$tenantId, (int)$shiftId, $name, $code, 'active']);
            return [
                'id' => (string)$pdo->lastInsertId(),
                'tenant_id' => (string)$tenantId,
                'name' => $name,
                'code' => $code,
                'status' => 'active',
                'created_at' => date('c')
            ];
        }
        $list = $this->all();
        foreach ($list as $e) if ($e['code'] === $code) throw new \Exception('Employee code exists');
        $item = [
            'id' => uniqid('emp_'),
            'name' => $name,
            'code' => $code,
            'status' => 'active',
            'created_at' => date('c')
        ];
        $list[] = $item;
        file_put_contents($this->file, json_encode($list, JSON_PRETTY_PRINT));
        return $item;
    }

    public function update($id, $name, $code, $status, $deviceSyncIds = null)
    {
        $pdo = Database::get();
        if ($pdo) {
            $tenantId = $this->resolveTenantId($pdo);
            if (!$tenantId) throw new \Exception('Tenant context missing');

            $idInt = (int)$id;
            $nameStr = (string)$name;
            $codeStr = trim((string)$code);
            $statusStr = (string)$status;

            if ($codeStr === '') throw new \Exception('Employee code required');

            $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
            $empCheck->execute([(int)$tenantId, $idInt]);
            if (!$empCheck->fetch()) throw new \Exception('Not found');

            $dup = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND code=? AND id<>? LIMIT 1');
            $dup->execute([(int)$tenantId, $codeStr, $idInt]);
            if ($dup->fetch()) throw new \Exception('Employee code exists');

            if (is_array($deviceSyncIds)) {
                $this->ensureEmployeeDeviceSyncIdsTable($pdo);
            }

            try {
                $pdo->beginTransaction();

                $stmt = $pdo->prepare('UPDATE employees SET name=?, code=?, status=? WHERE tenant_id=? AND id=?');
                $stmt->execute([$nameStr, $codeStr, $statusStr, (int)$tenantId, $idInt]);

                if (is_array($deviceSyncIds)) {
                    $del = $pdo->prepare('DELETE FROM employee_device_sync_ids WHERE tenant_id=? AND employee_id=?');
                    $del->execute([(int)$tenantId, $idInt]);

                    $devCheck = $pdo->prepare('SELECT 1 FROM devices WHERE tenant_id=? AND device_id=? LIMIT 1');
                    $dupCheck = $pdo->prepare('SELECT employee_id FROM employee_device_sync_ids WHERE tenant_id=? AND device_id=? AND device_employee_id=? LIMIT 1');
                    $ins = $pdo->prepare('INSERT INTO employee_device_sync_ids(tenant_id, employee_id, device_id, device_employee_id) VALUES(?, ?, ?, ?)');

                    foreach ($deviceSyncIds as $row) {
                        if (!is_array($row)) continue;
                        $deviceId = trim((string)($row['device_id'] ?? ''));
                        $deviceEmployeeId = trim((string)($row['device_employee_id'] ?? ''));
                        if ($deviceId === '' || $deviceEmployeeId === '') continue;

                        $devCheck->execute([(int)$tenantId, $deviceId]);
                        if (!$devCheck->fetch()) {
                            throw new \Exception('Device not found: ' . $deviceId);
                        }

                        $dupCheck->execute([(int)$tenantId, $deviceId, $deviceEmployeeId]);
                        $existing = $dupCheck->fetch();
                        if ($existing && (int)$existing['employee_id'] !== $idInt) {
                            throw new \Exception('Device employee ID already used: ' . $deviceEmployeeId);
                        }

                        $ins->execute([(int)$tenantId, $idInt, $deviceId, $deviceEmployeeId]);
                    }
                }

                $pdo->commit();
            } catch (\Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }

            $stmt = $pdo->prepare('SELECT id, tenant_id, name, code, status, created_at FROM employees WHERE tenant_id=? AND id=?');
            $stmt->execute([(int)$tenantId, $idInt]);
            $e = $stmt->fetch();
            if (!$e) throw new \Exception('Not found');
            return [
                'id' => (string)$e['id'],
                'tenant_id' => (string)$e['tenant_id'],
                'name' => $e['name'],
                'code' => $e['code'],
                'status' => $e['status'],
                'created_at' => $e['created_at'],
            ];
        }
        $list = $this->all();
        foreach ($list as &$e) {
            if ($e['id'] === $id) {
                $e['name'] = $name;
                $e['code'] = $code;
                $e['status'] = $status;
                file_put_contents($this->file, json_encode($list, JSON_PRETTY_PRINT));
                return $e;
            }
        }
        throw new \Exception('Not found');
    }

    public function delete($id)
    {
        $pdo = Database::get();
        if ($pdo) {
            $tenantId = $this->resolveTenantId($pdo);
            if (!$tenantId) throw new \Exception('Tenant context missing');

            $idInt = (int)$id;
            try {
                $this->ensureEmployeeDeviceSyncIdsTable($pdo);
                $pdo->beginTransaction();
                $delMap = $pdo->prepare('DELETE FROM employee_device_sync_ids WHERE tenant_id=? AND employee_id=?');
                $delMap->execute([(int)$tenantId, $idInt]);
                $stmt = $pdo->prepare('DELETE FROM employees WHERE tenant_id=? AND id=?');
                $stmt->execute([(int)$tenantId, $idInt]);
                $pdo->commit();
            } catch (\Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
            return true;
        }
        $list = $this->all();
        $list = array_values(array_filter($list, fn($e) => $e['id'] !== $id));
        file_put_contents($this->file, json_encode($list, JSON_PRETTY_PRINT));
        return true;
    }
}
