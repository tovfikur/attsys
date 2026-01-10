<?php

namespace App\Core;

class CloudflareClient
{
    private $token;
    private $zoneId;

    public function __construct()
    {
        $this->token = getenv('CLOUDFLARE_API_TOKEN') ?: null;
        $this->zoneId = getenv('CLOUDFLARE_ZONE_ID') ?: null;
    }

    public function configured(): bool
    {
        return (bool)($this->token && $this->zoneId);
    }

    public function createDnsCname(string $name, string $target, bool $proxied = true, int $ttl = 1): array
    {
        if (!$this->configured()) {
            return ['ok' => false, 'error' => 'Cloudflare not configured'];
        }
        // Stub – In production, perform an authenticated POST to Cloudflare API.
        return ['ok' => true, 'record' => ['type' => 'CNAME', 'name' => $name, 'content' => $target, 'proxied' => $proxied, 'ttl' => $ttl]];
    }
}

