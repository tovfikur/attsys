<?php

namespace App\Controller;

use App\Core\Database;
use App\Core\Auth;
use App\Core\Audit;

class DeviceController
{
    public function list()
    {
        Auth::requireRole('perm:devices.manage');
        header('Content-Type: application/json');
        $user = Auth::currentUser();
        $pdo = Database::get();
        $tenantId = $user['tenant_id'] ?? null;
        if (!$tenantId) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) {
                $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
                $t->execute([$hint]);
                $row = $t->fetch();
                if ($row) $tenantId = (int)$row['id'];
            }
        }
        if (!$tenantId) { echo json_encode(['devices'=>[]]); return; }
        $stmt = $pdo->prepare('SELECT d.id, d.device_id, d.status, d.type, s.name AS site_name, d.created_at FROM devices d JOIN sites s ON s.id=d.site_id WHERE d.tenant_id=? ORDER BY d.id DESC');
        $stmt->execute([$tenantId]);
        echo json_encode(['devices'=>$stmt->fetchAll()]);
    }

    public function register()
    {
        Auth::requireRole('perm:devices.manage');
        header('Content-Type: application/json');
        $user = Auth::currentUser();
        $in = json_decode(file_get_contents('php://input'), true);
        $siteName = trim($in['site_name'] ?? '');
        $type = trim($in['type'] ?? 'terminal');
        if (!$siteName) { http_response_code(400); echo json_encode(['error'=>'site_name required']); return; }
        $pdo = Database::get();
        $tenantId = $user['tenant_id'] ?? null;
        if (!$tenantId) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
        }
        if (!$tenantId) { http_response_code(400); echo json_encode(['error'=>'tenant not resolved']); return; }
        $stmt = $pdo->prepare('SELECT id FROM sites WHERE tenant_id=? AND name=? LIMIT 1');
        $stmt->execute([$tenantId, $siteName]);
        $site = $stmt->fetch();
        if (!$site) {
            $ins = $pdo->prepare('INSERT INTO sites(tenant_id, name) VALUES (?, ?)');
            $ins->execute([$tenantId, $siteName]);
            $site_id = (int)$pdo->lastInsertId();
        } else { $site_id = (int)$site['id']; }
        $device_id = bin2hex(random_bytes(16));
        $secret = bin2hex(random_bytes(16));
        $dins = $pdo->prepare('INSERT INTO devices(tenant_id, site_id, device_id, secret, type, status) VALUES (?, ?, ?, ?, ?, "active")');
        $dins->execute([$tenantId, $site_id, $device_id, $secret, $type]);
        Audit::log('device.register', ['device_id'=>$device_id, 'site_id'=>$site_id], $user);
        echo json_encode(['device_id'=>$device_id, 'secret'=>$secret]);
    }

    public function ingest()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        $device_id = $in['device_id'] ?? '';
        $secret = $in['secret'] ?? '';
        $employee_id = $in['employee_id'] ?? '';
        $event = $in['event'] ?? '';
        $occurred = $in['occurred_at'] ?? null;
        $identifier = $in['identifier'] ?? null;
        $payload = $in['payload'] ?? null;
        if (!$device_id || !$secret || !$employee_id || !in_array($event, ['clockin','clockout'], true)) { http_response_code(400); echo json_encode(['error'=>'Invalid payload']); return; }
        $pdo = Database::get();
        $d = $pdo->prepare('SELECT id, tenant_id FROM devices WHERE device_id=? AND secret=? AND status="active"');
        $d->execute([$device_id, $secret]);
        $dev = $d->fetch();
        if (!$dev) { http_response_code(403); echo json_encode(['error'=>'Device not authorized']); return; }
        $store = new \App\Core\AttendanceStore();
        try {
            $rec = $event === 'clockin' ? $store->clockIn($employee_id, (int)$dev['tenant_id']) : $store->clockOut($employee_id, (int)$dev['tenant_id']);
            $log = $pdo->prepare('INSERT INTO device_events(device_id, employee_id, event) VALUES (?, ?, ?)');
            $log->execute([$device_id, (int)$employee_id, $event]);
            $utc = $occurred ? gmdate('Y-m-d H:i:s', strtotime($occurred)) : gmdate('Y-m-d H:i:s');
            $raw = $pdo->prepare('INSERT IGNORE INTO raw_events(tenant_id, device_id, employee_id, event_type, occurred_at_utc, raw_payload) VALUES(?, ?, ?, ?, ?, ?)');
            $raw->execute([(int)$dev['tenant_id'], $device_id, (int)$employee_id, $event, $utc, $payload ? json_encode(['identifier'=>$identifier,'payload'=>$payload]) : ($identifier ? json_encode(['identifier'=>$identifier]) : null)]);
            echo json_encode(['record'=>$rec]);
        } catch (\Exception $e) {
            http_response_code(400); echo json_encode(['error'=>$e->getMessage()]);
        }
    }
}

    public function setStatus()
    {
        Auth::requireRole('perm:devices.manage');
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        $device_id = $in['device_id'] ?? '';
        $status = $in['status'] ?? '';
        if (!$device_id || !in_array($status, ['active','disabled'], true)) { http_response_code(400); echo json_encode(['error'=>'Invalid payload']); return; }
        $pdo = Database::get();
        $tenantId = Auth::currentUser()['tenant_id'] ?? null;
        if (!$tenantId) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
        }
        $upd = $pdo->prepare('UPDATE devices SET status=? WHERE device_id=? AND tenant_id=?');
        $upd->execute([$status, $device_id, (int)$tenantId]);
        echo json_encode(['device_id'=>$device_id, 'status'=>$status]);
    }

    public function events()
    {
        Auth::requireRole('perm:devices.manage');
        header('Content-Type: application/json');
        $pdo = Database::get();
        $device_id = $_GET['device_id'] ?? '';
        if (!$device_id) { echo json_encode(['events'=>[]]); return; }
        $tenantId = Auth::currentUser()['tenant_id'] ?? null;
        if (!$tenantId) { $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null; if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } } }
        $d = $pdo->prepare('SELECT id FROM devices WHERE device_id=? AND tenant_id=?');
        $d->execute([$device_id, (int)$tenantId]);
        if (!$d->fetch()) { echo json_encode(['events'=>[]]); return; }
        $stmt = $pdo->prepare('SELECT id, employee_id, event, occurred_at FROM device_events WHERE device_id=? ORDER BY id DESC LIMIT 200');
        $stmt->execute([$device_id]);
        echo json_encode(['events'=>$stmt->fetchAll()]);
    }
}
