<?php
require_once __DIR__ . '/src/Core/Database.php';
use App\Core\Database;

$pdo = null;
for ($i = 0; $i < 20; $i++) {
    $pdo = Database::get();
    if ($pdo) break;
    usleep(250000);
}
if (!$pdo) {
    echo "DB Connection failed\n";
    exit(1);
}

$files = [
    __DIR__ . '/migration_shifts.sql',
    __DIR__ . '/migration_employee_profile.sql',
];

try {
    foreach ($files as $path) {
        if (!is_file($path)) continue;
        $sql = (string)file_get_contents($path);
        if ($sql === '') continue;
        $pdo->exec($sql);
    }
    echo "Migrations executed successfully.\n";
} catch (PDOException $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
