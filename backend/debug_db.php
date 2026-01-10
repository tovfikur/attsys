<?php
require 'src/Core/Database.php';
$pdo = App\Core\Database::get();

echo "Super Admins Schema:\n";
print_r($pdo->query('DESCRIBE super_admins')->fetchAll(PDO::FETCH_ASSOC));

echo "\nSuper Admins Data:\n";
print_r($pdo->query('SELECT * FROM super_admins')->fetchAll(PDO::FETCH_ASSOC));

echo "\nTenant Users Schema:\n";
print_r($pdo->query('DESCRIBE tenant_users')->fetchAll(PDO::FETCH_ASSOC));

echo "\nTenant Users Data:\n";
print_r($pdo->query('SELECT * FROM tenant_users')->fetchAll(PDO::FETCH_ASSOC));
