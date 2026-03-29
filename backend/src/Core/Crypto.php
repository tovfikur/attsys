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
            if (self::isLocalDev()) {
                $raw = self::generateAndPersistKey();
            }
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

    private static function isLocalDev(): bool
    {
        $env = strtolower(trim((string)(getenv('APP_ENV') ?: '')));
        if (in_array($env, ['local', 'development', 'dev', 'testing'], true)) return true;
        $devFlag = strtolower(trim((string)(getenv('DEV_MODE') ?: '')));
        if (in_array($devFlag, ['1', 'true', 'yes', 'on'], true)) return true;
        $host = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? ''))));
        if ($host === '') return false;
        $host = preg_replace('/:\d+$/', '', $host);
        if ($host === 'localhost' || $host === '127.0.0.1' || $host === '::1') return true;
        if (str_ends_with($host, '.localhost')) return true;
        return false;
    }

    private static function generateAndPersistKey(): ?string
    {
        $candidates = [
            __DIR__ . '/../../.env',
            __DIR__ . '/../../../.env',
        ];
        $target = null;
        $existingValue = null;
        $existingKeyName = null;
        foreach ($candidates as $path) {
            if (file_exists($path)) {
                $contents = file_get_contents($path);
                $contents = $contents === false ? '' : $contents;
                if (preg_match('/^\s*(APP_ENC_KEY|APP_KEY)\s*=\s*(.*)\s*$/m', $contents, $m)) {
                    $existingKeyName = $m[1] ?? null;
                    $existingValue = isset($m[2]) ? trim((string)$m[2]) : '';
                    $target = $path;
                    break;
                }
                $target = $path;
                break;
            }
        }
        if (is_string($existingValue) && $existingValue !== '') {
            putenv("APP_ENC_KEY={$existingValue}");
            return $existingValue;
        }
        $key = base64_encode(random_bytes(32));
        if ($target === null) {
            foreach ($candidates as $path) {
                $dir = dirname($path);
                if (is_dir($dir) && is_writable($dir)) {
                    $target = $path;
                    break;
                }
            }
        }
        if ($target === null) {
            putenv("APP_ENC_KEY={$key}");
            return $key;
        }
        if (is_writable($target)) {
            $contents = file_get_contents($target);
            $contents = $contents === false ? '' : $contents;
            if (preg_match('/^\s*(APP_ENC_KEY|APP_KEY)\s*=\s*(.*)\s*$/m', $contents)) {
                $contents = preg_replace(
                    '/^\s*(APP_ENC_KEY|APP_KEY)\s*=.*$/m',
                    "APP_ENC_KEY={$key}",
                    $contents,
                );
                file_put_contents($target, rtrim($contents) . "\n", LOCK_EX);
            } else {
                $line = "APP_ENC_KEY={$key}\n";
                file_put_contents($target, $line, FILE_APPEND | LOCK_EX);
            }
        }
        putenv("APP_ENC_KEY={$key}");
        return $key;
    }
}
