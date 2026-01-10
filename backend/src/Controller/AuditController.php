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
}

