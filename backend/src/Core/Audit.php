<?php

namespace App\Core;

class Audit
{
    public static function log(string $action, array $meta = [], ?array $user = null): void
    {
        $pdo = Database::get();
        if ($pdo) {
            $stmt = $pdo->prepare('INSERT INTO audit_logs(action, user_id, user_role, user_name, meta) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([
                $action,
                $user['id'] ?? null,
                $user['role'] ?? null,
                $user['name'] ?? null,
                json_encode($meta)
            ]);
            return;
        }
        $file = __DIR__ . '/../../data/audit.log';
        $entry = [
            'time' => date('c'),
            'action' => $action,
            'user' => $user ? ['id' => $user['id'] ?? null, 'role' => $user['role'] ?? null, 'name' => $user['name'] ?? null] : null,
            'meta' => $meta
        ];
        file_put_contents($file, json_encode($entry) . PHP_EOL, FILE_APPEND);
    }
}
