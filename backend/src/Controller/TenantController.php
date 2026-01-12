<?php

namespace App\Controller;

use App\Core\TenantStore;
use App\Core\Database;
use App\Core\Audit;

class TenantController
{
    private $store;

    public function __construct()
    {
        $this->store = new TenantStore();
    }

    public function index()
    {
        header('Content-Type: application/json');
        echo json_encode(['tenants' => $this->store->getAll()]);
    }

    public function create()
    {
        header('Content-Type: application/json');
        
        $input = json_decode(file_get_contents('php://input'), true);
        $name = $input['name'] ?? '';
        $subdomain = $input['subdomain'] ?? '';
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $password = (string)($input['password'] ?? '');
        $note = isset($input['note']) ? trim((string)$input['note']) : null;
        if ($note === '') $note = null;

        if (empty($name) || empty($subdomain)) {
            http_response_code(400);
            echo json_encode(['error' => 'Name and subdomain are required']);
            return;
        }

        // Basic validation for subdomain (a-z0-9-)
        if (!preg_match('/^[a-z0-9-]+$/', $subdomain)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid subdomain format']);
            return;
        }

        if ($email !== '' || $password !== '') {
            if ($email === '' || $password === '') {
                http_response_code(400);
                echo json_encode(['error' => 'email and password are required to create the tenant owner']);
                return;
            }
            if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid email']);
                return;
            }
            if (strlen($password) < 6) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must be at least 6 characters']);
                return;
            }
        }

        try {
            $tenant = $this->store->create($name, $subdomain, $note);

            $tenantUser = null;
            if ($email !== '' && $password !== '') {
                $pdo = Database::get();
                if ($pdo) {
                    $tStmt = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=? LIMIT 1');
                    $tStmt->execute([strtolower((string)$subdomain)]);
                    $tenantId = (int)($tStmt->fetchColumn() ?: 0);
                    if ($tenantId > 0) {
                        $hash = password_hash($password, PASSWORD_DEFAULT);
                        $existingStmt = $pdo->prepare('SELECT id FROM tenant_users WHERE tenant_id=? AND email=? LIMIT 1');
                        $existingStmt->execute([$tenantId, $email]);
                        $existingId = (int)($existingStmt->fetchColumn() ?: 0);
                        if ($existingId > 0) {
                            $upd = $pdo->prepare('UPDATE tenant_users SET password_hash=?, status="active" WHERE id=? AND tenant_id=?');
                            $upd->execute([$hash, $existingId, $tenantId]);
                            $tenantUser = ['id' => $existingId, 'email' => $email];
                        } else {
                            $ins = $pdo->prepare('INSERT INTO tenant_users (tenant_id, email, name, role, password_hash, status) VALUES (?, ?, ?, ?, ?, ?)');
                            $ins->execute([$tenantId, $email, 'Tenant Owner', 'tenant_owner', $hash, 'active']);
                            $tenantUser = ['id' => (int)$pdo->lastInsertId(), 'email' => $email];
                        }
                        Audit::log('tenant.owner_created', ['tenant_id' => $tenantId, 'email' => $email]);
                    }
                }
            }

            // Attempt Cloudflare provisioning (stubbed)
            $cf = new \App\Core\CloudflareClient();
            $rootDomain = strtolower((string)(getenv('ROOT_DOMAIN') ?: 'khudroo.com'));
            $target = (string)(getenv('TENANT_CNAME_TARGET') ?: $rootDomain);
            $cfRes = $cf->createDnsCname($subdomain, $target);
            Audit::log('tenant.create', ['tenant' => $tenant, 'cloudflare' => $cfRes]);
            echo json_encode(['message' => 'Tenant created successfully', 'tenant' => $tenant, 'tenant_user' => $tenantUser, 'cloudflare' => $cfRes]);
        } catch (\Exception $e) {
            http_response_code(409); // Conflict
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function setStatus()
    {
        header('Content-Type: application/json');

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) $input = [];

        $id = $input['id'] ?? null;
        $subdomain = $input['subdomain'] ?? null;
        $status = strtolower(trim((string)($input['status'] ?? '')));

        if ($status === '' || !in_array($status, ['active', 'inactive'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid status']);
            return;
        }

        $identifier = null;
        if ($id !== null && $id !== '') $identifier = $id;
        if ($identifier === null && $subdomain !== null && $subdomain !== '') $identifier = strtolower(trim((string)$subdomain));

        if ($identifier === null || $identifier === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant id or subdomain required']);
            return;
        }

        try {
            $tenant = $this->store->setStatus($identifier, $status);
            Audit::log('tenant.status_update', ['tenant' => $tenant]);
            echo json_encode(['ok' => true, 'tenant' => $tenant]);
        } catch (\InvalidArgumentException $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } catch (\Exception $e) {
            http_response_code(404);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
}
