<?php

namespace App\Controller;

use App\Core\Database;
use App\Core\Audit;

class TenantUserController
{
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
}
