<?php

namespace App\Controller;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Audit;

class GeoController
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

    private function ensureSettings(\PDO $pdo, int $tenantId): void
    {
        $stmt = $pdo->prepare('INSERT IGNORE INTO geo_settings(tenant_id) VALUES (?)');
        $stmt->execute([(int)$tenantId]);
    }

    public function fencesList()
    {
        Auth::requireRole('perm:geo.manage');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }

        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $stmt = $pdo->prepare('SELECT id, name, type, active, is_default, center_lat, center_lng, radius_m, time_start, time_end, created_at, updated_at FROM geo_fences WHERE tenant_id=? ORDER BY is_default DESC, id DESC');
        $stmt->execute([(int)$tenantId]);
        $fences = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        $ids = [];
        foreach ($fences as $f) {
            if (strtolower((string)($f['type'] ?? '')) === 'polygon') $ids[] = (int)$f['id'];
        }

        $vertsByFence = [];
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $vStmt = $pdo->prepare("SELECT fence_id, seq, latitude, longitude FROM geo_fence_vertices WHERE tenant_id=? AND fence_id IN ($in) ORDER BY fence_id ASC, seq ASC");
            $vStmt->execute(array_merge([(int)$tenantId], $ids));
            $rows = $vStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            foreach ($rows as $r) {
                $fid = (int)$r['fence_id'];
                if (!isset($vertsByFence[$fid])) $vertsByFence[$fid] = [];
                $vertsByFence[$fid][] = [
                    'seq' => (int)$r['seq'],
                    'latitude' => (float)$r['latitude'],
                    'longitude' => (float)$r['longitude'],
                ];
            }
        }

        $out = [];
        foreach ($fences as $f) {
            $fid = (int)$f['id'];
            $out[] = [
                'id' => (string)$fid,
                'name' => (string)$f['name'],
                'type' => (string)$f['type'],
                'active' => (int)$f['active'],
                'is_default' => (int)$f['is_default'],
                'center_lat' => isset($f['center_lat']) && is_numeric($f['center_lat']) ? (float)$f['center_lat'] : null,
                'center_lng' => isset($f['center_lng']) && is_numeric($f['center_lng']) ? (float)$f['center_lng'] : null,
                'radius_m' => isset($f['radius_m']) && is_numeric($f['radius_m']) ? (int)$f['radius_m'] : null,
                'time_start' => $f['time_start'],
                'time_end' => $f['time_end'],
                'vertices' => $vertsByFence[$fid] ?? [],
                'created_at' => (string)($f['created_at'] ?? ''),
                'updated_at' => (string)($f['updated_at'] ?? ''),
            ];
        }

        echo json_encode(['fences' => $out]);
    }

    public function fencesCreate()
    {
        Auth::requireRole('perm:geo.manage');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }
        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $name = trim((string)($in['name'] ?? ''));
        $type = strtolower(trim((string)($in['type'] ?? '')));
        $active = isset($in['active']) ? (int)(!!$in['active']) : 1;
        $isDefault = isset($in['is_default']) ? (int)(!!$in['is_default']) : 0;
        $timeStart = isset($in['time_start']) ? trim((string)$in['time_start']) : null;
        $timeEnd = isset($in['time_end']) ? trim((string)$in['time_end']) : null;

        if ($name === '') { http_response_code(400); echo json_encode(['error' => 'name required']); return; }
        if (!in_array($type, ['circle', 'polygon'], true)) { http_response_code(400); echo json_encode(['error' => 'invalid type']); return; }

        $centerLat = $in['center_lat'] ?? null;
        $centerLng = $in['center_lng'] ?? null;
        $radiusM = $in['radius_m'] ?? null;
        $vertices = $in['vertices'] ?? [];

        if ($type === 'circle') {
            if (!is_numeric($centerLat) || !is_numeric($centerLng) || !is_numeric($radiusM) || (int)$radiusM <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'circle requires center_lat, center_lng, radius_m']);
                return;
            }
        }
        if ($type === 'polygon') {
            if (!is_array($vertices) || count($vertices) < 3) {
                http_response_code(400);
                echo json_encode(['error' => 'polygon requires vertices (>=3)']);
                return;
            }
        }

        try {
            $pdo->beginTransaction();
            if ($isDefault) {
                $pdo->prepare('UPDATE geo_fences SET is_default=0 WHERE tenant_id=?')->execute([(int)$tenantId]);
            }

            $stmt = $pdo->prepare('INSERT INTO geo_fences(tenant_id, name, type, active, is_default, center_lat, center_lng, radius_m, time_start, time_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                (int)$tenantId,
                $name,
                $type,
                (int)$active,
                (int)$isDefault,
                $type === 'circle' ? (float)$centerLat : null,
                $type === 'circle' ? (float)$centerLng : null,
                $type === 'circle' ? (int)$radiusM : null,
                $timeStart ?: null,
                $timeEnd ?: null,
            ]);
            $id = (int)$pdo->lastInsertId();

            if ($type === 'polygon') {
                $vIns = $pdo->prepare('INSERT INTO geo_fence_vertices(tenant_id, fence_id, seq, latitude, longitude) VALUES (?, ?, ?, ?, ?)');
                $seq = 0;
                foreach ($vertices as $v) {
                    $lat = $v['latitude'] ?? ($v['lat'] ?? null);
                    $lng = $v['longitude'] ?? ($v['lng'] ?? null);
                    if (!is_numeric($lat) || !is_numeric($lng)) continue;
                    $vIns->execute([(int)$tenantId, $id, $seq, (float)$lat, (float)$lng]);
                    $seq++;
                }
                if ($seq < 3) throw new \Exception('polygon requires vertices (>=3)');
            }

            $pdo->commit();
            Audit::log('geo.fence.create', ['tenant_id' => $tenantId, 'fence_id' => $id, 'type' => $type, 'is_default' => $isDefault], $user);
            echo json_encode(['ok' => true, 'id' => (string)$id]);
        } catch (\Throwable $e) {
            try { $pdo->rollBack(); } catch (\Throwable $e2) {}
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function fencesUpdate()
    {
        Auth::requireRole('perm:geo.manage');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }
        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $id = (int)($in['id'] ?? 0);
        if ($id <= 0) { http_response_code(400); echo json_encode(['error' => 'id required']); return; }

        $stmt = $pdo->prepare('SELECT id, type FROM geo_fences WHERE tenant_id=? AND id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, $id]);
        $existing = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$existing) { http_response_code(404); echo json_encode(['error' => 'Fence not found']); return; }

        $name = trim((string)($in['name'] ?? ''));
        $type = strtolower(trim((string)($in['type'] ?? ($existing['type'] ?? ''))));
        $active = isset($in['active']) ? (int)(!!$in['active']) : null;
        $isDefault = isset($in['is_default']) ? (int)(!!$in['is_default']) : null;
        $timeStart = array_key_exists('time_start', $in) ? trim((string)$in['time_start']) : null;
        $timeEnd = array_key_exists('time_end', $in) ? trim((string)$in['time_end']) : null;

        if ($name === '') { http_response_code(400); echo json_encode(['error' => 'name required']); return; }
        if (!in_array($type, ['circle', 'polygon'], true)) { http_response_code(400); echo json_encode(['error' => 'invalid type']); return; }

        $centerLat = $in['center_lat'] ?? null;
        $centerLng = $in['center_lng'] ?? null;
        $radiusM = $in['radius_m'] ?? null;
        $vertices = $in['vertices'] ?? null;

        if ($type === 'circle') {
            if (!is_numeric($centerLat) || !is_numeric($centerLng) || !is_numeric($radiusM) || (int)$radiusM <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'circle requires center_lat, center_lng, radius_m']);
                return;
            }
        }
        if ($type === 'polygon') {
            if (!is_array($vertices) || count($vertices) < 3) {
                http_response_code(400);
                echo json_encode(['error' => 'polygon requires vertices (>=3)']);
                return;
            }
        }

        try {
            $pdo->beginTransaction();
            if ($isDefault === 1) {
                $pdo->prepare('UPDATE geo_fences SET is_default=0 WHERE tenant_id=?')->execute([(int)$tenantId]);
            }

            $upd = $pdo->prepare('UPDATE geo_fences SET name=?, type=?, active=COALESCE(?, active), is_default=COALESCE(?, is_default), center_lat=?, center_lng=?, radius_m=?, time_start=?, time_end=? WHERE tenant_id=? AND id=?');
            $upd->execute([
                $name,
                $type,
                $active,
                $isDefault,
                $type === 'circle' ? (float)$centerLat : null,
                $type === 'circle' ? (float)$centerLng : null,
                $type === 'circle' ? (int)$radiusM : null,
                $timeStart === '' ? null : ($timeStart ?: null),
                $timeEnd === '' ? null : ($timeEnd ?: null),
                (int)$tenantId,
                $id,
            ]);

            $pdo->prepare('DELETE FROM geo_fence_vertices WHERE tenant_id=? AND fence_id=?')->execute([(int)$tenantId, $id]);
            if ($type === 'polygon') {
                $vIns = $pdo->prepare('INSERT INTO geo_fence_vertices(tenant_id, fence_id, seq, latitude, longitude) VALUES (?, ?, ?, ?, ?)');
                $seq = 0;
                foreach ($vertices as $v) {
                    $lat = $v['latitude'] ?? ($v['lat'] ?? null);
                    $lng = $v['longitude'] ?? ($v['lng'] ?? null);
                    if (!is_numeric($lat) || !is_numeric($lng)) continue;
                    $vIns->execute([(int)$tenantId, $id, $seq, (float)$lat, (float)$lng]);
                    $seq++;
                }
                if ($seq < 3) throw new \Exception('polygon requires vertices (>=3)');
            }

            $pdo->commit();
            Audit::log('geo.fence.update', ['tenant_id' => $tenantId, 'fence_id' => $id], $user);
            echo json_encode(['ok' => true]);
        } catch (\Throwable $e) {
            try { $pdo->rollBack(); } catch (\Throwable $e2) {}
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function fencesDelete()
    {
        Auth::requireRole('perm:geo.manage');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }
        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $id = (int)($in['id'] ?? 0);
        if ($id <= 0) { http_response_code(400); echo json_encode(['error' => 'id required']); return; }

        $stmt = $pdo->prepare('DELETE FROM geo_fences WHERE tenant_id=? AND id=?');
        $stmt->execute([(int)$tenantId, $id]);
        Audit::log('geo.fence.delete', ['tenant_id' => $tenantId, 'fence_id' => $id], $user);
        echo json_encode(['ok' => true]);
    }

    public function fencesSetDefault()
    {
        Auth::requireRole('perm:geo.manage');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }
        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $id = (int)($in['id'] ?? 0);
        if ($id <= 0) { http_response_code(400); echo json_encode(['error' => 'id required']); return; }

        $chk = $pdo->prepare('SELECT id FROM geo_fences WHERE tenant_id=? AND id=? LIMIT 1');
        $chk->execute([(int)$tenantId, $id]);
        if (!$chk->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Fence not found']); return; }

        $pdo->prepare('UPDATE geo_fences SET is_default=0 WHERE tenant_id=?')->execute([(int)$tenantId]);
        $pdo->prepare('UPDATE geo_fences SET is_default=1 WHERE tenant_id=? AND id=?')->execute([(int)$tenantId, $id]);
        Audit::log('geo.fence.set_default', ['tenant_id' => $tenantId, 'fence_id' => $id], $user);
        echo json_encode(['ok' => true]);
    }

    public function assignmentsList()
    {
        Auth::requireRole('perm:geo.manage');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }
        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $stmt = $pdo->prepare('SELECT guf.employee_id, e.name AS employee_name, e.code AS employee_code, guf.fence_id, gf.name AS fence_name, gf.type AS fence_type, gf.is_default AS fence_is_default, guf.updated_at FROM geo_user_fences guf JOIN employees e ON e.id=guf.employee_id AND e.tenant_id=guf.tenant_id JOIN geo_fences gf ON gf.id=guf.fence_id AND gf.tenant_id=guf.tenant_id WHERE guf.tenant_id=? ORDER BY guf.updated_at DESC LIMIT 5000');
        $stmt->execute([(int)$tenantId]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'employee_id' => (string)$r['employee_id'],
                'employee_name' => (string)$r['employee_name'],
                'employee_code' => (string)$r['employee_code'],
                'fence_id' => (string)$r['fence_id'],
                'fence_name' => (string)$r['fence_name'],
                'fence_type' => (string)$r['fence_type'],
                'updated_at' => (string)($r['updated_at'] ?? ''),
            ];
        }
        echo json_encode(['assignments' => $out]);
    }

    public function assignmentsSet()
    {
        Auth::requireRole('perm:geo.manage');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }
        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $employeeId = (int)($in['employee_id'] ?? 0);
        $fenceId = isset($in['fence_id']) ? (int)$in['fence_id'] : 0;
        if ($employeeId <= 0) { http_response_code(400); echo json_encode(['error' => 'employee_id required']); return; }

        $eChk = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $eChk->execute([(int)$tenantId, $employeeId]);
        if (!$eChk->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Employee not found']); return; }

        if ($fenceId <= 0) {
            $pdo->prepare('DELETE FROM geo_user_fences WHERE tenant_id=? AND employee_id=?')->execute([(int)$tenantId, $employeeId]);
            Audit::log('geo.assignment.clear', ['tenant_id' => $tenantId, 'employee_id' => $employeeId], $user);
            echo json_encode(['ok' => true]);
            return;
        }

        $fChk = $pdo->prepare('SELECT 1 FROM geo_fences WHERE tenant_id=? AND id=? LIMIT 1');
        $fChk->execute([(int)$tenantId, $fenceId]);
        if (!$fChk->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Fence not found']); return; }

        $stmt = $pdo->prepare('INSERT INTO geo_user_fences(tenant_id, employee_id, fence_id, active) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE fence_id=VALUES(fence_id), active=1');
        $stmt->execute([(int)$tenantId, $employeeId, $fenceId]);
        Audit::log('geo.assignment.set', ['tenant_id' => $tenantId, 'employee_id' => $employeeId, 'fence_id' => $fenceId], $user);
        echo json_encode(['ok' => true]);
    }

    public function settingsGet()
    {
        Auth::requireRole('perm:geo.manage');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }
        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $this->ensureSettings($pdo, (int)$tenantId);
        $stmt = $pdo->prepare('SELECT enabled, update_interval_sec, min_accuracy_m, offline_after_sec, require_fence FROM geo_settings WHERE tenant_id=? LIMIT 1');
        $stmt->execute([(int)$tenantId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        echo json_encode([
            'settings' => [
                'enabled' => (int)($row['enabled'] ?? 0),
                'update_interval_sec' => (int)($row['update_interval_sec'] ?? 30),
                'min_accuracy_m' => isset($row['min_accuracy_m']) ? (int)$row['min_accuracy_m'] : null,
                'offline_after_sec' => (int)($row['offline_after_sec'] ?? 180),
                'require_fence' => (int)($row['require_fence'] ?? 0),
            ]
        ]);
    }

    public function settingsSet()
    {
        Auth::requireRole('perm:geo.manage');
        header('Content-Type: application/json');

        $user = Auth::currentUser();
        if (!$user) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); return; }
        $pdo = Database::get();
        if (!$pdo) { http_response_code(500); echo json_encode(['error' => 'DB not available']); return; }

        $tenantId = $this->resolveTenantId($user, $pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error' => 'tenant not resolved']); return; }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $enabled = isset($in['enabled']) ? (int)(!!$in['enabled']) : null;
        $interval = isset($in['update_interval_sec']) ? (int)$in['update_interval_sec'] : null;
        $minAcc = array_key_exists('min_accuracy_m', $in) ? ($in['min_accuracy_m'] === null ? null : (int)$in['min_accuracy_m']) : null;
        $offline = isset($in['offline_after_sec']) ? (int)$in['offline_after_sec'] : null;
        $requireFence = isset($in['require_fence']) ? (int)(!!$in['require_fence']) : null;

        if ($interval !== null && ($interval < 10 || $interval > 600)) { http_response_code(400); echo json_encode(['error' => 'update_interval_sec must be 10..600']); return; }
        if ($offline !== null && ($offline < 30 || $offline > 7200)) { http_response_code(400); echo json_encode(['error' => 'offline_after_sec must be 30..7200']); return; }
        if ($minAcc !== null && ($minAcc < 5 || $minAcc > 2000)) { http_response_code(400); echo json_encode(['error' => 'min_accuracy_m must be 5..2000']); return; }

        $this->ensureSettings($pdo, (int)$tenantId);

        $stmt = $pdo->prepare('UPDATE geo_settings SET enabled=COALESCE(?, enabled), update_interval_sec=COALESCE(?, update_interval_sec), min_accuracy_m=?, offline_after_sec=COALESCE(?, offline_after_sec), require_fence=COALESCE(?, require_fence) WHERE tenant_id=?');
        $stmt->execute([
            $enabled,
            $interval,
            $minAcc,
            $offline,
            $requireFence,
            (int)$tenantId
        ]);
        Audit::log('geo.settings.update', ['tenant_id' => $tenantId], $user);
        echo json_encode(['ok' => true]);
    }
}

