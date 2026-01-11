<?php

namespace App\Controller;

use App\Core\Database;
use App\Core\Audit;
use App\Core\Auth;

class TenantUserController
{
    private function resolveTenantId(array $user, ?\PDO $pdo): ?int
    {
        $tenantId = $user['tenant_id'] ?? null;
        if ($tenantId) return (int)$tenantId;

        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        if (!$hint || !$pdo) return null;
        $tStmt = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
        $tStmt->execute([strtolower((string)$hint)]);
        $row = $tStmt->fetch();
        return $row ? (int)$row['id'] : null;
    }

    public function resetPassword()
    {
        \App\Core\Auth::requireRole('superadmin');
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        $sub = $in['subdomain'] ?? '';
        $email = strtolower($in['email'] ?? '');
        $new = $in['new_password'] ?? '';
        if (!$sub || !$email || !$new) { http_response_code(400); echo json_encode(['error'=>'Missing fields']); return; }
        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error'=>'DB not available']); return; }
        $tStmt = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
        $tStmt->execute([$sub]);
        $tenant = $tStmt->fetch();
        if (!$tenant) { http_response_code(404); echo json_encode(['error'=>'Tenant not found']); return; }
        $hash = password_hash($new, PASSWORD_DEFAULT);
        $uStmt = $pdo->prepare('UPDATE tenant_users SET password_hash=? WHERE tenant_id=? AND email=?');
        $uStmt->execute([$hash, $tenant['id'], $email]);
        if ($uStmt->rowCount() === 0) {
            $ins = $pdo->prepare('INSERT INTO tenant_users (tenant_id, email, name, role, password_hash, status) VALUES (?, ?, ?, ?, ?, ?)');
            $ins->execute([$tenant['id'], $email, 'Tenant Owner', 'tenant_owner', $hash, 'active']);
        }
        Audit::log('tenant_user.reset_password', ['subdomain'=>$sub, 'email'=>$email]);
        echo json_encode(['ok'=>true]);
    }

    public function getEmployeeLogin()
    {
        Auth::requireRole('perm:employees.read');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $employeeId = (int)($_GET['employee_id'] ?? 0);
        if ($employeeId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id required']);
            return;
        }

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB not available']);
            return;
        }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $eStmt = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $eStmt->execute([(int)$tenantId, $employeeId]);
        if (!$eStmt->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $uStmt = $pdo->prepare('SELECT id, email, status FROM tenant_users WHERE tenant_id=? AND employee_id=? LIMIT 1');
        $uStmt->execute([(int)$tenantId, $employeeId]);
        $row = $uStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            echo json_encode(['exists' => false]);
            return;
        }

        echo json_encode([
            'exists' => true,
            'id' => (int)($row['id'] ?? 0),
            'email' => (string)($row['email'] ?? ''),
            'status' => (string)($row['status'] ?? ''),
        ]);
    }

    public function setEmployeePassword()
    {
        Auth::requireRole('perm:employees.write');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB not available']);
            return;
        }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $employeeId = (int)($in['employee_id'] ?? 0);
        $emailRaw = isset($in['email']) ? (string)$in['email'] : '';
        $new = (string)($in['new_password'] ?? '');

        if ($employeeId <= 0 || $new === '') {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id and new_password required']);
            return;
        }
        if (strlen($new) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'Password must be at least 6 characters']);
            return;
        }

        $eStmt = $pdo->prepare('SELECT name FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $eStmt->execute([(int)$tenantId, $employeeId]);
        $emp = $eStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$emp) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $existingStmt = $pdo->prepare('SELECT id, email FROM tenant_users WHERE tenant_id=? AND employee_id=? LIMIT 1');
        $existingStmt->execute([(int)$tenantId, $employeeId]);
        $existing = $existingStmt->fetch(\PDO::FETCH_ASSOC);

        $email = strtolower(trim($emailRaw));
        if ($email === '') {
            if (!$existing) {
                http_response_code(400);
                echo json_encode(['error' => 'email required for first-time login creation']);
                return;
            }
            $email = strtolower((string)($existing['email'] ?? ''));
        }
        if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid email']);
            return;
        }

        $hash = password_hash($new, PASSWORD_DEFAULT);
        $name = (string)($emp['name'] ?? 'Employee');

        if ($existing) {
            $userId = (int)($existing['id'] ?? 0);
            if ($userId <= 0) {
                http_response_code(500);
                echo json_encode(['error' => 'Invalid tenant user record']);
                return;
            }
            $conflictStmt = $pdo->prepare('SELECT id FROM tenant_users WHERE tenant_id=? AND email=? AND id<>? LIMIT 1');
            $conflictStmt->execute([(int)$tenantId, $email, $userId]);
            if ($conflictStmt->fetchColumn()) {
                http_response_code(409);
                echo json_encode(['error' => 'Email already used in this tenant']);
                return;
            }

            $upd = $pdo->prepare('UPDATE tenant_users SET email=?, name=?, role="employee", employee_id=?, password_hash=?, status="active" WHERE id=? AND tenant_id=?');
            $upd->execute([$email, $name, $employeeId, $hash, $userId, (int)$tenantId]);
            Audit::log('tenant_user.employee_password_set', ['tenant_id' => (int)$tenantId, 'employee_id' => $employeeId, 'tenant_user_id' => $userId, 'email' => $email]);
            echo json_encode(['ok' => true, 'id' => $userId, 'email' => $email]);
            return;
        }

        $conflictStmt = $pdo->prepare('SELECT id FROM tenant_users WHERE tenant_id=? AND email=? LIMIT 1');
        $conflictStmt->execute([(int)$tenantId, $email]);
        if ($conflictStmt->fetchColumn()) {
            http_response_code(409);
            echo json_encode(['error' => 'Email already used in this tenant']);
            return;
        }

        $ins = $pdo->prepare('INSERT INTO tenant_users (tenant_id, email, name, role, employee_id, password_hash, status) VALUES (?, ?, ?, "employee", ?, ?, "active")');
        $ins->execute([(int)$tenantId, $email, $name, $employeeId, $hash]);
        $newId = (int)$pdo->lastInsertId();
        Audit::log('tenant_user.employee_created', ['tenant_id' => (int)$tenantId, 'employee_id' => $employeeId, 'tenant_user_id' => $newId, 'email' => $email]);
        echo json_encode(['ok' => true, 'id' => $newId, 'email' => $email]);
    }
}
