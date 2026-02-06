<?php

namespace App\Core;

final class Crypto
{
    public static function encryptString(?string $plaintext): ?string
    {
        if ($plaintext === null) return null;
        $plaintext = (string)$plaintext;
        if ($plaintext === '') return '';

        $key = self::key();
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($ciphertext === false) {
            throw new \RuntimeException('Encryption failed');
        }

        return 'v1:' . base64_encode($iv) . ':' . base64_encode($tag) . ':' . base64_encode($ciphertext);
    }

    public static function decryptString(?string $payload): ?string
    {
        if ($payload === null) return null;
        $payload = (string)$payload;
        if ($payload === '') return '';
        if (!str_starts_with($payload, 'v1:')) return $payload;

        $parts = explode(':', $payload, 4);
        if (count($parts) !== 4) return $payload;
        $iv = base64_decode($parts[1], true);
        $tag = base64_decode($parts[2], true);
        $ciphertext = base64_decode($parts[3], true);
        if ($iv === false || $tag === false || $ciphertext === false) return $payload;

        $key = self::key();
        $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($plaintext === false) return $payload;
        return $plaintext;
    }

    private static function key(): string
    {
        $raw = getenv('APP_ENC_KEY');
        if ($raw === false || trim((string)$raw) === '') {
            $raw = getenv('APP_KEY');
        }
        if ($raw === false || trim((string)$raw) === '') {
            throw new \RuntimeException('APP_ENC_KEY (or APP_KEY) is required for encryption');
        }

        $raw = trim((string)$raw);
        $decoded = base64_decode($raw, true);
        $key = $decoded !== false ? $decoded : $raw;
        if (strlen($key) < 32) {
            $key = hash('sha256', $key, true);
        }
        return substr($key, 0, 32);
    }
}

