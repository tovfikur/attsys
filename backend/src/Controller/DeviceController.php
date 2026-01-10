<?php

namespace App\Controller;

use App\Core\Database;
use App\Core\Auth;
use App\Core\Audit;

class DeviceController
{
    private function resolveTenantId(\PDO $pdo): ?int
    {
        $user = Auth::currentUser() ?? [];
        $tenantId = $user['tenant_id'] ?? null;
        if ($tenantId) return (int)$tenantId;

        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        if (!$hint) return null;
        $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
        $t->execute([$hint]);
        $row = $t->fetch();
        return $row ? (int)$row['id'] : null;
    }

    public function getHikConfig()
    {
        Auth::requireRole('perm:devices.manage');
        header('Content-Type: application/json');
        $deviceId = trim((string)($_GET['device_id'] ?? ''));
        if ($deviceId === '') { http_response_code(400); echo json_encode(['error' => 'device_id required']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB error']); return; }
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $stmt = $pdo->prepare('SELECT device_id, hik_device_name, hik_api_url, hik_app_key, hik_secret_key, hik_token_expire_time FROM devices WHERE tenant_id=? AND device_id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, $deviceId]);
        $dev = $stmt->fetch();
        if (!$dev) { http_response_code(404); echo json_encode(['error' => 'Device not found']); return; }

        echo json_encode([
            'device_id' => $dev['device_id'],
            'hik_device_name' => $dev['hik_device_name'],
            'hik_api_url' => $dev['hik_api_url'],
            'hik_app_key' => $dev['hik_app_key'],
            'hik_secret_key' => $dev['hik_secret_key'],
            'hik_token_expire_time' => $dev['hik_token_expire_time'],
        ]);
    }

    private function hikCleanAreaDomain(string $areaDomain): string
    {
        $areaDomain = trim($areaDomain);
        if ($areaDomain === '') {
            throw new \RuntimeException('Empty area domain received.');
        }

        if (preg_match('/https?:\/\/[a-zA-Z0-9\.\-]+/', $areaDomain, $m)) {
            return $m[0];
        }

        if (str_contains($areaDomain, 'hikcentralconnect.com')) {
            return 'https://isgp-team.hikcentralconnect.com';
        }

        throw new \RuntimeException('Invalid area domain: ' . $areaDomain);
    }

    private function hikPostJson(string $url, array $payload, array $headers = [], int $timeoutSeconds = 30): array
    {
        $envVerify = getenv('HIK_SSL_VERIFY');
        $verify = $envVerify === false ? null : strtolower(trim((string)$envVerify));
        $verifyPeer = true;
        if ($verify !== null && $verify !== '') {
            $verifyPeer = in_array($verify, ['1', 'true', 'yes', 'on'], true);
        }

        $caInfo = getenv('HIK_CAINFO');
        $caInfoPath = $caInfo ? trim((string)$caInfo) : '';
        if ($caInfoPath !== '' && !file_exists($caInfoPath)) {
            $caInfoPath = '';
        }

        $do = function (bool $sslVerifyPeer) use ($url, $payload, $headers, $timeoutSeconds, $caInfoPath): array {
            $ch = curl_init($url);
            if ($ch === false) {
                throw new \RuntimeException('Failed to initialize HTTP client.');
            }

            $headerLines = array_merge(['Content-Type: application/json'], $headers);
            $opts = [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode($payload),
                CURLOPT_HTTPHEADER => $headerLines,
                CURLOPT_TIMEOUT => $timeoutSeconds,
                CURLOPT_SSL_VERIFYPEER => $sslVerifyPeer,
                CURLOPT_SSL_VERIFYHOST => $sslVerifyPeer ? 2 : 0,
            ];
            if ($caInfoPath !== '') {
                $opts[CURLOPT_CAINFO] = $caInfoPath;
            }

            curl_setopt_array($ch, $opts);

            $body = curl_exec($ch);
            $errno = curl_errno($ch);
            $error = curl_error($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            return [
                'body' => $body,
                'errno' => $errno,
                'error' => $error,
                'status' => $status,
            ];
        };

        $res = $do($verifyPeer);
        if (($res['errno'] ?? 0) && ($verify === null || $verify === '')) {
            $err = (string)($res['error'] ?? '');
            if (stripos($err, 'SSL certificate problem') !== false) {
                $res = $do(false);
            }
        }

        if (($res['errno'] ?? 0)) {
            throw new \RuntimeException('HTTP request failed: ' . (string)($res['error'] ?? ''));
        }
        $status = (int)($res['status'] ?? 0);
        $body = (string)($res['body'] ?? '');
        if ($status < 200 || $status >= 300) {
            throw new \RuntimeException('HTTP error ' . $status . ': ' . $body);
        }

        $data = json_decode($body, true);
        if (!is_array($data)) {
            throw new \RuntimeException('Invalid JSON response.');
        }

        return $data;
    }

    private function hikGenerateToken(\PDO $pdo, int $devicePk, string $appKey, string $secretKey): array
    {
        $tokenUrl = 'https://isgp-team.hikcentralconnect.com/api/hccgw/platform/v1/token/get';
        $payload = ['appKey' => $appKey, 'secretKey' => $secretKey];
        $data = $this->hikPostJson($tokenUrl, $payload, [], 15);

        if (($data['errorCode'] ?? null) !== '0') {
            throw new \RuntimeException('Token API returned error: ' . json_encode($data));
        }

        $tokenData = $data['data'] ?? null;
        if (!is_array($tokenData)) {
            throw new \RuntimeException('Token response missing data.');
        }

        $accessToken = $tokenData['accessToken'] ?? null;
        $expireTs = $tokenData['expireTime'] ?? null;
        $areaDomain = $tokenData['areaDomain'] ?? null;

        if (!$accessToken || !$areaDomain) {
            throw new \RuntimeException('Invalid token data: missing accessToken or areaDomain.');
        }

        $areaDomain = $this->hikCleanAreaDomain((string)$areaDomain);

        $expireDt = null;
        if ($expireTs !== null && is_numeric($expireTs)) {
            $expireDt = gmdate('Y-m-d H:i:s', (int)floor((float)$expireTs));
        } else {
            $expireDt = gmdate('Y-m-d H:i:s');
        }

        $upd = $pdo->prepare('UPDATE devices SET hik_token=?, hik_area_domain=?, hik_token_expire_time=? WHERE id=?');
        $upd->execute([(string)$accessToken, (string)$areaDomain, $expireDt, $devicePk]);

        return ['token' => (string)$accessToken, 'area_domain' => (string)$areaDomain, 'token_expire_time' => $expireDt];
    }

    private function hikDevicesGet(string $baseUrl, string $token): array
    {
        $url = rtrim($baseUrl, '/') . '/api/hccgw/resource/v1/devices/get';
        $payload = ['pageIndex' => 1, 'pageSize' => 100, 'areaID' => ''];
        return $this->hikPostJson($url, $payload, ['Token: ' . $token], 15);
    }

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
        $stmt = $pdo->prepare('SELECT d.id, d.device_id, d.status, d.type, s.name AS site_name, d.created_at, d.hik_device_name, d.hik_api_url, d.hik_token_expire_time, (d.hik_app_key IS NOT NULL AND d.hik_secret_key IS NOT NULL AND d.hik_device_name IS NOT NULL) AS hik_configured FROM devices d JOIN sites s ON s.id=d.site_id WHERE d.tenant_id=? ORDER BY d.id DESC');
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

    public function update()
    {
        Auth::requireRole('perm:devices.manage');
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        $deviceId = trim((string)($in['device_id'] ?? ''));
        if ($deviceId === '') { http_response_code(400); echo json_encode(['error' => 'device_id required']); return; }

        $newDeviceId = trim((string)($in['new_device_id'] ?? $deviceId));
        $newType = array_key_exists('type', $in) ? trim((string)($in['type'] ?? '')) : null;
        $newStatus = array_key_exists('status', $in) ? trim((string)($in['status'] ?? '')) : null;
        $siteName = array_key_exists('site_name', $in) ? trim((string)($in['site_name'] ?? '')) : null;

        if ($newDeviceId === '') { http_response_code(400); echo json_encode(['error' => 'new_device_id invalid']); return; }
        if ($newStatus !== null && !in_array($newStatus, ['active', 'disabled'], true)) { http_response_code(400); echo json_encode(['error' => 'Invalid status']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB error']); return; }
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $stmt = $pdo->prepare('SELECT id, site_id, device_id, type, status FROM devices WHERE tenant_id=? AND device_id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, $deviceId]);
        $dev = $stmt->fetch();
        if (!$dev) { http_response_code(404); echo json_encode(['error' => 'Device not found']); return; }

        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS employee_device_sync_ids (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL,
                employee_id INT NOT NULL,
                device_id VARCHAR(64) NOT NULL,
                device_employee_id VARCHAR(64) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_emp_device (tenant_id, employee_id, device_id),
                UNIQUE KEY uniq_device_empid (tenant_id, device_id, device_employee_id)
            )");

            $pdo->beginTransaction();

            $siteId = (int)$dev['site_id'];
            if ($siteName !== null) {
                if ($siteName === '') {
                    throw new \RuntimeException('site_name invalid');
                }
                $s = $pdo->prepare('SELECT id FROM sites WHERE tenant_id=? AND name=? LIMIT 1');
                $s->execute([(int)$tenantId, $siteName]);
                $site = $s->fetch();
                if (!$site) {
                    $ins = $pdo->prepare('INSERT INTO sites(tenant_id, name) VALUES (?, ?)');
                    $ins->execute([(int)$tenantId, $siteName]);
                    $siteId = (int)$pdo->lastInsertId();
                } else {
                    $siteId = (int)$site['id'];
                }
            }

            if ($newDeviceId !== $deviceId) {
                $chk = $pdo->prepare('SELECT 1 FROM devices WHERE tenant_id=? AND device_id=? LIMIT 1');
                $chk->execute([(int)$tenantId, $newDeviceId]);
                if ($chk->fetch()) {
                    throw new \RuntimeException('Device ID already exists');
                }
            }

            $sets = [];
            $params = [];

            if ($siteName !== null) {
                $sets[] = 'site_id=?';
                $params[] = $siteId;
            }
            if ($newType !== null) {
                $sets[] = 'type=?';
                $params[] = $newType === '' ? null : $newType;
            }
            if ($newStatus !== null) {
                $sets[] = 'status=?';
                $params[] = $newStatus;
            }
            if ($newDeviceId !== $deviceId) {
                $sets[] = 'device_id=?';
                $params[] = $newDeviceId;
            }

            if ($sets) {
                $params[] = (int)$tenantId;
                $params[] = (string)$deviceId;
                $upd = $pdo->prepare('UPDATE devices SET ' . implode(', ', $sets) . ' WHERE tenant_id=? AND device_id=?');
                $upd->execute($params);
            }

            if ($newDeviceId !== $deviceId) {
                $u1 = $pdo->prepare('UPDATE device_events SET device_id=? WHERE device_id=?');
                $u1->execute([(string)$newDeviceId, (string)$deviceId]);
                $u2 = $pdo->prepare('UPDATE raw_events SET device_id=? WHERE tenant_id=? AND device_id=?');
                $u2->execute([(string)$newDeviceId, (int)$tenantId, (string)$deviceId]);
                $u3 = $pdo->prepare('UPDATE employee_device_sync_ids SET device_id=? WHERE tenant_id=? AND device_id=?');
                $u3->execute([(string)$newDeviceId, (int)$tenantId, (string)$deviceId]);
            }

            $pdo->commit();
            Audit::log('device.update', ['device_id' => $deviceId, 'new_device_id' => $newDeviceId], Auth::currentUser());
            echo json_encode(['ok' => true, 'device_id' => $newDeviceId]);
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
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
            $tenantId = (int)$dev['tenant_id'];

            $resolvedEmployeeId = null;
            if (is_string($employee_id) && ctype_digit($employee_id)) {
                $chk = $pdo->prepare('SELECT id FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
                $chk->execute([$tenantId, (int)$employee_id]);
                $row = $chk->fetch();
                if ($row) $resolvedEmployeeId = (int)$row['id'];
            }

            if ($resolvedEmployeeId === null) {
                $pdo->exec("CREATE TABLE IF NOT EXISTS employee_device_sync_ids (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tenant_id INT NOT NULL,
                    employee_id INT NOT NULL,
                    device_id VARCHAR(64) NOT NULL,
                    device_employee_id VARCHAR(64) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_emp_device (tenant_id, employee_id, device_id),
                    UNIQUE KEY uniq_device_empid (tenant_id, device_id, device_employee_id)
                )");
                $map = $pdo->prepare('SELECT employee_id FROM employee_device_sync_ids WHERE tenant_id=? AND device_id=? AND device_employee_id=? LIMIT 1');
                $map->execute([$tenantId, (string)$device_id, (string)$employee_id]);
                $m = $map->fetch();
                if ($m) $resolvedEmployeeId = (int)$m['employee_id'];
            }

            if ($resolvedEmployeeId === null) {
                throw new \Exception('Unknown employee');
            }

            $rec = $event === 'clockin' ? $store->clockIn((string)$resolvedEmployeeId, $tenantId) : $store->clockOut((string)$resolvedEmployeeId, $tenantId);
            $log = $pdo->prepare('INSERT INTO device_events(device_id, employee_id, event) VALUES (?, ?, ?)');
            $log->execute([$device_id, (int)$resolvedEmployeeId, $event]);
            $utc = $occurred ? gmdate('Y-m-d H:i:s', strtotime($occurred)) : gmdate('Y-m-d H:i:s');
            $raw = $pdo->prepare('INSERT IGNORE INTO raw_events(tenant_id, device_id, employee_id, event_type, occurred_at_utc, raw_payload) VALUES(?, ?, ?, ?, ?, ?)');
            $raw->execute([$tenantId, $device_id, (int)$resolvedEmployeeId, $event, $utc, $payload ? json_encode(['identifier'=>$identifier,'payload'=>$payload]) : ($identifier ? json_encode(['identifier'=>$identifier]) : null)]);
            echo json_encode(['record'=>$rec]);
        } catch (\Exception $e) {
            http_response_code(400); echo json_encode(['error'=>$e->getMessage()]);
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

    public function setHikConfig()
    {
        Auth::requireRole('perm:devices.manage');
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        $deviceId = trim((string)($in['device_id'] ?? ''));
        if ($deviceId === '') { http_response_code(400); echo json_encode(['error' => 'device_id required']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB error']); return; }
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $stmt = $pdo->prepare('SELECT id, device_id FROM devices WHERE tenant_id=? AND device_id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, $deviceId]);
        $dev = $stmt->fetch();
        if (!$dev) { http_response_code(404); echo json_encode(['error' => 'Device not found']); return; }

        $fields = [];
        $params = [];
        $provided = false;

        if (array_key_exists('hik_device_name', $in)) {
            $fields[] = 'hik_device_name=?';
            $name = trim((string)$in['hik_device_name']);
            $params[] = ($name === '') ? null : $name;
            $provided = true;
        }
        if (array_key_exists('hik_app_key', $in)) {
            $fields[] = 'hik_app_key=?';
            $key = trim((string)$in['hik_app_key']);
            $params[] = ($key === '') ? null : $key;
            $provided = true;
        }
        if (array_key_exists('hik_secret_key', $in)) {
            $fields[] = 'hik_secret_key=?';
            $sec = trim((string)$in['hik_secret_key']);
            $params[] = ($sec === '') ? null : $sec;
            $provided = true;
        }
        if (array_key_exists('hik_api_url', $in)) {
            $fields[] = 'hik_api_url=?';
            $apiUrl = trim((string)$in['hik_api_url']);
            $params[] = ($apiUrl === '') ? null : $apiUrl;
            $provided = true;
        }

        if (!$provided) { echo json_encode(['ok' => true]); return; }

        $fields[] = 'hik_token=NULL';
        $fields[] = 'hik_area_domain=NULL';
        $fields[] = 'hik_token_expire_time=NULL';

        $params[] = $deviceId;
        $params[] = (int)$tenantId;
        $sql = 'UPDATE devices SET ' . implode(', ', $fields) . ' WHERE device_id=? AND tenant_id=?';
        $upd = $pdo->prepare($sql);
        $upd->execute($params);

        echo json_encode(['ok' => true]);
    }

    public function testHikConnection()
    {
        Auth::requireRole('perm:devices.manage');
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        $deviceId = trim((string)($in['device_id'] ?? ''));
        if ($deviceId === '') { http_response_code(400); echo json_encode(['error' => 'device_id required']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB error']); return; }
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $stmt = $pdo->prepare('SELECT id, hik_device_name, hik_app_key, hik_secret_key FROM devices WHERE tenant_id=? AND device_id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, $deviceId]);
        $dev = $stmt->fetch();
        if (!$dev) { http_response_code(404); echo json_encode(['error' => 'Device not found']); return; }

        $hikName = trim((string)($dev['hik_device_name'] ?? ''));
        $appKey = trim((string)($dev['hik_app_key'] ?? ''));
        $secretKey = trim((string)($dev['hik_secret_key'] ?? ''));
        if ($hikName === '' || $appKey === '' || $secretKey === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Hik device_name, app_key, and secret_key are required']);
            return;
        }

        try {
            $tok = $this->hikGenerateToken($pdo, (int)$dev['id'], $appKey, $secretKey);
            $devicesRes = $this->hikDevicesGet($tok['area_domain'], $tok['token']);
            if (($devicesRes['errorCode'] ?? null) !== '0') {
                throw new \RuntimeException('Device List API returned error: ' . json_encode($devicesRes));
            }

            $deviceList = $devicesRes['data']['device'] ?? [];
            $names = [];
            foreach ($deviceList as $d) {
                if (is_array($d) && isset($d['name'])) $names[] = strtolower(trim((string)$d['name']));
            }

            $found = in_array(strtolower($hikName), $names, true);
            echo json_encode(['ok' => true, 'device_found' => $found]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function syncHikLogs()
    {
        Auth::requireRole('perm:devices.manage');
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        $deviceId = trim((string)($in['device_id'] ?? ''));
        $mode = trim((string)($in['mode'] ?? 'last2days'));
        if ($deviceId === '') { http_response_code(400); echo json_encode(['error' => 'device_id required']); return; }
        if (!in_array($mode, ['last2days', 'all'], true)) { http_response_code(400); echo json_encode(['error' => 'Invalid mode']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB error']); return; }
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $stmt = $pdo->prepare('SELECT id, hik_device_name, hik_app_key, hik_secret_key, hik_api_url FROM devices WHERE tenant_id=? AND device_id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, $deviceId]);
        $dev = $stmt->fetch();
        if (!$dev) { http_response_code(404); echo json_encode(['error' => 'Device not found']); return; }

        $hikName = trim((string)($dev['hik_device_name'] ?? ''));
        $appKey = trim((string)($dev['hik_app_key'] ?? ''));
        $secretKey = trim((string)($dev['hik_secret_key'] ?? ''));
        $apiUrl = trim((string)($dev['hik_api_url'] ?? ''));
        if ($apiUrl === '') $apiUrl = '/api/hccgw/acs/v1/event/certificaterecords/search';

        if ($hikName === '' || $appKey === '' || $secretKey === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Hik device_name, app_key, and secret_key are required']);
            return;
        }

        try {
            $tok = $this->hikGenerateToken($pdo, (int)$dev['id'], $appKey, $secretKey);
            $baseUrl = $this->hikCleanAreaDomain($tok['area_domain']);
            $url = rtrim($baseUrl, '/') . $apiUrl;

            $tz = new \DateTimeZone('Asia/Dhaka');
            $now = new \DateTime('now', $tz);
            if ($mode === 'all') {
                $currentYear = (int)$now->format('Y');
                $beginTime = sprintf('%d-01-01T00:00:00%s', $currentYear, (new \DateTime("$currentYear-01-01 00:00:00", $tz))->format('P'));
                $endTime = sprintf('%d-12-31T23:59:59%s', $currentYear, (new \DateTime("$currentYear-12-31 23:59:59", $tz))->format('P'));
            } else {
                $twoDaysAgo = (clone $now)->modify('-2 days');
                $beginTime = $twoDaysAgo->format('Y-m-d\TH:i:sP');
                $endTime = $now->format('Y-m-d\TH:i:sP');
            }

            $pageIndex = 1;
            $pageSize = 200;
            $totalAdded = 0;
            $matchedDevice = false;
            $skippedDevice = 0;
            $skippedNoPerson = 0;
            $skippedUnknownEmployee = 0;
            $duplicates = 0;
            $unknownEmployeeCodes = [];
            $unknownEmployeeCodesLimit = 200;
            $unknownEmployeeCodesTruncated = false;

            $pdo->exec("CREATE TABLE IF NOT EXISTS employee_device_sync_ids (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL,
                employee_id INT NOT NULL,
                device_id VARCHAR(64) NOT NULL,
                device_employee_id VARCHAR(64) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_emp_device (tenant_id, employee_id, device_id),
                UNIQUE KEY uniq_device_empid (tenant_id, device_id, device_employee_id)
            )");

            $empByDeviceIdStmt = $pdo->prepare('SELECT e.id FROM employee_device_sync_ids m JOIN employees e ON e.id=m.employee_id WHERE m.tenant_id=? AND e.tenant_id=? AND m.device_id=? AND m.device_employee_id=? LIMIT 1');
            $empByCodeStmt = $pdo->prepare('SELECT id FROM employees WHERE tenant_id=? AND code=? LIMIT 1');
            $ins = $pdo->prepare('INSERT IGNORE INTO raw_events(tenant_id, device_id, employee_id, event_type, occurred_at_utc, raw_payload) VALUES(?, ?, ?, ?, ?, ?)');

            while (true) {
                $payload = [
                    'pageIndex' => $pageIndex,
                    'pageSize' => $pageSize,
                    'beginTime' => $beginTime,
                    'endTime' => $endTime,
                ];

                $data = $this->hikPostJson($url, $payload, ['Token: ' . $tok['token']], 30);
                if (($data['errorCode'] ?? null) !== '0') {
                    throw new \RuntimeException('API returned error: ' . json_encode($data));
                }

                $recordList = $data['data']['recordList'] ?? [];
                if (!is_array($recordList) || !$recordList) {
                    break;
                }

                foreach ($recordList as $rec) {
                    if (!is_array($rec)) continue;

                    $apiDeviceName = strtolower(trim((string)($rec['deviceName'] ?? '')));
                    $odooDeviceName = strtolower($hikName);
                    if ($apiDeviceName !== $odooDeviceName) {
                        $skippedDevice++;
                        continue;
                    }
                    $matchedDevice = true;

                    $personInfo = $rec['personInfo']['personInfo'] ?? null;
                    if (!is_array($personInfo)) $personInfo = $rec['personInfo']['baseInfo'] ?? null;
                    if (!is_array($personInfo)) $personInfo = [];

                    $personCode = $personInfo['personCode'] ?? null;
                    if (!$personCode) {
                        $skippedNoPerson++;
                        continue;
                    }

                    $firstName = (string)($personInfo['firstName'] ?? '');
                    $lastName = (string)($personInfo['lastName'] ?? '');

                    $recordTimeRaw = (string)($rec['recordTime'] ?? '');
                    $ts = $recordTimeRaw !== '' ? strtotime($recordTimeRaw) : false;
                    $occurredUtc = $ts !== false ? gmdate('Y-m-d H:i:s', $ts) : gmdate('Y-m-d H:i:s');

                    $employeeId = null;
                    $empByDeviceIdStmt->execute([(int)$tenantId, (int)$tenantId, (string)$deviceId, (string)$personCode]);
                    $mapped = $empByDeviceIdStmt->fetch();
                    if ($mapped) {
                        $employeeId = (int)$mapped['id'];
                    } else {
                        $empByCodeStmt->execute([(int)$tenantId, (string)$personCode]);
                        $emp = $empByCodeStmt->fetch();
                        if ($emp) $employeeId = (int)$emp['id'];
                    }

                    if (!$employeeId) {
                        $skippedUnknownEmployee++;
                        $code = trim((string)$personCode);
                        if ($code !== '') {
                            if (isset($unknownEmployeeCodes[$code])) {
                                $unknownEmployeeCodes[$code]++;
                            } else if (!$unknownEmployeeCodesTruncated) {
                                if (count($unknownEmployeeCodes) >= $unknownEmployeeCodesLimit) {
                                    $unknownEmployeeCodesTruncated = true;
                                } else {
                                    $unknownEmployeeCodes[$code] = 1;
                                }
                            }
                        }
                        continue;
                    }

                    $payloadJson = json_encode([
                        'deviceName' => $rec['deviceName'] ?? null,
                        'person_code' => (string)$personCode,
                        'first_name' => $firstName,
                        'last_name' => $lastName,
                        'recordTime' => $recordTimeRaw !== '' ? $recordTimeRaw : null,
                        'source' => 'hik',
                    ]);

                    $ins->execute([(int)$tenantId, $deviceId, $employeeId, 'punch', $occurredUtc, $payloadJson]);
                    if ($ins->rowCount() > 0) $totalAdded++;
                    else $duplicates++;
                }

                $totalRecords = (int)($data['data']['totalNum'] ?? 0);
                if ($pageIndex * $pageSize >= $totalRecords) break;
                $pageIndex++;
            }

            if (!$matchedDevice) {
                http_response_code(400);
                echo json_encode(['error' => 'No matching device logs found for device: ' . $hikName]);
                return;
            }

            $startDate = substr((string)$beginTime, 0, 10);
            $endDate = substr((string)$endTime, 0, 10);
            $processedCount = 0;
            try {
                $proc = new \App\Core\AttendanceProcessor();
                $processedCount = count($proc->processRange((int)$tenantId, $startDate, $endDate));
            } catch (\Exception $e) {
                $processedCount = 0;
            }

            echo json_encode([
                'ok' => true,
                'added' => $totalAdded,
                'duplicates' => $duplicates,
                'attendance_days_updated' => $processedCount,
                'skipped_device_mismatch' => $skippedDevice,
                'skipped_missing_person_code' => $skippedNoPerson,
                'skipped_unknown_employee' => $skippedUnknownEmployee,
                'unknown_employee_codes' => (function () use ($unknownEmployeeCodes) {
                    $items = [];
                    foreach ($unknownEmployeeCodes as $code => $count) {
                        $items[] = ['code' => $code, 'count' => (int)$count];
                    }
                    usort($items, function ($a, $b) {
                        $c = ((int)$b['count']) <=> ((int)$a['count']);
                        if ($c !== 0) return $c;
                        return strcmp((string)$a['code'], (string)$b['code']);
                    });
                    return $items;
                })(),
                'unknown_employee_codes_truncated' => $unknownEmployeeCodesTruncated,
            ]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
}
