<?php

namespace App\Core;

class TenantResolver
{
    public function resolve()
    {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        
        // Remove port if present
        $host = explode(':', $host)[0];
        $host = strtolower(trim((string)$host));

        // Basic Logic:
        // 1. ROOT_DOMAIN / www.ROOT_DOMAIN -> system/root portal
        // 2. sub.ROOT_DOMAIN -> tenant 'sub'
        // 3. other domains -> try first label as tenant subdomain

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

        $rootDomain = strtolower((string)(getenv('ROOT_DOMAIN') ?: 'khudroo.com'));
        if ($host === $rootDomain || $host === ('www.' . $rootDomain)) {
            return [
                'id' => 'superadmin',
                'name' => 'Root Portal',
                'type' => 'system'
            ];
        }

        $suffix = '.' . $rootDomain;
        if ($rootDomain && str_ends_with($host, $suffix)) {
            $prefix = substr($host, 0, -strlen($suffix));
            if ($prefix !== '' && strpos($prefix, '.') === false && $prefix !== 'www') {
                $subdomain = $prefix;
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

        $parts = explode('.', $host);
        
        // Check for other domains (sub.domain.tld)
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
