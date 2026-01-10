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

$sql = file_get_contents(__DIR__ . '/migration_shifts.sql');
try {
    $pdo->exec($sql);
    echo "Migration executed successfully.\n";
} catch (PDOException $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
}
