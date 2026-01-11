<?php

namespace App\Controller;

use App\Core\TenantStore;

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

        try {
            $tenant = $this->store->create($name, $subdomain);
            // Attempt Cloudflare provisioning (stubbed)
            $cf = new \App\Core\CloudflareClient();
            $rootDomain = strtolower((string)(getenv('ROOT_DOMAIN') ?: 'khudroo.com'));
            $target = (string)(getenv('TENANT_CNAME_TARGET') ?: $rootDomain);
            $cfRes = $cf->createDnsCname($subdomain, $target);
            \App\Core\Audit::log('tenant.create', ['tenant' => $tenant, 'cloudflare' => $cfRes]);
            echo json_encode(['message' => 'Tenant created successfully', 'tenant' => $tenant, 'cloudflare' => $cfRes]);
        } catch (\Exception $e) {
            http_response_code(409); // Conflict
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
}
