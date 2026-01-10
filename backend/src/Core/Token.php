<?php

namespace App\Core;

class Token
{
    public static function generate(int $length = 48): string
    {
        return bin2hex(random_bytes((int)ceil($length/2)));
    }

    public static function create(array $payload): ?string
    {
        $pdo = Database::get();
        if (!$pdo) return null;
        $token = self::generate();
        $stmt = $pdo->prepare('INSERT INTO auth_tokens(token, user_id, tenant_id, role, user_name, user_email, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $success = $stmt->execute([
            $token,
            $payload['user_id'] ?? null,
            $payload['tenant_id'] ?? null,
            $payload['role'] ?? 'unknown',
            $payload['user_name'] ?? null,
            $payload['user_email'] ?? null,
            $payload['expires_at'] ?? null,
        ]);
        
        if (!$success) {
            // Log error for debugging
            error_log('Token creation failed: ' . json_encode($stmt->errorInfo()));
            return null;
        }

        return $token;
    }

    public static function get(string $token): ?array
    {
        $pdo = Database::get();
        if (!$pdo) return null;
        $stmt = $pdo->prepare('SELECT token, user_id, tenant_id, role, user_name, user_email, expires_at FROM auth_tokens WHERE token=? LIMIT 1');
        $stmt->execute([$token]);
        $row = $stmt->fetch();
        if (!$row) return null;
        if ($row['expires_at'] && strtotime($row['expires_at']) < time()) return null;
        return [
            'id' => $row['user_id'],
            'name' => $row['user_name'],
            'email' => $row['user_email'],
            'role' => $row['role'],
            'tenant_id' => $row['tenant_id'],
        ];
    }
}

