<?php

namespace App\Core;

class Auth
{
    public static function currentUser(): ?array
    {
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.*)/', $auth, $m)) {
            $token = trim($m[1]);
            $user = Token::get($token);
            if ($user) return $user;
            // Dev fallback
            if ($token === 'mock-jwt-token-xyz-123') {
                return ['id' => 1, 'name' => 'Super Admin', 'role' => 'superadmin'];
            }
            if ($token === 'mock-tenant-token-abc') {
                $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
                $tenant_subdomain = $hint ? strtolower($hint) : null;
                $tenant_id = null;
                if ($hint) {
                    $pdo = Database::get();
                    if ($pdo) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenant_id=(int)$row['id']; } }
                }
                return ['id' => 2, 'name' => 'Tenant Owner', 'email' => 'owner@tenant.com', 'role' => 'tenant_owner', 'tenant_id' => $tenant_id, 'tenant_subdomain' => $tenant_subdomain];
            }
        }
        return null;
    }

    public static function requireRole(string $role): void
    {
        $user = self::currentUser();
        if (!$user) {
            header('Content-Type: application/json');
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
        if ($role === 'any') return;
        // Permission check prefix: perm:<name>
        if (str_starts_with($role, 'perm:')) {
            $perm = substr($role, 5);
            if (self::hasPermission($user, $perm)) return;
            
            error_log("Auth: Forbidden access. User ID: {$user['id']}, Role: {$user['role']}, Required Perm: $perm");
            
            header('Content-Type: application/json');
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            exit;
        }
        if ($role === 'superadmin' && $user['role'] !== 'superadmin') {
            header('Content-Type: application/json');
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            exit;
        }
        if ($role === 'tenant' && !in_array($user['role'], ['tenant_owner','hr_admin','payroll_admin','manager','employee'])) {
            header('Content-Type: application/json');
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            exit;
        }
    }

    public static function hasPermission(array $user, string $perm): bool
    {
        if ($user['role'] === 'superadmin') return true;

        $builtin = [
            'tenant_owner' => ['*'],
            'hr_admin' => [
                'employees.read',
                'employees.write',
                'attendance.read',
                'attendance.write',
                'attendance.clock',
                'devices.manage',
                'sites.manage',
                'geo.manage',
                'geo.read',
                'leaves.read',
                'leaves.apply',
                'leaves.approve',
                'leaves.manage',
                'roster.read',
                'roster.assign',
                'roster.manage',
                'payroll.read',
                'payroll.run',
                'payroll.approve',
                'payroll.lock',
                'payroll.pay',
                'payroll.settings',
                'payroll.manage',
            ],
            'manager' => [
                'employees.read',
                'attendance.read',
                'leaves.read',
                'leaves.approve',
                'roster.read',
                'roster.assign',
                'roster.manage',
                'payroll.read',
                'geo.read',
            ],
            'employee' => [
                'attendance.clock',
                'attendance.read',
                'leaves.read',
                'leaves.apply',
                'roster.read',
                'geo.track',
            ],
            'payroll_admin' => [
                'payroll.read',
                'payroll.run',
                'payroll.approve',
                'payroll.lock',
                'payroll.pay',
                'payroll.settings',
                'employees.read',
                'attendance.read'
            ],
        ];

        $roleName = (string)($user['role'] ?? '');
        if (isset($builtin[$roleName])) {
            $allowed = $builtin[$roleName];
            if (in_array('*', $allowed, true)) return true;
            if (in_array($perm, $allowed, true)) return true;
        }

        $pdo = Database::get();
        if (!$pdo) return false;
        $stmt = $pdo->prepare('SELECT permissions FROM roles WHERE name=? LIMIT 1');
        $stmt->execute([$roleName]);
        $row = $stmt->fetch();
        if (!$row) {
            return isset($builtin[$roleName]) && (in_array('*', $builtin[$roleName], true) || in_array($perm, $builtin[$roleName], true));
        }
        $perms = json_decode($row['permissions'] ?? '[]', true) ?? [];
        return in_array($perm, $perms, true);
    }
}
