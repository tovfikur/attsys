<?php

namespace App\Core;

class EmployeesStore
{
    private $file = __DIR__ . '/../../data/employees.json';

    public static function ensureEmployeeProfileColumns($pdo): void
    {
        $columns = [
            'profile_photo_path' => 'VARCHAR(255) NULL',
            'gender' => 'VARCHAR(32) NULL',
            'date_of_birth' => 'DATE NULL',
            'personal_phone' => 'VARCHAR(64) NULL',
            'email' => 'VARCHAR(160) NULL',
            'present_address' => 'TEXT NULL',
            'permanent_address' => 'TEXT NULL',
            'department' => 'VARCHAR(128) NULL',
            'designation' => 'VARCHAR(128) NULL',
            'employee_type' => 'VARCHAR(64) NULL',
            'date_of_joining' => 'DATE NULL',
            'supervisor_name' => 'VARCHAR(128) NULL',
            'work_location' => 'VARCHAR(128) NULL',
        ];

        $check = $pdo->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
        foreach ($columns as $name => $def) {
            $check->execute(['employees', $name]);
            if ((int)$check->fetchColumn() > 0) continue;
            $pdo->exec("ALTER TABLE employees ADD COLUMN `" . $name . "` " . $def);
        }
    }

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

    private function ensureEmployeeAttachmentsTable($pdo): void
    {
        $pdo->exec("CREATE TABLE IF NOT EXISTS employee_attachments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            employee_id INT NOT NULL,
            category VARCHAR(32) NOT NULL,
            title VARCHAR(128) NULL,
            original_name VARCHAR(255) NOT NULL,
            stored_path VARCHAR(255) NOT NULL,
            mime VARCHAR(96) NOT NULL,
            size_bytes INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_employee_attachments_tenant_employee (tenant_id, employee_id),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        )");
    }

    public function all()
    {
        $pdo = Database::get();
        if ($pdo) {
            self::ensureEmployeeProfileColumns($pdo);
            $user = Auth::currentUser() ?? [];
            $role = $user['role'] ?? null;
            if ($role === 'superadmin') {
                $stmt = $pdo->query('SELECT e.id, e.tenant_id, e.shift_id, s.name AS shift_name, s.working_days, e.name, e.code, e.profile_photo_path, e.gender, e.date_of_birth, e.personal_phone, e.email, e.present_address, e.permanent_address, e.department, e.designation, e.employee_type, e.date_of_joining, e.supervisor_name, e.work_location, e.status, e.created_at FROM employees e JOIN shifts s ON s.id = e.shift_id ORDER BY e.id DESC');
                return array_map(fn($r) => [
                    'id' => (string)$r['id'],
                    'tenant_id' => (string)$r['tenant_id'],
                    'shift_id' => (string)($r['shift_id'] ?? ''),
                    'shift_name' => (string)($r['shift_name'] ?? ''),
                    'working_days' => (string)($r['working_days'] ?? ''),
                    'name' => $r['name'],
                    'code' => $r['code'],
                    'profile_photo_path' => (string)($r['profile_photo_path'] ?? ''),
                    'gender' => (string)($r['gender'] ?? ''),
                    'date_of_birth' => $r['date_of_birth'],
                    'personal_phone' => (string)($r['personal_phone'] ?? ''),
                    'email' => (string)($r['email'] ?? ''),
                    'present_address' => (string)($r['present_address'] ?? ''),
                    'permanent_address' => (string)($r['permanent_address'] ?? ''),
                    'department' => (string)($r['department'] ?? ''),
                    'designation' => (string)($r['designation'] ?? ''),
                    'employee_type' => (string)($r['employee_type'] ?? ''),
                    'date_of_joining' => $r['date_of_joining'],
                    'supervisor_name' => (string)($r['supervisor_name'] ?? ''),
                    'work_location' => (string)($r['work_location'] ?? ''),
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

            $stmt = $pdo->prepare('SELECT e.id, e.tenant_id, e.shift_id, s.name AS shift_name, s.working_days, e.name, e.code, e.profile_photo_path, e.gender, e.date_of_birth, e.personal_phone, e.email, e.present_address, e.permanent_address, e.department, e.designation, e.employee_type, e.date_of_joining, e.supervisor_name, e.work_location, e.status, e.created_at FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? ORDER BY e.id DESC');
            $stmt->execute([(int)$tenantId]);
            return array_map(fn($r) => [
                'id' => (string)$r['id'],
                'tenant_id' => (string)$r['tenant_id'],
                'shift_id' => (string)($r['shift_id'] ?? ''),
                'shift_name' => (string)($r['shift_name'] ?? ''),
                'working_days' => (string)($r['working_days'] ?? ''),
                'name' => $r['name'],
                'code' => $r['code'],
                'profile_photo_path' => (string)($r['profile_photo_path'] ?? ''),
                'gender' => (string)($r['gender'] ?? ''),
                'date_of_birth' => $r['date_of_birth'],
                'personal_phone' => (string)($r['personal_phone'] ?? ''),
                'email' => (string)($r['email'] ?? ''),
                'present_address' => (string)($r['present_address'] ?? ''),
                'permanent_address' => (string)($r['permanent_address'] ?? ''),
                'department' => (string)($r['department'] ?? ''),
                'designation' => (string)($r['designation'] ?? ''),
                'employee_type' => (string)($r['employee_type'] ?? ''),
                'date_of_joining' => $r['date_of_joining'],
                'supervisor_name' => (string)($r['supervisor_name'] ?? ''),
                'work_location' => (string)($r['work_location'] ?? ''),
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

    public function create(array $in)
    {
        $name = trim((string)($in['name'] ?? ''));
        $code = trim((string)($in['code'] ?? ''));
        $gender = trim((string)($in['gender'] ?? ''));
        $dateOfBirth = trim((string)($in['date_of_birth'] ?? ''));
        $personalPhone = trim((string)($in['personal_phone'] ?? ''));
        $email = trim((string)($in['email'] ?? ''));
        $presentAddress = trim((string)($in['present_address'] ?? ''));
        $permanentAddress = trim((string)($in['permanent_address'] ?? ''));
        $department = trim((string)($in['department'] ?? ''));
        $designation = trim((string)($in['designation'] ?? ''));
        $employeeType = trim((string)($in['employee_type'] ?? ''));
        $dateOfJoining = trim((string)($in['date_of_joining'] ?? ''));
        $supervisorName = trim((string)($in['supervisor_name'] ?? ''));
        $workLocation = trim((string)($in['work_location'] ?? ''));

        if ($name === '') throw new \Exception('Full name required');
        if ($code === '') throw new \Exception('Employee code required');
        if ($gender === '') throw new \Exception('Gender required');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateOfBirth)) throw new \Exception('Date of birth required');
        if ($personalPhone === '') throw new \Exception('Personal phone required');
        if ($email === '') throw new \Exception('Email required');
        if ($presentAddress === '') throw new \Exception('Present address required');
        if ($permanentAddress === '') throw new \Exception('Permanent address required');
        if ($department === '') throw new \Exception('Department required');
        if ($designation === '') throw new \Exception('Designation required');
        if ($employeeType === '') throw new \Exception('Employee type required');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateOfJoining)) throw new \Exception('Date of joining required');
        if ($supervisorName === '') throw new \Exception('Supervisor/Reporting manager required');
        if ($workLocation === '') throw new \Exception('Work location required');

        $pdo = Database::get();
        if ($pdo) {
            self::ensureEmployeeProfileColumns($pdo);
            $user = Auth::currentUser();
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

            if (!$tenantId) throw new \Exception('Tenant context missing');

            $stmt = $pdo->prepare('SELECT id FROM employees WHERE tenant_id=? AND code=?');
            $stmt->execute([(int)$tenantId, $code]);
            if ($stmt->fetch()) throw new \Exception('Employee code exists');

            $shiftStmt = $pdo->prepare('SELECT id FROM shifts WHERE tenant_id=? AND is_default=1 ORDER BY id DESC LIMIT 1');
            $shiftStmt->execute([(int)$tenantId]);
            $shiftId = $shiftStmt->fetchColumn();
            if (!$shiftId) {
                $insShift = $pdo->prepare("INSERT INTO shifts (tenant_id, name, start_time, end_time, late_tolerance_minutes, early_exit_tolerance_minutes, break_duration_minutes, working_days, is_default) VALUES (?, 'Standard Shift', '09:00:00', '17:00:00', 15, 15, 0, 'Mon,Tue,Wed,Thu,Fri', 1)");
                $insShift->execute([(int)$tenantId]);
                $shiftId = (int)$pdo->lastInsertId();
                if ($shiftId <= 0) {
                    $shiftStmt = $pdo->prepare('SELECT id FROM shifts WHERE tenant_id=? AND is_default=1 ORDER BY id DESC LIMIT 1');
                    $shiftStmt->execute([(int)$tenantId]);
                    $shiftId = (int)$shiftStmt->fetchColumn();
                }
            }

            $stmt = $pdo->prepare('INSERT INTO employees (tenant_id, shift_id, name, code, profile_photo_path, gender, date_of_birth, personal_phone, email, present_address, permanent_address, department, designation, employee_type, date_of_joining, supervisor_name, work_location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                (int)$tenantId,
                (int)$shiftId,
                $name,
                $code,
                null,
                $gender,
                $dateOfBirth,
                $personalPhone,
                $email,
                $presentAddress,
                $permanentAddress,
                $department,
                $designation,
                $employeeType,
                $dateOfJoining,
                $supervisorName,
                $workLocation,
                'active'
            ]);

            $employeeId = (int)$pdo->lastInsertId();
            if ($employeeId <= 0) {
                $idStmt = $pdo->prepare('SELECT id FROM employees WHERE tenant_id=? AND code=? ORDER BY id DESC LIMIT 1');
                $idStmt->execute([(int)$tenantId, $code]);
                $employeeId = (int)$idStmt->fetchColumn();
            }

            $shiftInfoStmt = $pdo->prepare('SELECT name, working_days FROM shifts WHERE tenant_id=? AND id=? LIMIT 1');
            $shiftInfoStmt->execute([(int)$tenantId, (int)$shiftId]);
            $shiftInfo = $shiftInfoStmt->fetch(\PDO::FETCH_ASSOC) ?: [];
            return [
                'id' => (string)$employeeId,
                'tenant_id' => (string)$tenantId,
                'shift_id' => (string)$shiftId,
                'shift_name' => (string)($shiftInfo['name'] ?? ''),
                'working_days' => (string)($shiftInfo['working_days'] ?? ''),
                'name' => $name,
                'code' => $code,
                'profile_photo_path' => '',
                'gender' => $gender,
                'date_of_birth' => $dateOfBirth,
                'personal_phone' => $personalPhone,
                'email' => $email,
                'present_address' => $presentAddress,
                'permanent_address' => $permanentAddress,
                'department' => $department,
                'designation' => $designation,
                'employee_type' => $employeeType,
                'date_of_joining' => $dateOfJoining,
                'supervisor_name' => $supervisorName,
                'work_location' => $workLocation,
                'status' => 'active',
                'created_at' => date('c')
            ];
        }

        $list = $this->all();
        foreach ($list as $e) if (($e['code'] ?? '') === $code) throw new \Exception('Employee code exists');
        $item = [
            'id' => uniqid('emp_'),
            'name' => $name,
            'code' => $code,
            'profile_photo_path' => '',
            'gender' => $gender,
            'date_of_birth' => $dateOfBirth,
            'personal_phone' => $personalPhone,
            'email' => $email,
            'present_address' => $presentAddress,
            'permanent_address' => $permanentAddress,
            'department' => $department,
            'designation' => $designation,
            'employee_type' => $employeeType,
            'date_of_joining' => $dateOfJoining,
            'supervisor_name' => $supervisorName,
            'work_location' => $workLocation,
            'status' => 'active',
            'created_at' => date('c')
        ];
        $list[] = $item;
        file_put_contents($this->file, json_encode($list, JSON_PRETTY_PRINT));
        return $item;
    }

    public function update($id, array $in, $deviceSyncIds = null)
    {
        $name = trim((string)($in['name'] ?? ''));
        $code = trim((string)($in['code'] ?? ''));
        $status = trim((string)($in['status'] ?? 'active'));
        $gender = trim((string)($in['gender'] ?? ''));
        $dateOfBirth = trim((string)($in['date_of_birth'] ?? ''));
        $personalPhone = trim((string)($in['personal_phone'] ?? ''));
        $email = trim((string)($in['email'] ?? ''));
        $presentAddress = trim((string)($in['present_address'] ?? ''));
        $permanentAddress = trim((string)($in['permanent_address'] ?? ''));
        $department = trim((string)($in['department'] ?? ''));
        $designation = trim((string)($in['designation'] ?? ''));
        $employeeType = trim((string)($in['employee_type'] ?? ''));
        $dateOfJoining = trim((string)($in['date_of_joining'] ?? ''));
        $supervisorName = trim((string)($in['supervisor_name'] ?? ''));
        $workLocation = trim((string)($in['work_location'] ?? ''));

        $pdo = Database::get();
        if ($pdo) {
            self::ensureEmployeeProfileColumns($pdo);
            $tenantId = $this->resolveTenantId($pdo);
            if (!$tenantId) throw new \Exception('Tenant context missing');

            $idInt = (int)$id;
            $nameStr = (string)$name;
            $codeStr = (string)$code;
            $statusStr = (string)($status ?: 'active');

            if ($nameStr === '') throw new \Exception('Full name required');
            if ($codeStr === '') throw new \Exception('Employee code required');
            if ($gender === '') throw new \Exception('Gender required');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateOfBirth)) throw new \Exception('Date of birth required');
            if ($personalPhone === '') throw new \Exception('Personal phone required');
            if ($email === '') throw new \Exception('Email required');
            if ($presentAddress === '') throw new \Exception('Present address required');
            if ($permanentAddress === '') throw new \Exception('Permanent address required');
            if ($department === '') throw new \Exception('Department required');
            if ($designation === '') throw new \Exception('Designation required');
            if ($employeeType === '') throw new \Exception('Employee type required');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateOfJoining)) throw new \Exception('Date of joining required');
            if ($supervisorName === '') throw new \Exception('Supervisor/Reporting manager required');
            if ($workLocation === '') throw new \Exception('Work location required');

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

                $stmt = $pdo->prepare('UPDATE employees SET name=?, code=?, gender=?, date_of_birth=?, personal_phone=?, email=?, present_address=?, permanent_address=?, department=?, designation=?, employee_type=?, date_of_joining=?, supervisor_name=?, work_location=?, status=? WHERE tenant_id=? AND id=?');
                $stmt->execute([$nameStr, $codeStr, $gender, $dateOfBirth, $personalPhone, $email, $presentAddress, $permanentAddress, $department, $designation, $employeeType, $dateOfJoining, $supervisorName, $workLocation, $statusStr, (int)$tenantId, $idInt]);

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

            $stmt = $pdo->prepare('SELECT e.id, e.tenant_id, e.shift_id, s.name AS shift_name, s.working_days, e.name, e.code, e.profile_photo_path, e.gender, e.date_of_birth, e.personal_phone, e.email, e.present_address, e.permanent_address, e.department, e.designation, e.employee_type, e.date_of_joining, e.supervisor_name, e.work_location, e.status, e.created_at FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? AND e.id=? LIMIT 1');
            $stmt->execute([(int)$tenantId, $idInt]);
            $e = $stmt->fetch();
            if (!$e) throw new \Exception('Not found');
            return [
                'id' => (string)$e['id'],
                'tenant_id' => (string)$e['tenant_id'],
                'shift_id' => (string)($e['shift_id'] ?? ''),
                'shift_name' => (string)($e['shift_name'] ?? ''),
                'working_days' => (string)($e['working_days'] ?? ''),
                'name' => (string)$e['name'],
                'code' => (string)$e['code'],
                'profile_photo_path' => (string)($e['profile_photo_path'] ?? ''),
                'gender' => (string)($e['gender'] ?? ''),
                'date_of_birth' => $e['date_of_birth'],
                'personal_phone' => (string)($e['personal_phone'] ?? ''),
                'email' => (string)($e['email'] ?? ''),
                'present_address' => (string)($e['present_address'] ?? ''),
                'permanent_address' => (string)($e['permanent_address'] ?? ''),
                'department' => (string)($e['department'] ?? ''),
                'designation' => (string)($e['designation'] ?? ''),
                'employee_type' => (string)($e['employee_type'] ?? ''),
                'date_of_joining' => $e['date_of_joining'],
                'supervisor_name' => (string)($e['supervisor_name'] ?? ''),
                'work_location' => (string)($e['work_location'] ?? ''),
                'status' => (string)$e['status'],
                'created_at' => (string)$e['created_at'],
            ];
        }
        $list = $this->all();
        foreach ($list as &$e) {
            if ($e['id'] === $id) {
                $e['name'] = $name;
                $e['code'] = $code;
                $e['gender'] = $gender;
                $e['date_of_birth'] = $dateOfBirth;
                $e['personal_phone'] = $personalPhone;
                $e['email'] = $email;
                $e['present_address'] = $presentAddress;
                $e['permanent_address'] = $permanentAddress;
                $e['department'] = $department;
                $e['designation'] = $designation;
                $e['employee_type'] = $employeeType;
                $e['date_of_joining'] = $dateOfJoining;
                $e['supervisor_name'] = $supervisorName;
                $e['work_location'] = $workLocation;
                $e['status'] = $status;
                file_put_contents($this->file, json_encode($list, JSON_PRETTY_PRINT));
                return $e;
            }
        }
        throw new \Exception('Not found');
    }

    public function listAttachments(string $employeeId): array
    {
        $pdo = Database::get();
        if (!$pdo) return [];
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) throw new \Exception('Tenant context missing');
        $this->ensureEmployeeAttachmentsTable($pdo);

        $stmt = $pdo->prepare('SELECT id, category, title, original_name, mime, size_bytes, created_at FROM employee_attachments WHERE tenant_id=? AND employee_id=? ORDER BY id DESC');
        $stmt->execute([(int)$tenantId, (int)$employeeId]);
        return array_map(fn($r) => [
            'id' => (string)$r['id'],
            'category' => (string)$r['category'],
            'title' => (string)($r['title'] ?? ''),
            'original_name' => (string)$r['original_name'],
            'mime' => (string)$r['mime'],
            'size_bytes' => (int)$r['size_bytes'],
            'created_at' => (string)$r['created_at'],
        ], $stmt->fetchAll());
    }

    public function getAttachmentForDownload(string $attachmentId): array
    {
        $pdo = Database::get();
        if (!$pdo) throw new \Exception('Database error');
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) throw new \Exception('Tenant context missing');
        $this->ensureEmployeeAttachmentsTable($pdo);

        $stmt = $pdo->prepare('SELECT id, employee_id, original_name, stored_path, mime, size_bytes FROM employee_attachments WHERE tenant_id=? AND id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, (int)$attachmentId]);
        $row = $stmt->fetch();
        if (!$row) throw new \Exception('Not found');
        return $row;
    }

    public function addAttachment(string $employeeId, string $category, string $title, array $file): array
    {
        $pdo = Database::get();
        if (!$pdo) throw new \Exception('Database error');
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) throw new \Exception('Tenant context missing');
        $this->ensureEmployeeAttachmentsTable($pdo);

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetch()) throw new \Exception('Not found');

        $originalName = (string)($file['name'] ?? '');
        $tmpName = (string)($file['tmp_name'] ?? '');
        $mime = (string)($file['type'] ?? 'application/octet-stream');
        $sizeBytes = (int)($file['size'] ?? 0);
        $err = (int)($file['error'] ?? 0);

        if ($err !== UPLOAD_ERR_OK) throw new \Exception('Upload failed');
        if ($tmpName === '' || !is_uploaded_file($tmpName)) throw new \Exception('Upload failed');
        if ($originalName === '') throw new \Exception('File name missing');
        if ($sizeBytes <= 0) throw new \Exception('File empty');

        $safeOriginal = preg_replace('/[^a-zA-Z0-9._-]/', '_', $originalName) ?: 'file';
        $token = bin2hex(random_bytes(16));
        $storedFileName = $token . '_' . $safeOriginal;
        $relativeDir = 'uploads/tenant_' . $tenantId . '/employees/' . (int)$employeeId . '/attachments';
        $baseDir = __DIR__ . '/../../data/' . $relativeDir;
        if (!is_dir($baseDir)) mkdir($baseDir, 0775, true);
        $dest = $baseDir . '/' . $storedFileName;
        if (!move_uploaded_file($tmpName, $dest)) throw new \Exception('Failed to store file');

        $storedPath = $relativeDir . '/' . $storedFileName;
        $ins = $pdo->prepare('INSERT INTO employee_attachments(tenant_id, employee_id, category, title, original_name, stored_path, mime, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $ins->execute([(int)$tenantId, (int)$employeeId, $category, $title !== '' ? $title : null, $originalName, $storedPath, $mime, $sizeBytes]);

        return [
            'id' => (string)$pdo->lastInsertId(),
            'category' => $category,
            'title' => $title,
            'original_name' => $originalName,
            'mime' => $mime,
            'size_bytes' => $sizeBytes,
        ];
    }

    public function deleteAttachment(string $attachmentId): bool
    {
        $pdo = Database::get();
        if (!$pdo) throw new \Exception('Database error');
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) throw new \Exception('Tenant context missing');
        $this->ensureEmployeeAttachmentsTable($pdo);

        $stmt = $pdo->prepare('SELECT id, stored_path FROM employee_attachments WHERE tenant_id=? AND id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, (int)$attachmentId]);
        $row = $stmt->fetch();
        if (!$row) throw new \Exception('Not found');

        $del = $pdo->prepare('DELETE FROM employee_attachments WHERE tenant_id=? AND id=?');
        $del->execute([(int)$tenantId, (int)$attachmentId]);

        $path = __DIR__ . '/../../data/' . (string)$row['stored_path'];
        if (is_file($path)) @unlink($path);

        return true;
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
