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
            $e = $this->store->create($in['name'] ?? '', $in['code'] ?? '');
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
            $e = $this->store->update(
                $in['id'] ?? '',
                $in['name'] ?? '',
                $in['code'] ?? '',
                $in['status'] ?? 'active',
                $in['device_sync_ids'] ?? null
            );
            echo json_encode(['employee' => $e]);
        } catch (\Exception $e) {
            http_response_code(400);
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
