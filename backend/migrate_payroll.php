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
    fwrite(STDERR, "DB Connection failed\n");
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

function ensureMigrationsTable(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(190) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_schema_migrations_name (name)
        )
    ");
}

function hasMigration(PDO $pdo, string $name): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE name=? LIMIT 1");
    $stmt->execute([$name]);
    return (bool)$stmt->fetchColumn();
}

function markMigration(PDO $pdo, string $name): void
{
    $stmt = $pdo->prepare("INSERT INTO schema_migrations (name) VALUES (?)");
    $stmt->execute([$name]);
}

function tableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    $stmt->execute([$table]);
    return (bool)$stmt->fetchColumn();
}

function columnExists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
    $stmt->execute([$table, $column]);
    return (bool)$stmt->fetchColumn();
}

function indexExists(PDO $pdo, string $table, string $indexName): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1");
    $stmt->execute([$table, $indexName]);
    return (bool)$stmt->fetchColumn();
}

function execSafe(PDO $pdo, string $sql): void
{
    try {
        $pdo->exec($sql);
    } catch (PDOException $e) {
        $errCode = $e->errorInfo[1] ?? 0;
        if (in_array((int)$errCode, [1050, 1060, 1061, 1091], true)) return;
        throw $e;
    }
}

ensureMigrationsTable($pdo);

$steps = [];

$steps[] = [
    'name' => 'payroll.001.create_schema',
    'run' => function () use ($pdo) {
        $path = __DIR__ . '/migration_payroll.sql';
        $sql = (string)@file_get_contents($path);
        if ($sql === '') return;
        $stmts = splitSqlStatements($sql);
        foreach ($stmts as $stmt) {
            if (preg_match('/^\s*select\b/i', $stmt)) {
                $q = $pdo->query($stmt);
                if ($q) $q->fetchAll();
                continue;
            }
            execSafe($pdo, $stmt);
        }
    },
];

$steps[] = [
    'name' => 'payroll.001a.payslips_working_day_fields',
    'run' => function () use ($pdo) {
        if (!tableExists($pdo, 'payslips')) return;
        if (!columnExists($pdo, 'payslips', 'absent_days')) {
            execSafe($pdo, "ALTER TABLE payslips ADD COLUMN absent_days DECIMAL(5,2) DEFAULT 0");
        }
        if (!columnExists($pdo, 'payslips', 'weekly_off_days')) {
            execSafe($pdo, "ALTER TABLE payslips ADD COLUMN weekly_off_days INT DEFAULT 0");
        }
        if (!columnExists($pdo, 'payslips', 'payable_days')) {
            execSafe($pdo, "ALTER TABLE payslips ADD COLUMN payable_days DECIMAL(5,2) DEFAULT 0");
        }
    },
];

$steps[] = [
    'name' => 'payroll.001b.employee_bank_accounts_ciphertext_columns',
    'run' => function () use ($pdo) {
        if (!tableExists($pdo, 'employee_bank_accounts')) return;
        if (columnExists($pdo, 'employee_bank_accounts', 'account_number')) {
            execSafe($pdo, "ALTER TABLE employee_bank_accounts MODIFY account_number TEXT NOT NULL");
        }
        if (columnExists($pdo, 'employee_bank_accounts', 'branch_code')) {
            execSafe($pdo, "ALTER TABLE employee_bank_accounts MODIFY branch_code TEXT NULL");
        }
    },
];

$steps[] = [
    'name' => 'payroll.002.upgrade_payroll_settings',
    'run' => function () use ($pdo) {
        if (!tableExists($pdo, 'payroll_settings')) return;
        if (columnExists($pdo, 'payroll_settings', 'setting_key')) return;

        $wideCols = [
            'currency_symbol' => 'currency_symbol',
            'currency_code' => 'currency_code',
            'tax_calculation_method' => 'tax_calculation_method',
            'pf_employee_contribution_percent' => 'pf_employee_contribution_percent',
            'pf_employer_contribution_percent' => 'pf_employer_contribution_percent',
            'overtime_hourly_rate_formula' => 'overtime_hourly_rate_formula',
            'overtime_rate_multiplier' => 'overtime_rate_multiplier',
            'work_hours_per_day' => 'work_hours_per_day',
            'days_per_month' => 'days_per_month',
        ];

        $kvTable = 'payroll_settings_kv';
        execSafe($pdo, "
            CREATE TABLE IF NOT EXISTS {$kvTable} (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL,
                setting_key VARCHAR(50) NOT NULL,
                setting_value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_setting (tenant_id, setting_key)
            )
        ");

        foreach ($wideCols as $col => $key) {
            if (!columnExists($pdo, 'payroll_settings', $col)) continue;
            $stmt = "
                INSERT INTO {$kvTable} (tenant_id, setting_key, setting_value)
                SELECT tenant_id, " . $pdo->quote($key) . ", CAST({$col} AS CHAR)
                FROM payroll_settings
                WHERE {$col} IS NOT NULL
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
            ";
            execSafe($pdo, $stmt);
        }

        $legacy = 'payroll_settings_legacy_' . date('YmdHis');
        execSafe($pdo, "RENAME TABLE payroll_settings TO {$legacy}");
        execSafe($pdo, "RENAME TABLE {$kvTable} TO payroll_settings");
    },
];

$steps[] = [
    'name' => 'payroll.003.tax_slabs_name',
    'run' => function () use ($pdo) {
        if (!tableExists($pdo, 'tax_slabs')) return;
        if (!columnExists($pdo, 'tax_slabs', 'name')) {
            execSafe($pdo, "ALTER TABLE tax_slabs ADD COLUMN name VARCHAR(50) NULL");
        }
        if (!columnExists($pdo, 'tax_slabs', 'min_salary')) {
            execSafe($pdo, "ALTER TABLE tax_slabs ADD COLUMN min_salary DECIMAL(15,2) NOT NULL DEFAULT 0.00");
        }
        if (!columnExists($pdo, 'tax_slabs', 'max_salary')) {
            execSafe($pdo, "ALTER TABLE tax_slabs ADD COLUMN max_salary DECIMAL(15,2) NULL");
        }
        if (!columnExists($pdo, 'tax_slabs', 'tax_percent')) {
            execSafe($pdo, "ALTER TABLE tax_slabs ADD COLUMN tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00");
        }
        if (!columnExists($pdo, 'tax_slabs', 'created_at')) {
            execSafe($pdo, "ALTER TABLE tax_slabs ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
        }
    },
];

$steps[] = [
    'name' => 'payroll.004.employee_salary_items_percentage',
    'run' => function () use ($pdo) {
        if (!tableExists($pdo, 'employee_salary_items')) return;
        if (!columnExists($pdo, 'employee_salary_items', 'is_percentage')) {
            execSafe($pdo, "ALTER TABLE employee_salary_items ADD COLUMN is_percentage BOOLEAN DEFAULT FALSE");
        }
        if (!columnExists($pdo, 'employee_salary_items', 'percentage')) {
            execSafe($pdo, "ALTER TABLE employee_salary_items ADD COLUMN percentage DECIMAL(5,2) DEFAULT 0.00");
        }
    },
];

$steps[] = [
    'name' => 'payroll.005.payroll_bonuses_kind_direction',
    'run' => function () use ($pdo) {
        if (!tableExists($pdo, 'payroll_bonuses')) return;
        if (!columnExists($pdo, 'payroll_bonuses', 'kind')) {
            execSafe($pdo, "ALTER TABLE payroll_bonuses ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'bonus'");
        }
        if (!columnExists($pdo, 'payroll_bonuses', 'direction')) {
            execSafe($pdo, "ALTER TABLE payroll_bonuses ADD COLUMN direction VARCHAR(20) NOT NULL DEFAULT 'earning'");
        }
    },
];

$steps[] = [
    'name' => 'payroll.006.roles_permissions',
    'run' => function () use ($pdo) {
        if (!tableExists($pdo, 'roles')) return;
        if (!columnExists($pdo, 'roles', 'tenant_id')) {
            execSafe($pdo, "ALTER TABLE roles ADD COLUMN tenant_id INT NULL");
        }
        if (!columnExists($pdo, 'roles', 'role_name')) {
            execSafe($pdo, "ALTER TABLE roles ADD COLUMN role_name VARCHAR(50) NULL");
        }
        if (!columnExists($pdo, 'roles', 'permissions_json')) {
            execSafe($pdo, "ALTER TABLE roles ADD COLUMN permissions_json TEXT NULL");
        }
        if (!columnExists($pdo, 'roles', 'created_at')) {
            execSafe($pdo, "ALTER TABLE roles ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
        }
        if (!columnExists($pdo, 'roles', 'updated_at')) {
            execSafe($pdo, "ALTER TABLE roles ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
        }
        if (columnExists($pdo, 'roles', 'tenant_id') && columnExists($pdo, 'roles', 'role_name') && !indexExists($pdo, 'roles', 'uniq_role')) {
            execSafe($pdo, "ALTER TABLE roles ADD UNIQUE KEY uniq_role (tenant_id, role_name)");
        }
    },
];

$steps[] = [
    'name' => 'payroll.007.audit_logs_meta',
    'run' => function () use ($pdo) {
        if (!tableExists($pdo, 'audit_logs')) return;
        if (!columnExists($pdo, 'audit_logs', 'meta')) {
            execSafe($pdo, "ALTER TABLE audit_logs ADD COLUMN meta TEXT NULL");
        }
    },
];

try {
    foreach ($steps as $step) {
        $name = (string)$step['name'];
        if (hasMigration($pdo, $name)) continue;
        $fn = $step['run'];
        $fn();
        markMigration($pdo, $name);
        echo "Applied {$name}\n";
    }
    echo "Payroll migrations complete\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Migration failed: " . $e->getMessage() . "\n");
    exit(1);
}
