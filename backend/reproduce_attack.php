<?php
// Mock Auth
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer mock-tenant-token-abc';
$_SERVER['HTTP_X_TENANT_ID'] = 'demo';
$_SERVER['REQUEST_METHOD'] = 'POST';

// Requires
require_once __DIR__ . '/src/Core/Database.php';
require_once __DIR__ . '/src/Core/Token.php';
require_once __DIR__ . '/src/Core/Auth.php';
require_once __DIR__ . '/src/Core/AttendanceStore.php';
require_once __DIR__ . '/src/Controller/AttendanceController.php';

// Instantiate and Run
$controller = new \App\Controller\AttendanceController();
$controller->leavesCreate();
