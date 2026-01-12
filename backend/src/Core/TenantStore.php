<?php

namespace App\Core;

class TenantStore
{
    private $file = __DIR__ . '/../../data/tenants.json';

    private function ensureNoteColumn(\PDO $pdo): bool
    {
        try {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenants' AND column_name = 'note'");
            $stmt->execute();
            $has = (int)$stmt->fetchColumn() > 0;
            if ($has) return true;
            $pdo->exec("ALTER TABLE tenants ADD COLUMN note TEXT NULL");
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public function getAll()
    {
        $pdo = Database::get();
        if ($pdo) {
            $hasNote = $this->ensureNoteColumn($pdo);
            $sql = $hasNote
                ? 'SELECT id, subdomain, name, status, created_at, note FROM tenants ORDER BY id DESC'
                : 'SELECT id, subdomain, name, status, created_at FROM tenants ORDER BY id DESC';
            $stmt = $pdo->query($sql);
            $rows = $stmt->fetchAll();
            return array_map(fn($r) => [
                'id' => (string)$r['id'],
                'name' => $r['name'],
                'subdomain' => $r['subdomain'],
                'status' => $r['status'],
                'created_at' => $r['created_at'],
                'note' => array_key_exists('note', $r) ? $r['note'] : null,
            ], $rows);
        }
        if (!file_exists($this->file)) {
            return [];
        }
        $rows = json_decode(file_get_contents($this->file), true) ?? [];
        if (!is_array($rows)) return [];
        return array_map(function ($r) {
            if (!is_array($r)) return $r;
            if (!array_key_exists('note', $r)) $r['note'] = null;
            return $r;
        }, $rows);
    }

    public function findBySubdomain($subdomain)
    {
        $pdo = Database::get();
        if ($pdo) {
            $hasNote = $this->ensureNoteColumn($pdo);
            $sql = $hasNote
                ? 'SELECT id, subdomain, name, status, created_at, note FROM tenants WHERE subdomain=? LIMIT 1'
                : 'SELECT id, subdomain, name, status, created_at FROM tenants WHERE subdomain=? LIMIT 1';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$subdomain]);
            $r = $stmt->fetch();
            if ($r) return [
                'id' => (string)$r['id'],
                'name' => $r['name'],
                'subdomain' => $r['subdomain'],
                'status' => $r['status'],
                'created_at' => $r['created_at'],
                'note' => array_key_exists('note', $r) ? $r['note'] : null,
            ];
            return null;
        }
        $tenants = $this->getAll();
        foreach ($tenants as $tenant) {
            if ($tenant['subdomain'] === $subdomain) {
                return $tenant;
            }
        }
        return null;
    }

    public function create($name, $subdomain, $note = null)
    {
        $pdo = Database::get();
        if ($pdo) {
            $exists = $this->findBySubdomain($subdomain);
            if ($exists) throw new \Exception("Subdomain '$subdomain' already exists.");

            $this->ensureNoteColumn($pdo);
            $hasNote = false;
            try {
                $cols = $pdo->query("DESCRIBE tenants")->fetchAll(\PDO::FETCH_COLUMN);
                $hasNote = is_array($cols) && in_array('note', $cols);
            } catch (\Throwable $e) {
            }

            if ($hasNote) {
                $stmt = $pdo->prepare('INSERT INTO tenants (subdomain, name, status, note) VALUES (?, ?, ?, ?)');
                $stmt->execute([strtolower($subdomain), $name, 'active', $note !== null && $note !== '' ? $note : null]);
            } else {
                $stmt = $pdo->prepare('INSERT INTO tenants (subdomain, name, status) VALUES (?, ?, ?)');
                $stmt->execute([strtolower($subdomain), $name, 'active']);
            }

            $id = (int)$pdo->lastInsertId();
            $sel = $hasNote
                ? $pdo->prepare('SELECT id, subdomain, name, status, created_at, note FROM tenants WHERE id=? LIMIT 1')
                : $pdo->prepare('SELECT id, subdomain, name, status, created_at FROM tenants WHERE id=? LIMIT 1');
            $sel->execute([$id]);
            $r = $sel->fetch(\PDO::FETCH_ASSOC) ?: [];
            return [
                'id' => (string)($r['id'] ?? $id),
                'name' => (string)($r['name'] ?? $name),
                'subdomain' => (string)($r['subdomain'] ?? strtolower($subdomain)),
                'status' => (string)($r['status'] ?? 'active'),
                'created_at' => $r['created_at'] ?? date('c'),
                'note' => array_key_exists('note', $r) ? $r['note'] : ($note !== null && $note !== '' ? $note : null),
            ];
        }
        $tenants = $this->getAll();
        foreach ($tenants as $t) {
            if ($t['subdomain'] === $subdomain) {
                throw new \Exception("Subdomain '$subdomain' already exists.");
            }
        }
        $newTenant = [
            'id' => uniqid('t_'),
            'name' => $name,
            'subdomain' => strtolower($subdomain),
            'status' => 'active',
            'created_at' => date('c'),
            'note' => $note !== null && $note !== '' ? $note : null,
        ];
        $tenants[] = $newTenant;
        file_put_contents($this->file, json_encode($tenants, JSON_PRETTY_PRINT));
        return $newTenant;
    }

    public function setStatus($idOrSubdomain, string $status): array
    {
        $nextStatus = strtolower(trim($status));
        if (!in_array($nextStatus, ['active', 'inactive'], true)) {
            throw new \InvalidArgumentException('Invalid status');
        }

        $pdo = Database::get();
        if ($pdo) {
            $id = null;
            if (is_numeric($idOrSubdomain)) {
                $id = (int)$idOrSubdomain;
            }

            if ($id !== null && $id > 0) {
                $upd = $pdo->prepare('UPDATE tenants SET status=? WHERE id=?');
                $upd->execute([$nextStatus, $id]);
                if ($upd->rowCount() === 0) {
                    throw new \Exception('Tenant not found');
                }
                $hasNote = $this->ensureNoteColumn($pdo);
                $sel = $hasNote
                    ? $pdo->prepare('SELECT id, subdomain, name, status, created_at, note FROM tenants WHERE id=? LIMIT 1')
                    : $pdo->prepare('SELECT id, subdomain, name, status, created_at FROM tenants WHERE id=? LIMIT 1');
                $sel->execute([$id]);
                $r = $sel->fetch(\PDO::FETCH_ASSOC) ?: [];
                return [
                    'id' => (string)($r['id'] ?? $id),
                    'name' => (string)($r['name'] ?? ''),
                    'subdomain' => (string)($r['subdomain'] ?? ''),
                    'status' => (string)($r['status'] ?? $nextStatus),
                    'created_at' => $r['created_at'] ?? date('c'),
                    'note' => array_key_exists('note', $r) ? $r['note'] : null,
                ];
            }

            $sub = strtolower(trim((string)$idOrSubdomain));
            if ($sub === '') throw new \InvalidArgumentException('Tenant identifier required');
            $upd = $pdo->prepare('UPDATE tenants SET status=? WHERE subdomain=?');
            $upd->execute([$nextStatus, $sub]);
            if ($upd->rowCount() === 0) {
                throw new \Exception('Tenant not found');
            }
            $tenant = $this->findBySubdomain($sub);
            if (!$tenant) throw new \Exception('Tenant not found');
            return $tenant;
        }

        $tenants = $this->getAll();
        $found = false;
        foreach ($tenants as &$t) {
            if (!is_array($t)) continue;
            $idMatch = (string)($t['id'] ?? '') !== '' && (string)($t['id'] ?? '') === (string)$idOrSubdomain;
            $subMatch = strtolower((string)($t['subdomain'] ?? '')) === strtolower((string)$idOrSubdomain);
            if ($idMatch || $subMatch) {
                $t['status'] = $nextStatus;
                $found = true;
                break;
            }
        }
        unset($t);

        if (!$found) throw new \Exception('Tenant not found');
        file_put_contents($this->file, json_encode($tenants, JSON_PRETTY_PRINT));
        foreach ($tenants as $t) {
            if (!is_array($t)) continue;
            $idMatch = (string)($t['id'] ?? '') !== '' && (string)($t['id'] ?? '') === (string)$idOrSubdomain;
            $subMatch = strtolower((string)($t['subdomain'] ?? '')) === strtolower((string)$idOrSubdomain);
            if ($idMatch || $subMatch) {
                if (!array_key_exists('note', $t)) $t['note'] = null;
                if (!array_key_exists('created_at', $t)) $t['created_at'] = date('c');
                return $t;
            }
        }

        throw new \Exception('Tenant not found');
    }
}
