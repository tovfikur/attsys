<?php

namespace App\Core;

use PDO;
use PDOException;

class Database
{
    private static ?PDO $pdo = null;

    public static function get(): ?PDO
    {
        if (self::$pdo) return self::$pdo;
        // Load .env from project root
        $envPath = __DIR__ . '/../../.env';
        if (file_exists($envPath)) {
            $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (str_starts_with($line, '#')) continue;
                [$k, $v] = array_map('trim', explode('=', $line, 2));
                if ($k && $v && !getenv($k)) putenv("$k=$v");
            }
        }

        $host = getenv('DB_HOST') ?: 'db';
        $port = getenv('DB_PORT') ?: '3306';
        $db   = getenv('DB_NAME') ?: 'attendance_saas';
        $user = getenv('DB_USER') ?: 'attendance';
        $pass = getenv('DB_PASS') ?: 'attpass';

        $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
        try {
            self::$pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            return self::$pdo;
        } catch (PDOException $e) {
            return null; // Fallback allowed in dev
        }
    }
}
