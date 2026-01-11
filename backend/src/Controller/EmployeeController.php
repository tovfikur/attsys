<?php

namespace App\Controller;

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
