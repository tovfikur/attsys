<?php

namespace App\Controller;

use App\Core\TenantResolver;

class AuthController
{
    public function login()
    {
        header('Content-Type: application/json');
        
        $input = json_decode(file_get_contents('php://input'), true);
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB not available']);
            return;
        }
        if ($pdo && $email) {
            $ip = $_SERVER['REMOTE_ADDR'] ?? null;
            $chk = $pdo->prepare('SELECT fail_count, banned_until, first_failed_at, last_failed_at FROM login_attempts WHERE tenant_id IS NULL AND email=?');
            $chk->execute([$email]);
            $row = $chk->fetch();
            if ($row && $row['banned_until'] && strtotime($row['banned_until']) > time()) { http_response_code(429); echo json_encode(['error'=>'Too many attempts']); return; }
        }

        // Super Admin Login (Database)
        $stmt = $pdo->prepare('SELECT id, name, email, password_hash FROM super_admins WHERE email=?');
        $stmt->execute([$email]);
        $sa = $stmt->fetch();
        
        if ($sa && password_verify($password, $sa['password_hash'])) {
            $token = \App\Core\Token::create([
                'user_id' => (int)$sa['id'],
                'tenant_id' => null,
                'role' => 'superadmin',
                'user_name' => $sa['name'],
                'user_email' => $sa['email'],
            ]);
            echo json_encode([
                'token' => $token,
                'user' => [
                    'id' => (int)$sa['id'],
                    'name' => $sa['name'],
                    'email' => $sa['email'],
                    'role' => 'superadmin'
                ]
            ]);
            if ($pdo && $email) { $pdo->prepare('DELETE FROM login_attempts WHERE tenant_id IS NULL AND email=?')->execute([$email]); }
            return;
        }

        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
        if ($pdo && $email) {
            $ip = $_SERVER['REMOTE_ADDR'] ?? null;
            $pdo->prepare('INSERT INTO login_attempts(tenant_id,email,ip,fail_count,first_failed_at,last_failed_at) VALUES (NULL, ?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE fail_count=fail_count+1, last_failed_at=NOW()')->execute([$email, $ip]);
            $get = $pdo->prepare('SELECT fail_count, first_failed_at FROM login_attempts WHERE tenant_id IS NULL AND email=?');
            $get->execute([$email]);
            $cur = $get->fetch();
            if ($cur && (int)$cur['fail_count'] >= 5) { $pdo->prepare('UPDATE login_attempts SET banned_until=DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE tenant_id IS NULL AND email=?')->execute([$email]); }
        }
    }

    public function logout()
    {
        // Stateless JWT logout is handled on frontend usually, 
        // but we can blacklist token here if needed.
        echo json_encode(['message' => 'Logged out']);
    }

    public function tenantLogin()
    {
        header('Content-Type: application/json');
        $input = json_decode(file_get_contents('php://input'), true);
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';
        $portalMode = $input['portal_mode'] ?? null;
        // Resolve tenant by hint header or host
        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        if ($hint) {
            $sub = strtolower($hint);
        } else {
            $host = $_SERVER['HTTP_HOST'] ?? '';
            $sub = explode('.', $host)[0] ?? '';
        }
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            if (strtolower($sub) === 'demo' && strtolower($email) === 'owner@tenant.com' && $password === 'secret') {
                echo json_encode([
                    'token' => 'mock-tenant-token-abc',
                    'user' => [
                        'id' => 2,
                        'name' => 'Tenant Owner',
                        'email' => 'owner@tenant.com',
                        'role' => 'tenant_owner',
                        'tenant' => ['id' => 1, 'name' => 'Demo Tenant', 'subdomain' => 'demo']
                    ]
                ]);
                return;
            }
            http_response_code(500);
            echo json_encode(['error' => 'DB not available']);
            return;
        }
        if ($email) {
            $ip = $_SERVER['REMOTE_ADDR'] ?? null;
            $chk = $pdo->prepare('SELECT fail_count, banned_until FROM login_attempts WHERE tenant_id=(SELECT id FROM tenants WHERE subdomain=?) AND email=?');
            $chk->execute([$sub, $email]);
            $row = $chk->fetch();
            if ($row && $row['banned_until'] && strtotime($row['banned_until']) > time()) { http_response_code(429); echo json_encode(['error'=>'Too many attempts']); return; }
        }
        $tStmt = $pdo->prepare('SELECT id, name, status FROM tenants WHERE subdomain=?');
        $tStmt->execute([$sub]);
        $tenant = $tStmt->fetch();
        if (!$tenant) {
            if (strtolower($sub) === 'demo' && strtolower($email) === 'owner@tenant.com' && $password === 'secret') {
                $ins = $pdo->prepare('INSERT INTO tenants(subdomain, name, status) VALUES (?, ?, ?)');
                $ins->execute(['demo', 'Demo Tenant', 'active']);
                $tStmt = $pdo->prepare('SELECT id, name, status FROM tenants WHERE subdomain=?');
                $tStmt->execute(['demo']);
                $tenant = $tStmt->fetch();
            }
        }
        if (!$tenant) { http_response_code(404); echo json_encode(['error'=>'Tenant not found']); return; }
        $tenantStatus = strtolower(trim((string)($tenant['status'] ?? 'active')));
        if ($tenantStatus !== 'active') {
            http_response_code(403);
            echo json_encode([
                'error' => 'This tenant is inactive. Please contact Kenroo to login to this tenant.',
                'code' => 'TENANT_INACTIVE',
            ]);
            return;
        }
        try {
            $uStmt = $pdo->prepare('SELECT id, name, email, role, employee_id, password_hash FROM tenant_users WHERE tenant_id=? AND email=? AND status="active"');
            $uStmt->execute([$tenant['id'], $email]);
            $user = $uStmt->fetch();
        } catch (\Exception $e) {
            $uStmt = $pdo->prepare('SELECT id, name, email, role, password_hash FROM tenant_users WHERE tenant_id=? AND email=? AND status="active"');
            $uStmt->execute([$tenant['id'], $email]);
            $user = $uStmt->fetch();
            if (is_array($user)) $user['employee_id'] = null;
        }
        if (!$user) {
            if (strtolower($sub) === 'demo' && strtolower($email) === 'owner@tenant.com' && $password === 'secret') {
                $createUser = $pdo->prepare('INSERT INTO tenant_users(tenant_id, email, name, role, password_hash, status) VALUES (?, ?, ?, ?, ?, ?)');
                $createUser->execute([(int)$tenant['id'], 'owner@tenant.com', 'Tenant Owner', 'tenant_owner', null, 'active']);
                try {
                    $uStmt = $pdo->prepare('SELECT id, name, email, role, employee_id, password_hash FROM tenant_users WHERE tenant_id=? AND email=? AND status="active"');
                    $uStmt->execute([$tenant['id'], $email]);
                    $user = $uStmt->fetch();
                } catch (\Exception $e) {
                    $uStmt = $pdo->prepare('SELECT id, name, email, role, password_hash FROM tenant_users WHERE tenant_id=? AND email=? AND status="active"');
                    $uStmt->execute([$tenant['id'], $email]);
                    $user = $uStmt->fetch();
                    if (is_array($user)) $user['employee_id'] = null;
                }
            }
        }
        if ($user && ($user['password_hash'] ? password_verify($password, $user['password_hash']) : $password === 'secret')) {
            if ($portalMode !== null) {
                $portalMode = strtolower(trim((string)$portalMode));
                if (!in_array($portalMode, ['employee', 'admin'], true)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid portal mode']);
                    return;
                }
                $role = strtolower(trim((string)($user['role'] ?? '')));
                if ($portalMode === 'employee' && $role !== 'employee') {
                    http_response_code(403);
                    echo json_encode(['error' => 'Use Admin / HR login for this account']);
                    return;
                }
                if ($portalMode === 'admin' && $role === 'employee') {
                    http_response_code(403);
                    echo json_encode(['error' => 'Use Employee login for this account']);
                    return;
                }
            }
            $token = \App\Core\Token::create([
                'user_id' => (int)$user['id'],
                'tenant_id' => (int)$tenant['id'],
                'employee_id' => $user['employee_id'] ?? null,
                'role' => $user['role'],
                'user_name' => $user['name'],
                'user_email' => $user['email'],
                'expires_at' => null,
            ]) ?? 'mock-tenant-token-abc';
            echo json_encode([
                'token' => $token,
                'user' => [
                    'id' => (int)$user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'role' => $user['role'],
                    'employee_id' => $user['employee_id'] ?? null,
                    'tenant' => ['id'=>$tenant['id'], 'name'=>$tenant['name'], 'subdomain'=>$sub]
                ]
            ]);
            $pdo->prepare('DELETE FROM login_attempts WHERE tenant_id=? AND email=?')->execute([(int)$tenant['id'], $email]);
            return;
        }
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
        if ($email) {
            $ip = $_SERVER['REMOTE_ADDR'] ?? null;
            $pdo->prepare('INSERT INTO login_attempts(tenant_id,email,ip,fail_count,first_failed_at,last_failed_at) VALUES (?, ?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE fail_count=fail_count+1, last_failed_at=NOW()')->execute([(int)$tenant['id'], $email, $ip]);
            $get = $pdo->prepare('SELECT fail_count FROM login_attempts WHERE tenant_id=? AND email=?');
            $get->execute([(int)$tenant['id'], $email]);
            $cur = $get->fetch();
            if ($cur && (int)$cur['fail_count'] >= 5) { $pdo->prepare('UPDATE login_attempts SET banned_until=DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE tenant_id=? AND email=?')->execute([(int)$tenant['id'], $email]); }
        }
    }
}
