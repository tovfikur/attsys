<?php

namespace App\Core;

class TenantResolver
{
    public function resolve()
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        
        // Remove port if present
        $host = explode(':', $host)[0];

        // Basic Logic:
        // 1. localhost -> superadmin/dev
        // 2. sub.localhost -> tenant 'sub' (for local testing)
        // 3. sub.domain.com -> tenant 'sub'

        // Tenant hint header takes precedence in dev
        if ($hint) {
            $subdomain = strtolower($hint);
            $store = new TenantStore();
            $tenant = $store->findBySubdomain($subdomain);
            if ($tenant) {
                return [
                   'id' => $tenant['id'],
                   'name' => $tenant['name'],
                   'type' => 'tenant'
                ];
            }
        }

        if ($host === 'localhost' || $host === '127.0.0.1') {
            return [
                'id' => 'superadmin',
                'name' => 'Super Admin Portal',
                'type' => 'system'
            ];
        }

        $parts = explode('.', $host);
        
        // Check for real domain (sub.domain.tld) or sub.localhost
        if (count($parts) >= 2) {
             $subdomain = $parts[0];

             // Lookup tenant by subdomain (DB if available)
             $store = new TenantStore();
             $tenant = $store->findBySubdomain($subdomain);

             if ($tenant) {
                 return [
                    'id' => $tenant['id'],
                    'name' => $tenant['name'],
                    'type' => 'tenant'
                 ];
             }
        }

        return null;
    }
}
