<?php

namespace App\Core;

class EmployeesStore
{
    private $file = __DIR__ . '/../../data/employees.json';

    public function all()
    {
        $pdo = Database::get();
        if ($pdo) {
            $stmt = $pdo->query('SELECT id, tenant_id, name, code, status, created_at FROM employees ORDER BY id DESC');
            return array_map(fn($r) => [
                'id' => (string)$r['id'],
                'tenant_id' => (string)$r['tenant_id'],
                'name' => $r['name'],
                'code' => $r['code'],
                'status' => $r['status'],
                'created_at' => $r['created_at']
            ], $stmt->fetchAll());
        }
        if (!file_exists($this->file)) return [];
        return json_decode(file_get_contents($this->file), true) ?? [];
    }

    public function create($name, $code)
    {
        $pdo = Database::get();
        if ($pdo) {
            $user = Auth::currentUser();
            $tenantId = $user['tenant_id'] ?? null;
            
            if (!$tenantId) {
                 // Try from header if not in user context (e.g. API token)
                $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
                if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
            }
            
            if (!$tenantId) throw new \Exception('Tenant context missing');

            // Unique per tenant
            $stmt = $pdo->prepare('SELECT id FROM employees WHERE tenant_id=? AND code=?');
            $stmt->execute([$tenantId, $code]);
            if ($stmt->fetch()) throw new \Exception('Employee code exists');
            $stmt = $pdo->prepare('INSERT INTO employees (tenant_id, name, code, status) VALUES (?, ?, ?, ?)');
            $stmt->execute([$tenantId, $name, $code, 'active']);
            return [
                'id' => (string)$pdo->lastInsertId(),
                'tenant_id' => (string)$tenantId,
                'name' => $name,
                'code' => $code,
                'status' => 'active',
                'created_at' => date('c')
            ];
        }
        $list = $this->all();
        foreach ($list as $e) if ($e['code'] === $code) throw new \Exception('Employee code exists');
        $item = [
            'id' => uniqid('emp_'),
            'name' => $name,
            'code' => $code,
            'status' => 'active',
            'created_at' => date('c')
        ];
        $list[] = $item;
        file_put_contents($this->file, json_encode($list, JSON_PRETTY_PRINT));
        return $item;
    }

    public function update($id, $name, $code, $status)
    {
        $pdo = Database::get();
        if ($pdo) {
            $stmt = $pdo->prepare('UPDATE employees SET name=?, code=?, status=? WHERE id=?');
            $stmt->execute([$name, $code, $status, $id]);
            $stmt = $pdo->prepare('SELECT id, tenant_id, name, code, status, created_at FROM employees WHERE id=?');
            $stmt->execute([$id]);
            $e = $stmt->fetch();
            if (!$e) throw new \Exception('Not found');
            return $e;
        }
        $list = $this->all();
        foreach ($list as &$e) {
            if ($e['id'] === $id) {
                $e['name'] = $name;
                $e['code'] = $code;
                $e['status'] = $status;
                file_put_contents($this->file, json_encode($list, JSON_PRETTY_PRINT));
                return $e;
            }
        }
        throw new \Exception('Not found');
    }

    public function delete($id)
    {
        $pdo = Database::get();
        if ($pdo) {
            $stmt = $pdo->prepare('DELETE FROM employees WHERE id=?');
            $stmt->execute([$id]);
            return true;
        }
        $list = $this->all();
        $list = array_values(array_filter($list, fn($e) => $e['id'] !== $id));
        file_put_contents($this->file, json_encode($list, JSON_PRETTY_PRINT));
        return true;
    }
}
