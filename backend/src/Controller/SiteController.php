<?php

namespace App\Controller;

use App\Core\Database;
use App\Core\Auth;

class SiteController
{
    public function list()
    {
        Auth::requireRole('perm:sites.manage');
        header('Content-Type: application/json');
        $pdo = Database::get();
        $tenantId = null;
        $user = Auth::currentUser();
        $tenantId = $user['tenant_id'] ?? null;
        if (!$tenantId) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
        }
        if (!$tenantId) { echo json_encode(['sites'=>[]]); return; }
        $stmt = $pdo->prepare('SELECT id, name, code, created_at FROM sites WHERE tenant_id=? ORDER BY id DESC');
        $stmt->execute([$tenantId]);
        echo json_encode(['sites'=>$stmt->fetchAll()]);
    }

    public function create()
    {
        Auth::requireRole('perm:sites.manage');
        header('Content-Type: application/json');
        $pdo = Database::get();
        $user = Auth::currentUser();
        $tenantId = $user['tenant_id'] ?? null;
        if (!$tenantId) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
        }
        $in = json_decode(file_get_contents('php://input'), true);
        $name = trim($in['name'] ?? '');
        $code = trim($in['code'] ?? '');
        if (!$tenantId || !$name) { http_response_code(400); echo json_encode(['error'=>'tenant or name missing']); return; }
        $ins = $pdo->prepare('INSERT INTO sites(tenant_id, name, code) VALUES (?, ?, ?)');
        $ins->execute([$tenantId, $name, $code ?: null]);
        echo json_encode(['id'=>$pdo->lastInsertId(), 'name'=>$name, 'code'=>$code]);
    }
}

