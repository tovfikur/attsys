<?php
require 'src/Core/Database.php';
$pdo = App\Core\Database::get();

echo "Salary Structures Schema:\n";
try {
    $cols = $pdo->query('DESCRIBE employee_salary_structures')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($cols as $col) {
        echo $col['Field'] . "\n";
    }
} catch (Exception $e) {
    echo $e->getMessage();
}
