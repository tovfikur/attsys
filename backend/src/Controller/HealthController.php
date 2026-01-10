<?php

namespace App\Controller;

use App\Core\TenantResolver;

class HealthController
{
    public function check()
    {
        header('Content-Type: application/json');
        echo json_encode([
            'status' => 'ok',
            'timestamp' => date('c'),
            'service' => 'Attendance SaaS Backend'
        ]);
    }

    public function tenantInfo()
    {
        $resolver = new TenantResolver();
        $tenant = $resolver->resolve();

        header('Content-Type: application/json');
        echo json_encode([
            'tenant' => $tenant,
            'message' => $tenant ? "Resolved tenant: {$tenant['name']}" : "No tenant resolved (Public/Superadmin)"
        ]);
    }
}
