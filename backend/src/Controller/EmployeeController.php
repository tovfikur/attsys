<?php

namespace App\Controller;

use App\Core\Auth;
use App\Core\Database;
use App\Core\EmployeesStore;

class EmployeeController
{
    private $store;
    public function __construct() { $this->store = new EmployeesStore(); }

    public function list()
    {
        header('Content-Type: application/json');
        echo json_encode(['employees' => $this->store->all()]);
    }

    public function create()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        try {
            $e = $this->store->create(is_array($in) ? $in : []);
            echo json_encode(['employee' => $e]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function update()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        try {
            $id = (string)($in['id'] ?? '');
            $deviceSyncIds = $in['device_sync_ids'] ?? null;
            $e = $this->store->update($id, is_array($in) ? $in : [], $deviceSyncIds);
            echo json_encode(['employee' => $e]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
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
        if (($user['role'] ?? null) === 'employee') {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $employeeId = (int)($_POST['employee_id'] ?? 0);
        if ($employeeId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing employee_id']);
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
        if ($tenantId <= 0) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) {
                $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
                $t->execute([$hint]);
                $row = $t->fetch();
                if ($row) $tenantId = (int)$row['id'];
            }
        }
        if ($tenantId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([$tenantId, $employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
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
        if (($user['role'] ?? null) === 'employee') {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $employeeId = (int)($_GET['employee_id'] ?? 0);
        if ($employeeId <= 0) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Missing employee_id']);
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
        if ($tenantId <= 0) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) {
                $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
                $t->execute([$hint]);
                $row = $t->fetch();
                if ($row) $tenantId = (int)$row['id'];
            }
        }
        if ($tenantId <= 0) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $stmt = $pdo->prepare('SELECT profile_photo_path FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $stmt->execute([$tenantId, $employeeId]);
        $storedPath = (string)($stmt->fetchColumn() ?: '');
        if ($storedPath === '') {
            http_response_code(204);
            return;
        }

        $abs = __DIR__ . '/../../data/' . $storedPath;
        if (!is_file($abs)) {
            http_response_code(204);
            return;
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string)($finfo->file($abs) ?: 'application/octet-stream');
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string)filesize($abs));
        header('Cache-Control: no-store');
        readfile($abs);
    }

    public function attachments()
    {
        header('Content-Type: application/json');
        $employeeId = (string)($_GET['employee_id'] ?? '');
        try {
            if ($employeeId === '') throw new \Exception('Missing employee_id');
            $items = $this->store->listAttachments($employeeId);
            echo json_encode(['attachments' => $items]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function uploadAttachment()
    {
        header('Content-Type: application/json');
        try {
            $employeeId = trim((string)($_POST['employee_id'] ?? ''));
            $category = trim((string)($_POST['category'] ?? 'attachment'));
            $title = trim((string)($_POST['title'] ?? ''));
            if ($employeeId === '') throw new \Exception('Missing employee_id');
            if (!isset($_FILES['file'])) throw new \Exception('Missing file');
            $item = $this->store->addAttachment($employeeId, $category, $title, $_FILES['file']);
            echo json_encode(['attachment' => $item]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function deleteAttachment()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        try {
            $id = (string)($in['id'] ?? '');
            if ($id === '') throw new \Exception('Missing id');
            $this->store->deleteAttachment($id);
            echo json_encode(['ok' => true]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function downloadAttachment()
    {
        $attachmentId = (string)($_GET['id'] ?? '');
        if ($attachmentId === '') {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Missing id']);
            return;
        }
        try {
            $row = $this->store->getAttachmentForDownload($attachmentId);
            $path = __DIR__ . '/../../data/' . (string)($row['stored_path'] ?? '');
            if (!is_file($path)) throw new \Exception('File missing');

            header('Content-Type: ' . (string)($row['mime'] ?? 'application/octet-stream'));
            header('Content-Length: ' . (string)filesize($path));
            header('Content-Disposition: attachment; filename="' . str_replace('"', '', (string)($row['original_name'] ?? 'download')) . '"');
            readfile($path);
        } catch (\Exception $e) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function deviceSyncIds()
    {
        header('Content-Type: application/json');
        $employeeId = $_GET['employee_id'] ?? '';
        try {
            $items = $this->store->getDeviceSyncIds($employeeId);
            echo json_encode(['device_sync_ids' => $items]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function delete()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        $this->store->delete($in['id'] ?? '');
        echo json_encode(['ok' => true]);
    }
}
