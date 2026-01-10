<?php

namespace App\Controller;

use App\Core\Database;

class PasswordResetController
{
    public function requestReset()
    {
        header('Content-Type: application/json');
        $data = json_decode(file_get_contents('php://input'), true);
        $email = $data['email'] ?? '';

        if (empty($email)) {
            http_response_code(400);
            echo json_encode(['error' => 'Email is required']);
            return;
        }

        $db = Database::get();

        // Check Super Admin
        $stmt = $db->prepare("SELECT id FROM super_admins WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        $table = 'super_admins';

        if (!$user) {
            // Check Tenant User
            $stmt = $db->prepare("SELECT id FROM tenant_users WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            $table = 'tenant_users';
        }

        if ($user) {
            // Generate Token
            $token = bin2hex(random_bytes(32));
            
            // Delete old resets
            $stmt = $db->prepare("DELETE FROM password_resets WHERE email = ?");
            $stmt->execute([$email]);

            // Insert new reset
            $stmt = $db->prepare("INSERT INTO password_resets (email, token) VALUES (?, ?)");
            $stmt->execute([$email, $token]);

            // In a real app, send email here.
            // For this demo/dev environment, we return the token.
            echo json_encode([
                'message' => 'Password reset link has been sent to your email.',
                'dev_token' => $token, // For development testing only
                'dev_link' => "/reset-password?token=$token"
            ]);
        } else {
            // Generic message for security
            echo json_encode(['message' => 'If that email exists, a reset link has been sent.']);
        }
    }

    public function resetPassword()
    {
        header('Content-Type: application/json');
        $data = json_decode(file_get_contents('php://input'), true);
        $token = $data['token'] ?? '';
        $newPassword = $data['password'] ?? '';

        if (empty($token) || empty($newPassword)) {
            http_response_code(400);
            echo json_encode(['error' => 'Token and password are required']);
            return;
        }

        $db = Database::get();

        // Validate Token
        $stmt = $db->prepare("SELECT email, created_at FROM password_resets WHERE token = ?");
        $stmt->execute([$token]);
        $reset = $stmt->fetch();

        if (!$reset) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid or expired token']);
            return;
        }

        // Check expiry (1 hour)
        if (strtotime($reset['created_at']) < strtotime('-1 hour')) {
            http_response_code(400);
            echo json_encode(['error' => 'Token expired']);
            return;
        }

        $email = $reset['email'];
        $hash = password_hash($newPassword, PASSWORD_DEFAULT);

        // Find user type and update
        $stmt = $db->prepare("SELECT id FROM super_admins WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            $stmt = $db->prepare("UPDATE super_admins SET password_hash = ? WHERE email = ?");
            $stmt->execute([$hash, $email]);
        } else {
            $stmt = $db->prepare("UPDATE tenant_users SET password_hash = ? WHERE email = ?");
            $stmt->execute([$hash, $email]);
        }

        // Delete token
        $stmt = $db->prepare("DELETE FROM password_resets WHERE email = ?");
        $stmt->execute([$email]);

        echo json_encode(['message' => 'Password has been reset successfully.']);
    }
}
