<?php

date_default_timezone_set('Asia/Dhaka');

spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $base_dir = __DIR__ . '/src/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) return;
    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';
    if (file_exists($file)) require $file;
});

use App\Core\Database;
use App\Core\Audit;
use App\Payroll\PayrollService;
use App\Payroll\PayrollStore;

$pdo = Database::get();
if (!$pdo) {
    fwrite(STDERR, "DB Connection failed\n");
    exit(1);
}

$today = new DateTimeImmutable('now');
$todayStr = $today->format('Y-m-d');
$dayOfMonth = (int)$today->format('j');
$cycleStart = $today->format('Y-m-01');
$cycleEnd = $today->format('Y-m-t');
$cycleName = 'Payroll ' . $today->format('M Y');

$tenants = $pdo->query("SELECT id FROM tenants")->fetchAll(PDO::FETCH_COLUMN);

$systemUser = ['id' => 0, 'role' => 'system', 'name' => 'scheduler'];

$ran = 0;
$skipped = 0;
$errors = 0;

foreach ($tenants as $tenantIdRaw) {
    $tenantId = (int)$tenantIdRaw;
    if ($tenantId <= 0) continue;

    $store = new PayrollStore($tenantId);
    $enabled = (int)$store->getSetting('scheduler_enabled', 0) ? 1 : 0;
    if (!$enabled) {
        $skipped++;
        continue;
    }

    $runDay = (int)$store->getSetting('scheduler_day_of_month', 1);
    if ($runDay < 1 || $runDay > 28) $runDay = 1;
    if ($dayOfMonth !== $runDay) {
        $skipped++;
        continue;
    }

    $lastRun = (string)$store->getSetting('scheduler_last_run', '');
    if ($lastRun === $todayStr) {
        $skipped++;
        continue;
    }

    $autoRun = (int)$store->getSetting('scheduler_auto_run', 1) ? 1 : 0;
    $autoEmail = (int)$store->getSetting('scheduler_auto_email', 0) ? 1 : 0;
    $name = (string)$store->getSetting('scheduler_cycle_name', $cycleName);

    $service = new PayrollService($tenantId);
    try {
        $existing = $store->getCycleByRange($cycleStart, $cycleEnd);
        $cycleId = $existing ? (int)$existing['id'] : (int)$service->createCycle($name, $cycleStart, $cycleEnd);

        Audit::log('payroll.scheduler.cycle.ensure', ['tenant_id' => $tenantId, 'cycle_id' => $cycleId, 'start' => $cycleStart, 'end' => $cycleEnd], $systemUser);

        if ($autoRun) {
            $service->runPayroll($cycleId);
            Audit::log('payroll.scheduler.run', ['tenant_id' => $tenantId, 'cycle_id' => $cycleId], $systemUser);
        }

        if ($autoEmail) {
            $service->emailPayslipsForCycle($cycleId);
            Audit::log('payroll.scheduler.email', ['tenant_id' => $tenantId, 'cycle_id' => $cycleId], $systemUser);
        }

        $store->saveSetting('scheduler_last_run', $todayStr);
        $ran++;
    } catch (Throwable $e) {
        $errors++;
        Audit::log('payroll.scheduler.error', ['tenant_id' => $tenantId, 'message' => $e->getMessage()], $systemUser);
        fwrite(STDERR, "Tenant {$tenantId} failed: " . $e->getMessage() . "\n");
    }
}

echo "Scheduler done. ran={$ran} skipped={$skipped} errors={$errors}\n";
exit($errors > 0 ? 1 : 0);

