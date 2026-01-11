<?php

namespace App\Controller;

use App\Core\Auth;
use App\Core\Database;
use App\Core\EmployeesStore;

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
            EmployeesStore::ensureEmployeeProfileColumns($pdo);
            $tenantId = $user['tenant_id'] ?? null;
            $employeeId = (int)($user['employee_id'] ?? 0);
            if ($tenantId && $employeeId > 0) {
                $stmt = $pdo->prepare('SELECT e.id, e.tenant_id, e.shift_id, s.name AS shift_name, s.working_days, e.name, e.code, e.profile_photo_path, e.gender, e.date_of_birth, e.personal_phone, e.email, e.present_address, e.permanent_address, e.department, e.designation, e.employee_type, e.date_of_joining, e.supervisor_name, e.work_location, e.status, e.created_at FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? AND e.id=? LIMIT 1');
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
                        'profile_photo_path' => (string)($row['profile_photo_path'] ?? ''),
                        'gender' => (string)($row['gender'] ?? ''),
                        'date_of_birth' => $row['date_of_birth'],
                        'personal_phone' => (string)($row['personal_phone'] ?? ''),
                        'email' => (string)($row['email'] ?? ''),
                        'present_address' => (string)($row['present_address'] ?? ''),
                        'permanent_address' => (string)($row['permanent_address'] ?? ''),
                        'department' => (string)($row['department'] ?? ''),
                        'designation' => (string)($row['designation'] ?? ''),
                        'employee_type' => (string)($row['employee_type'] ?? ''),
                        'date_of_joining' => $row['date_of_joining'],
                        'supervisor_name' => (string)($row['supervisor_name'] ?? ''),
                        'work_location' => (string)($row['work_location'] ?? ''),
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

    public function uploadProfilePhoto()
    {
        header('Content-Type: application/json');
        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error']);
            return;
        }

        EmployeesStore::ensureEmployeeProfileColumns($pdo);
        $tenantId = (int)($user['tenant_id'] ?? 0);
        $employeeId = (int)($user['employee_id'] ?? 0);
        if ($tenantId <= 0 || $employeeId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Employee profile missing']);
            return;
        }

        $file = $_FILES['file'] ?? null;
        if (!is_array($file)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing file']);
            return;
        }

        $err = (int)($file['error'] ?? 0);
        $tmpName = (string)($file['tmp_name'] ?? '');
        $originalName = (string)($file['name'] ?? '');
        $sizeBytes = (int)($file['size'] ?? 0);

        if ($err !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['error' => 'Upload failed']);
            return;
        }
        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            http_response_code(400);
            echo json_encode(['error' => 'Upload failed']);
            return;
        }
        if ($sizeBytes <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'File empty']);
            return;
        }
        if ($sizeBytes > 5 * 1024 * 1024) {
            http_response_code(400);
            echo json_encode(['error' => 'File too large']);
            return;
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string)($finfo->file($tmpName) ?: '');
        if ($mime === '' || strpos($mime, 'image/') !== 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Only image files allowed']);
            return;
        }

        $ext = strtolower((string)pathinfo($originalName, PATHINFO_EXTENSION));
        if ($ext === '' || !preg_match('/^[a-z0-9]{1,8}$/', $ext)) {
            $map = [
                'image/jpeg' => 'jpg',
                'image/png' => 'png',
                'image/gif' => 'gif',
                'image/webp' => 'webp',
            ];
            $ext = $map[$mime] ?? 'jpg';
        }

        $token = bin2hex(random_bytes(16));
        $storedFileName = $token . '.' . $ext;
        $relativeDir = 'uploads/tenant_' . $tenantId . '/employees/' . $employeeId . '/profile_photo';
        $baseDir = __DIR__ . '/../../data/' . $relativeDir;
        if (!is_dir($baseDir)) mkdir($baseDir, 0775, true);

        $storedPath = $relativeDir . '/' . $storedFileName;
        $dest = __DIR__ . '/../../data/' . $storedPath;
        if (!move_uploaded_file($tmpName, $dest)) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to store file']);
            return;
        }

        $stmt = $pdo->prepare('SELECT profile_photo_path FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $stmt->execute([$tenantId, $employeeId]);
        $oldPath = (string)($stmt->fetchColumn() ?: '');

        $upd = $pdo->prepare('UPDATE employees SET profile_photo_path=? WHERE tenant_id=? AND id=?');
        $upd->execute([$storedPath, $tenantId, $employeeId]);

        if ($oldPath !== '' && str_starts_with($oldPath, $relativeDir . '/')) {
            $oldAbs = __DIR__ . '/../../data/' . $oldPath;
            if (is_file($oldAbs)) @unlink($oldAbs);
        }

        echo json_encode(['profile_photo_path' => $storedPath]);
    }

    public function profilePhoto()
    {
        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Database error']);
            return;
        }

        EmployeesStore::ensureEmployeeProfileColumns($pdo);
        $tenantId = (int)($user['tenant_id'] ?? 0);
        $employeeId = (int)($user['employee_id'] ?? 0);
        if ($tenantId <= 0 || $employeeId <= 0) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Not found']);
            return;
        }

        $stmt = $pdo->prepare('SELECT profile_photo_path FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $stmt->execute([$tenantId, $employeeId]);
        $storedPath = (string)($stmt->fetchColumn() ?: '');
        if ($storedPath === '') {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Not found']);
            return;
        }

        $abs = __DIR__ . '/../../data/' . $storedPath;
        if (!is_file($abs)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Not found']);
            return;
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string)($finfo->file($abs) ?: 'application/octet-stream');
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string)filesize($abs));
        header('Cache-Control: no-store');
        readfile($abs);
    }
}
