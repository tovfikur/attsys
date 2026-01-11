<?php

namespace App\Core;

class TenantResolver
{
    public function resolve()
    {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        
        $host = strtolower(trim((string)$host));
        $host = preg_replace('/\.$/', '', $host);
        if (preg_match('/^\[([0-9a-f:]+)\](?::\d+)?$/i', $host, $m)) {
            $host = $m[1];
        } else {
            $host = preg_replace('/:\d+$/', '', $host);
        }

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

        $twoPartPublicSuffixes = [
            'ac.in',
            'ac.jp',
            'ac.nz',
            'ac.uk',
            'co.in',
            'co.jp',
            'co.nz',
            'co.uk',
            'com.ar',
            'com.au',
            'com.bd',
            'com.br',
            'com.cn',
            'com.eg',
            'com.hk',
            'com.mx',
            'com.my',
            'com.ng',
            'com.pk',
            'com.sa',
            'com.sg',
            'com.tr',
            'com.tw',
            'com.ua',
            'edu.au',
            'gov.au',
            'gov.in',
            'gov.uk',
            'govt.nz',
            'net.au',
            'net.in',
            'ne.jp',
            'or.jp',
            'org.au',
            'org.in',
            'org.nz',
            'org.uk',
            'sch.uk',
        ];

        $isIpHost = function (string $h): bool {
            return filter_var($h, FILTER_VALIDATE_IP) !== false;
        };

        $inferRootDomainFromHost = function (string $h) use ($isIpHost, $twoPartPublicSuffixes): string {
            $h = strtolower(trim($h));
            $h = preg_replace('/\.$/', '', $h);
            if ($h === '' || $h === 'localhost' || $isIpHost($h)) return '';
            if (str_ends_with($h, '.localhost')) return 'localhost';

            if (str_starts_with($h, 'www.')) $h = substr($h, 4);

            $parts = array_values(array_filter(explode('.', $h), fn($p) => $p !== ''));
            if (count($parts) <= 2) return $h;

            $suffix2 = $parts[count($parts) - 2] . '.' . $parts[count($parts) - 1];
            if (in_array($suffix2, $twoPartPublicSuffixes, true) && count($parts) >= 3) {
                return $parts[count($parts) - 3] . '.' . $suffix2;
            }

            return $suffix2;
        };

        $rootDomain = strtolower((string)(getenv('ROOT_DOMAIN') ?: ''));
        if ($rootDomain === '') {
            $rootDomain = $inferRootDomainFromHost($host);
        }

        if ($rootDomain === '') {
            if ($host === 'localhost' || $isIpHost($host)) {
                return [
                    'id' => 'superadmin',
                    'name' => 'Root Portal',
                    'type' => 'system'
                ];
            }
        }

        if ($host === $rootDomain || $host === ('www.' . $rootDomain)) {
            return [
                'id' => 'superadmin',
                'name' => 'Root Portal',
                'type' => 'system'
            ];
        }

        if (str_ends_with($host, '.localhost')) {
            $prefix = substr($host, 0, -strlen('.localhost'));
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

        $suffix = '.' . $rootDomain;
        if ($rootDomain !== '' && str_ends_with($host, $suffix)) {
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

        return null;
    }
}
