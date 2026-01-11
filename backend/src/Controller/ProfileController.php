<?php

namespace App\Controller;

use App\Core\Auth;
use App\Core\Database;

class ProfileController
{
    public function me()
    {
        header('Content-Type: application/json');
        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $employee = null;
        $pdo = Database::get();
        if ($pdo) {
            $tenantId = $user['tenant_id'] ?? null;
            $employeeId = (int)($user['employee_id'] ?? 0);
            if ($tenantId && $employeeId > 0) {
                $stmt = $pdo->prepare('SELECT e.id, e.tenant_id, e.shift_id, s.name AS shift_name, s.working_days, e.name, e.code, e.status, e.created_at FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? AND e.id=? LIMIT 1');
                $stmt->execute([(int)$tenantId, $employeeId]);
                $row = $stmt->fetch();
                if ($row) {
                    $employee = [
                        'id' => (string)$row['id'],
                        'tenant_id' => (string)$row['tenant_id'],
                        'shift_id' => (string)($row['shift_id'] ?? ''),
                        'shift_name' => (string)($row['shift_name'] ?? ''),
                        'working_days' => (string)($row['working_days'] ?? ''),
                        'name' => $row['name'],
                        'code' => $row['code'],
                        'status' => $row['status'],
                        'created_at' => $row['created_at'],
                    ];
                }
            }
        }

        echo json_encode(['user' => $user, 'employee' => $employee]);
    }

    public function changePassword()
    {
        header('Content-Type: application/json');
        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $currentPassword = $input['current_password'] ?? '';
        $newPassword = $input['new_password'] ?? '';

        if (strlen($newPassword) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'New password must be at least 6 characters']);
            return;
        }

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error']);
            return;
        }

        $debug = []; // Debug info

        // Check based on role
        if ($user['role'] === 'superadmin') {
            $stmt = $pdo->prepare('SELECT id, password_hash FROM super_admins WHERE id=?');
            $stmt->execute([$user['id']]);
            $record = $stmt->fetch();
            
            if (!$record) {
                http_response_code(400);
                echo json_encode(['error' => 'User record not found']);
                return;
            }

            if (!password_verify($currentPassword, $record['password_hash'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Current password is incorrect']);
                return;
            }

            $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
            $upd = $pdo->prepare('UPDATE super_admins SET password_hash=? WHERE id=?');
            $upd->execute([$newHash, $user['id']]);
            $debug['rows_affected'] = $upd->rowCount();
        } else {
            // Tenant User
            $stmt = $pdo->prepare('SELECT id, password_hash FROM tenant_users WHERE id=? AND tenant_id=?');
            $stmt->execute([$user['id'], $user['tenant_id']]);
            $record = $stmt->fetch();

            if (!$record) {
                http_response_code(400);
                echo json_encode(['error' => 'User record not found']);
                return;
            }

            // Handle legacy/null password (default 'secret')
            $verified = false;
            if ($record['password_hash']) {
                $verified = password_verify($currentPassword, $record['password_hash']);
            } else {
                $verified = ($currentPassword === 'secret');
            }

            if (!$verified) {
                http_response_code(400);
                echo json_encode(['error' => 'Current password is incorrect']);
                return;
            }

            $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
            $upd = $pdo->prepare('UPDATE tenant_users SET password_hash=? WHERE id=?');
            $upd->execute([$newHash, $user['id']]);
            $debug['rows_affected'] = $upd->rowCount();
        }

        echo json_encode(['message' => 'Password updated successfully', 'debug' => $debug]);
    }
}
