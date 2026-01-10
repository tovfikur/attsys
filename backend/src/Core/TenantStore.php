<?php

namespace App\Core;

class TenantStore
{
    private $file = __DIR__ . '/../../data/tenants.json';

    public function getAll()
    {
        $pdo = Database::get();
        if ($pdo) {
            $stmt = $pdo->query('SELECT id, subdomain, name, status, created_at FROM tenants ORDER BY id DESC');
            $rows = $stmt->fetchAll();
            return array_map(fn($r) => [
                'id' => (string)$r['id'],
                'name' => $r['name'],
                'subdomain' => $r['subdomain'],
                'status' => $r['status'],
                'created_at' => $r['created_at']
            ], $rows);
        }
        if (!file_exists($this->file)) {
            return [];
        }
        return json_decode(file_get_contents($this->file), true) ?? [];
    }

    public function findBySubdomain($subdomain)
    {
        $pdo = Database::get();
        if ($pdo) {
            $stmt = $pdo->prepare('SELECT id, subdomain, name, status, created_at FROM tenants WHERE subdomain=? LIMIT 1');
            $stmt->execute([$subdomain]);
            $r = $stmt->fetch();
            if ($r) return [
                'id' => (string)$r['id'],
                'name' => $r['name'],
                'subdomain' => $r['subdomain'],
                'status' => $r['status'],
                'created_at' => $r['created_at']
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

    public function create($name, $subdomain)
    {
        $pdo = Database::get();
        if ($pdo) {
            // duplicate check
            $exists = $this->findBySubdomain($subdomain);
            if ($exists) throw new \Exception("Subdomain '$subdomain' already exists.");
            $stmt = $pdo->prepare('INSERT INTO tenants (subdomain, name, status) VALUES (?, ?, ?)');
            $stmt->execute([strtolower($subdomain), $name, 'active']);
            $id = $pdo->lastInsertId();
            return [
                'id' => (string)$id,
                'name' => $name,
                'subdomain' => strtolower($subdomain),
                'status' => 'active',
                'created_at' => date('c')
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
            'created_at' => date('c')
        ];
        $tenants[] = $newTenant;
        file_put_contents($this->file, json_encode($tenants, JSON_PRETTY_PRINT));
        return $newTenant;
    }
}
