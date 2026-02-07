<?php

namespace App\Controller;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;
use App\Core\Geo;

class LocationController
{
    private function resolveTenantId(array $user, \PDO $pdo): ?int
    {
        $tenantId = (int)($user['tenant_id'] ?? 0);
        if ($tenantId > 0) return $tenantId;

        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        if (!$hint) return null;
        $stmt = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=? LIMIT 1');
        $stmt->execute([strtolower((string)$hint)]);
        $row = $stmt->fetch();
        return $row ? (int)$row['id'] : null;
    }

    private function ensureSettings(\PDO $pdo, int $tenantId): array
    {
        $pdo->prepare('INSERT IGNORE INTO geo_settings(tenant_id) VALUES (?)')->execute([(int)$tenantId]);
        $stmt = $pdo->prepare('SELECT enabled, update_interval_sec, min_accuracy_m, offline_after_sec, require_fence FROM geo_settings WHERE tenant_id=? LIMIT 1');
        $stmt->execute([(int)$tenantId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        return [
            'enabled' => (int)($row['enabled'] ?? 0),
            'update_interval_sec' => (int)($row['update_interval_sec'] ?? 30),
            'min_accuracy_m' => isset($row['min_accuracy_m']) ? (int)$row['min_accuracy_m'] : null,
            'offline_after_sec' => (int)($row['offline_after_sec'] ?? 180),
            'require_fence' => (int)($row['require_fence'] ?? 0),
        ];
    }

    private function loadFence(\PDO $pdo, int $tenantId, int $employeeId, \DateTimeInterface $now): array
    {
        $stmt = $pdo->prepare('SELECT gf.id, gf.type, gf.active, gf.is_default, gf.center_lat, gf.center_lng, gf.radius_m, gf.time_start, gf.time_end FROM geo_user_fences guf JOIN geo_fences gf ON gf.id=guf.fence_id AND gf.tenant_id=guf.tenant_id WHERE guf.tenant_id=? AND guf.employee_id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, (int)$employeeId]);
        $f = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$f) {
            $d = $pdo->prepare('SELECT id, type, active, is_default, center_lat, center_lng, radius_m, time_start, time_end FROM geo_fences WHERE tenant_id=? AND is_default=1 AND active=1 ORDER BY id DESC LIMIT 1');
            $d->execute([(int)$tenantId]);
            $f = $d->fetch(\PDO::FETCH_ASSOC);
        }

        if (!$f) return [null, []];
        if (!Geo::fenceAppliesAt($f, $now)) return [null, []];

        $vertices = [];
        if (strtolower((string)($f['type'] ?? '')) === 'polygon') {
            $v = $pdo->prepare('SELECT seq, latitude, longitude FROM geo_fence_vertices WHERE tenant_id=? AND fence_id=? ORDER BY seq ASC');
            $v->execute([(int)$tenantId, (int)$f['id']]);
            $vertices = $v->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        }

        return [$f, $vertices];
    }

    private function upsertLatest(\PDO $pdo, int $tenantId, int $employeeId, float $lat, float $lng, ?int $acc, ?float $speed, ?string $deviceStatus, string $status, int $inside, ?int $fenceId, ?int $distOutside): void
    {
        $stmt = $pdo->prepare('INSERT INTO geo_location_latest(tenant_id, employee_id, latitude, longitude, accuracy_m, speed_mps, device_status, last_seen_at, status, inside, fence_id, distance_outside_m) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?) ON DUPLICATE KEY UPDATE latitude=VALUES(latitude), longitude=VALUES(longitude), accuracy_m=VALUES(accuracy_m), speed_mps=VALUES(speed_mps), device_status=VALUES(device_status), last_seen_at=NOW(), status=VALUES(status), inside=VALUES(inside), fence_id=VALUES(fence_id), distance_outside_m=VALUES(distance_outside_m)');
        $stmt->execute([
            (int)$tenantId,
            (int)$employeeId,
            $lat,
            $lng,
            $acc,
            $speed,
            $deviceStatus,
            $status,
            (int)$inside,
            $fenceId,
            $distOutside,
        ]);
    }

    public function update()
    {
        Auth::requireRole('perm:geo.track');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $employeeId = (int)($user['employee_id'] ?? 0);
        if ($employeeId <= 0) { http_response_code(400); echo json_encode(['error' => 'employee not linked']); return; }

        $settings = $this->ensureSettings($pdo, (int)$tenantId);
        if (!(int)$settings['enabled']) {
            echo json_encode(['ok' => true, 'enabled' => 0]);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $lat = $in['latitude'] ?? ($in['lat'] ?? null);
        $lng = $in['longitude'] ?? ($in['lng'] ?? null);
        if (!is_numeric($lat) || !is_numeric($lng)) { http_response_code(400); echo json_encode(['error' => 'latitude and longitude required']); return; }

        $lat = (float)$lat;
        $lng = (float)$lng;
        $acc = isset($in['accuracy_m']) && is_numeric($in['accuracy_m']) ? (int)$in['accuracy_m'] : null;
        $speed = isset($in['speed_mps']) && is_numeric($in['speed_mps']) ? (float)$in['speed_mps'] : null;
        $deviceStatus = isset($in['device_status']) ? trim((string)$in['device_status']) : null;

        $now = new \DateTimeImmutable('now');
        [$fence, $vertices] = $this->loadFence($pdo, (int)$tenantId, (int)$employeeId, $now);

        $inside = 1;
        $distanceOutside = null;
        $fenceId = null;
        if ($fence) {
            $fenceId = (int)$fence['id'];
            [$isInside, $dist] = Geo::isInsideFence($fence, $vertices, $lat, $lng);
            $inside = $isInside ? 1 : 0;
            $distanceOutside = $dist;
        }

        $status = $inside ? 'inside' : 'outside';

        $prevInside = null;
        $prevFenceId = null;
        $prevStmt = $pdo->prepare('SELECT inside, fence_id FROM geo_location_latest WHERE tenant_id=? AND employee_id=? LIMIT 1');
        $prevStmt->execute([(int)$tenantId, (int)$employeeId]);
        $prev = $prevStmt->fetch(\PDO::FETCH_ASSOC);
        if ($prev) {
            $prevInside = isset($prev['inside']) ? (int)$prev['inside'] : null;
            $prevFenceId = isset($prev['fence_id']) ? (int)$prev['fence_id'] : null;
        }

        $log = $pdo->prepare('INSERT INTO geo_location_logs(tenant_id, employee_id, latitude, longitude, accuracy_m, speed_mps, device_status) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $log->execute([(int)$tenantId, (int)$employeeId, $lat, $lng, $acc, $speed, $deviceStatus]);

        $this->upsertLatest($pdo, (int)$tenantId, (int)$employeeId, $lat, $lng, $acc, $speed, $deviceStatus, $status, $inside, $fenceId, $distanceOutside);

        if ($fence) {
            if ($prevInside === 1 && $inside === 0) {
                $b = $pdo->prepare('INSERT INTO geo_breach_logs(tenant_id, employee_id, fence_id, event_type, latitude, longitude, distance_outside_m) VALUES (?, ?, ?, ?, ?, ?, ?)');
                $b->execute([(int)$tenantId, (int)$employeeId, $fenceId, 'exit', $lat, $lng, $distanceOutside]);
                Audit::log('geo.breach.exit', ['tenant_id' => $tenantId, 'employee_id' => $employeeId, 'fence_id' => $fenceId, 'distance_outside_m' => $distanceOutside], $user);
            }
            if ($prevInside === 0 && $inside === 1 && ($prevFenceId === null || $prevFenceId === $fenceId)) {
                $b = $pdo->prepare('INSERT INTO geo_breach_logs(tenant_id, employee_id, fence_id, event_type, latitude, longitude, distance_outside_m) VALUES (?, ?, ?, ?, ?, ?, ?)');
                $b->execute([(int)$tenantId, (int)$employeeId, $fenceId, 'enter', $lat, $lng, 0]);
            }
        }

        echo json_encode(['ok' => true, 'inside' => $inside, 'status' => $status]);
    }

    public function latest()
    {
        Auth::requireRole('perm:geo.read');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $settings = $this->ensureSettings($pdo, (int)$tenantId);
        $offlineAfter = (int)$settings['offline_after_sec'];

        $stmt = $pdo->prepare('SELECT gl.employee_id, e.name AS employee_name, e.code AS employee_code, gl.latitude, gl.longitude, gl.accuracy_m, gl.speed_mps, gl.device_status, gl.last_seen_at, gl.status, gl.inside, gl.fence_id, gl.distance_outside_m FROM geo_location_latest gl JOIN employees e ON e.id=gl.employee_id AND e.tenant_id=gl.tenant_id WHERE gl.tenant_id=? ORDER BY gl.last_seen_at DESC LIMIT 10000');
        $stmt->execute([(int)$tenantId]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        $out = [];
        $now = time();
        foreach ($rows as $r) {
            $seenAt = (string)($r['last_seen_at'] ?? '');
            $seenTs = $seenAt ? strtotime($seenAt) : 0;
            $age = $seenTs ? max(0, $now - $seenTs) : 999999;
            $status = (string)($r['status'] ?? 'offline');
            if ($age > $offlineAfter) $status = 'offline';
            $out[] = [
                'employee_id' => (string)$r['employee_id'],
                'employee_name' => (string)$r['employee_name'],
                'employee_code' => (string)$r['employee_code'],
                'latitude' => (float)$r['latitude'],
                'longitude' => (float)$r['longitude'],
                'accuracy_m' => isset($r['accuracy_m']) ? (int)$r['accuracy_m'] : null,
                'speed_mps' => isset($r['speed_mps']) ? (float)$r['speed_mps'] : null,
                'device_status' => $r['device_status'] !== null ? (string)$r['device_status'] : null,
                'last_seen_at' => $seenAt,
                'status' => $status,
                'inside' => (int)($r['inside'] ?? 0),
                'fence_id' => $r['fence_id'] !== null ? (string)$r['fence_id'] : null,
                'distance_outside_m' => $r['distance_outside_m'] !== null ? (int)$r['distance_outside_m'] : null,
                'age_sec' => (int)$age,
            ];
        }

        echo json_encode(['rows' => $out, 'offline_after_sec' => $offlineAfter]);
    }

    public function history()
    {
        Auth::requireRole('perm:geo.read');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $employeeId = (int)($_GET['employee_id'] ?? 0);
        if ($employeeId <= 0) { http_response_code(400); echo json_encode(['error' => 'employee_id required']); return; }

        $from = $_GET['from'] ?? null;
        $to = $_GET['to'] ?? null;
        if (!$from || !$to) {
            $d = date('Y-m-d');
            $from = $from ?: ($d . ' 00:00:00');
            $to = $to ?: ($d . ' 23:59:59');
        }

        $limit = (int)($_GET['limit'] ?? 5000);
        if ($limit <= 0) $limit = 5000;
        if ($limit > 20000) $limit = 20000;

        $eChk = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $eChk->execute([(int)$tenantId, $employeeId]);
        if (!$eChk->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Employee not found']); return; }

        $stmt = $pdo->prepare("SELECT id, latitude, longitude, accuracy_m, speed_mps, device_status, captured_at FROM geo_location_logs WHERE tenant_id=? AND employee_id=? AND captured_at BETWEEN ? AND ? ORDER BY captured_at ASC LIMIT $limit");
        $stmt->execute([(int)$tenantId, $employeeId, $from, $to]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id' => (string)$r['id'],
                'latitude' => (float)$r['latitude'],
                'longitude' => (float)$r['longitude'],
                'accuracy_m' => isset($r['accuracy_m']) ? (int)$r['accuracy_m'] : null,
                'speed_mps' => isset($r['speed_mps']) ? (float)$r['speed_mps'] : null,
                'device_status' => $r['device_status'] !== null ? (string)$r['device_status'] : null,
                'captured_at' => (string)$r['captured_at'],
            ];
        }

        echo json_encode(['rows' => $out, 'from' => $from, 'to' => $to]);
    }

    public function breachesUnseenCount()
    {
        Auth::requireRole('perm:geo.read');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM geo_breach_logs WHERE tenant_id=? AND seen_at IS NULL');
        $stmt->execute([(int)$tenantId]);
        $count = (int)$stmt->fetchColumn();
        echo json_encode(['count' => $count]);
    }

    public function breachesMarkSeen()
    {
        Auth::requireRole('perm:geo.read');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $pdo->prepare('UPDATE geo_breach_logs SET seen_at=NOW() WHERE tenant_id=? AND seen_at IS NULL')->execute([(int)$tenantId]);
        echo json_encode(['ok' => true]);
    }
}

