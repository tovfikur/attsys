<?php

namespace App\Controller;

use App\Core\Database;

class AuditController
{
    public function list()
    {
        \App\Core\Auth::requireRole('superadmin');
        header('Content-Type: application/json');
        $pdo = Database::get();
        if (!$pdo) { echo json_encode(['audit'=>[]]); return; }
        $stmt = $pdo->query('SELECT id, time, action, user_id, user_role, user_name, meta FROM audit_logs ORDER BY id DESC LIMIT 50');
        $rows = $stmt->fetchAll();
        echo json_encode(['audit' => $rows]);
    }

    public function listTenant()
    {
        \App\Core\Auth::requireRole('perm:payroll.read');
        header('Content-Type: application/json');
        $pdo = Database::get();
        if (!$pdo) { echo json_encode(['audit'=>[]]); return; }

        $user = \App\Core\Auth::currentUser();
        $tenantId = (int)($user['tenant_id'] ?? 0);
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant not resolved']);
            return;
        }

        $limit = (int)($_GET['limit'] ?? 200);
        if ($limit <= 0) $limit = 200;
        if ($limit > 500) $limit = 500;

        $stmt = $pdo->query('SELECT id, time, action, user_id, user_role, user_name, meta FROM audit_logs ORDER BY id DESC LIMIT 500');
        $rows = $stmt->fetchAll();

        $out = [];
        foreach ($rows as $r) {
            $metaRaw = (string)($r['meta'] ?? '');
            $meta = json_decode($metaRaw, true);
            $metaTenantId = is_array($meta) ? (int)($meta['tenant_id'] ?? 0) : 0;
            if ($metaTenantId !== $tenantId) continue;
            $out[] = $r;
            if (count($out) >= $limit) break;
        }

        echo json_encode(['audit' => $out]);
    }
}
