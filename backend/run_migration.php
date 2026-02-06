<?php
require_once __DIR__ . '/src/Core/Database.php';
use App\Core\Database;

$pdo = null;
for ($i = 0; $i < 60; $i++) {
    $pdo = Database::get();
    if ($pdo) break;
    usleep(500000);
}
if (!$pdo) {
    echo "DB Connection failed\n";
    exit(1);
}

function splitSqlStatements(string $sql): array
{
    $out = [];
    $buf = '';
    $len = strlen($sql);

    $inSingle = false;
    $inDouble = false;
    $inBacktick = false;
    $inLineComment = false;
    $inBlockComment = false;

    for ($i = 0; $i < $len; $i++) {
        $ch = $sql[$i];
        $next = $i + 1 < $len ? $sql[$i + 1] : '';

        if ($inLineComment) {
            $buf .= $ch;
            if ($ch === "\n") $inLineComment = false;
            continue;
        }

        if ($inBlockComment) {
            $buf .= $ch;
            if ($ch === '*' && $next === '/') {
                $buf .= $next;
                $i++;
                $inBlockComment = false;
            }
            continue;
        }

        if (!$inSingle && !$inDouble && !$inBacktick) {
            if ($ch === '-' && $next === '-') {
                $prev = $i > 0 ? $sql[$i - 1] : '';
                if ($prev === '' || $prev === "\n" || $prev === "\r" || $prev === "\t" || $prev === ' ') {
                    $buf .= $ch . $next;
                    $i++;
                    $inLineComment = true;
                    continue;
                }
            }

            if ($ch === '#') {
                $buf .= $ch;
                $inLineComment = true;
                continue;
            }

            if ($ch === '/' && $next === '*') {
                $buf .= $ch . $next;
                $i++;
                $inBlockComment = true;
                continue;
            }
        }

        if ($ch === "'" && !$inDouble && !$inBacktick) {
            if ($inSingle) {
                $backslashes = 0;
                for ($j = $i - 1; $j >= 0 && $sql[$j] === '\\'; $j--) $backslashes++;
                if (($backslashes % 2) === 0) $inSingle = false;
            } else {
                $inSingle = true;
            }
            $buf .= $ch;
            continue;
        }

        if ($ch === '"' && !$inSingle && !$inBacktick) {
            if ($inDouble) {
                $backslashes = 0;
                for ($j = $i - 1; $j >= 0 && $sql[$j] === '\\'; $j--) $backslashes++;
                if (($backslashes % 2) === 0) $inDouble = false;
            } else {
                $inDouble = true;
            }
            $buf .= $ch;
            continue;
        }

        if ($ch === '`' && !$inSingle && !$inDouble) {
            $inBacktick = !$inBacktick;
            $buf .= $ch;
            continue;
        }

        if ($ch === ';' && !$inSingle && !$inDouble && !$inBacktick) {
            $stmt = trim($buf);
            if ($stmt !== '') $out[] = $stmt;
            $buf = '';
            continue;
        }

        $buf .= $ch;
    }

    $tail = trim($buf);
    if ($tail !== '') $out[] = $tail;
    return $out;
}

$files = [
    __DIR__ . '/migration_shifts.sql',
    __DIR__ . '/migration_employee_profile.sql',
    __DIR__ . '/migration_zkteco.sql',
    __DIR__ . '/migration_payroll.sql',
    __DIR__ . '/migration_payroll_v2.sql',
];

try {
    foreach ($files as $path) {
        if (!is_file($path)) continue;
        $sql = (string)file_get_contents($path);
        if ($sql === '') continue;

        $statements = splitSqlStatements($sql);
        foreach ($statements as $idx => $stmt) {
            try {
                if (preg_match('/^\s*select\b/i', $stmt)) {
                    $q = $pdo->query($stmt);
                    if ($q) $q->fetchAll();
                    continue;
                }
                $pdo->exec($stmt);
            } catch (PDOException $e) {
                // Ignore "Duplicate column name" (1060) and "Duplicate key name" (1061)
                $errCode = $e->errorInfo[1] ?? 0;
                if ($errCode == 1060 || $errCode == 1061) {
                    echo "Skipping duplicate: " . $e->getMessage() . "\n";
                    continue;
                }

                $preview = preg_replace('/\s+/', ' ', trim($stmt));
                $preview = substr((string)$preview, 0, 220);
                echo "Migration statement failed: " . basename($path) . " #" . ($idx + 1) . " " . $preview . "\n";
                throw $e;
            }
        }
    }
    echo "Migrations executed successfully.\n";
} catch (PDOException $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
