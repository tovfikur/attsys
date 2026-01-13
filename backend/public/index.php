<?php

// Simple Autoloader (since composer is missing in env)
spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $base_dir = __DIR__ . '/../src/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';

    if (file_exists($file)) {
        require $file;
    }
});

// require_once __DIR__ . '/../vendor/autoload.php';

use App\Core\Router;
use App\Core\TenantResolver;

// 1. CORS Headers (Allow Frontend)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
error_log("Request Origin: $origin");
if ($origin) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
    header("Vary: Origin");
} else {
    header("Access-Control-Allow-Origin: *");
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
$reqHeaders = $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? '';
$reqHeaders = preg_replace("/[\r\n]+/", "", (string)$reqHeaders);
$baseHeaders = "Content-Type, Authorization, X-Tenant-ID, X-Toast-Skip";
header("Access-Control-Allow-Headers: " . ($reqHeaders ? ($baseHeaders . ", " . $reqHeaders) : $baseHeaders));

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 2. Error Handling (Basic)
set_exception_handler(function ($e) {
    http_response_code(500);
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    echo json_encode(['error' => $e->getMessage(), 'code' => $e->getCode()]);
});

register_shutdown_function(function () {
    $err = error_get_last();
    if (!$err) return;
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array($err['type'], $fatalTypes, true)) return;
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
    }
    echo json_encode([
        'error' => 'Fatal error',
        'message' => $err['message'] ?? 'Unknown error',
    ]);
});

// 3. Resolve Tenant
$tenantResolver = new TenantResolver();
try {
    $tenant = $tenantResolver->resolve();
    // In a real app, we'd store $tenant in a Registry or Container
    if ($tenant) {
        error_log("Tenant resolved: " . json_encode($tenant));
    } else {
        error_log("Tenant NOT resolved. Host: " . ($_SERVER['HTTP_HOST'] ?? 'unknown'));
    }
} catch (Exception $e) {
    // If tenant not found, strictly deny access? 
    // For now, we allow "public" access for health checks, but we mark tenant as null.
    $tenant = null;
    error_log("Tenant resolution error: " . $e->getMessage());
}

// 4. Router
$router = new Router();

// Define Routes
$router->get('/api/health', ['App\Controller\HealthController', 'check']);
$router->get('/api/tenant', ['App\Controller\HealthController', 'tenantInfo']);
$router->post('/api/login', ['App\Controller\AuthController', 'login']);
$router->post('/api/tenant_login', ['App\Controller\AuthController', 'tenantLogin']);
$router->post('/api/forgot-password', ['App\Controller\PasswordResetController', 'requestReset']);
$router->post('/api/reset-password', ['App\Controller\PasswordResetController', 'resetPassword']);
$router->postAuth('/api/tenant_users/reset_password', ['App\Controller\TenantUserController', 'resetPassword'], 'superadmin');
$router->getAuth('/api/tenant_users/employee_login', ['App\Controller\TenantUserController', 'getEmployeeLogin'], 'perm:employees.read');
$router->postAuth('/api/tenant_users/employee_login/set_password', ['App\Controller\TenantUserController', 'setEmployeePassword'], 'perm:employees.write');
$router->getAuth('/api/audit', ['App\Controller\AuditController', 'list'], 'superadmin');
$router->getAuth('/api/devices', ['App\Controller\DeviceController', 'list'], 'perm:devices.manage');
$router->postAuth('/api/devices/register', ['App\Controller\DeviceController', 'register'], 'perm:devices.manage');
$router->postAuth('/api/devices/update', ['App\Controller\DeviceController', 'update'], 'perm:devices.manage');
$router->post('/api/devices/ingest', ['App\Controller\DeviceController', 'ingest']);
$router->postAuth('/api/devices/status', ['App\Controller\DeviceController', 'setStatus'], 'perm:devices.manage');
$router->getAuth('/api/devices/events', ['App\Controller\DeviceController', 'events'], 'perm:devices.manage');
$router->getAuth('/api/devices/hik/config', ['App\Controller\DeviceController', 'getHikConfig'], 'perm:devices.manage');
$router->postAuth('/api/devices/hik/config', ['App\Controller\DeviceController', 'setHikConfig'], 'perm:devices.manage');
$router->postAuth('/api/devices/hik/test', ['App\Controller\DeviceController', 'testHikConnection'], 'perm:devices.manage');
$router->postAuth('/api/devices/hik/sync', ['App\Controller\DeviceController', 'syncHikLogs'], 'perm:devices.manage');
$router->getAuth('/api/sites', ['App\Controller\SiteController', 'list'], 'perm:sites.manage');
$router->postAuth('/api/sites', ['App\Controller\SiteController', 'create'], 'perm:sites.manage');

// Tenant Management Routes (Superadmin Only - mocked protection)
$router->getAuth('/api/tenants', ['App\Controller\TenantController', 'index'], 'superadmin');
$router->postAuth('/api/tenants', ['App\Controller\TenantController', 'create'], 'superadmin');
$router->postAuth('/api/tenants/status', ['App\Controller\TenantController', 'setStatus'], 'superadmin');

// Employees
$router->getAuth('/api/employees', ['App\Controller\EmployeeController', 'list'], 'perm:employees.read');
$router->getAuth('/api/employees/device_sync_ids', ['App\Controller\EmployeeController', 'deviceSyncIds'], 'perm:employees.read');
$router->postAuth('/api/employees', ['App\Controller\EmployeeController', 'create'], 'perm:employees.write');
$router->postAuth('/api/employees/update', ['App\Controller\EmployeeController', 'update'], 'perm:employees.write');
$router->postAuth('/api/employees/delete', ['App\Controller\EmployeeController', 'delete'], 'perm:employees.write');
$router->getAuth('/api/employees/profile_photo', ['App\Controller\EmployeeController', 'profilePhoto'], 'perm:employees.read');
$router->postAuth('/api/employees/profile_photo/upload', ['App\Controller\EmployeeController', 'uploadProfilePhoto'], 'perm:employees.write');
$router->getAuth('/api/employees/attachments', ['App\Controller\EmployeeController', 'attachments'], 'perm:employees.read');
$router->getAuth('/api/employees/attachments/download', ['App\Controller\EmployeeController', 'downloadAttachment'], 'perm:employees.read');
$router->postAuth('/api/employees/attachments/upload', ['App\Controller\EmployeeController', 'uploadAttachment'], 'perm:employees.write');
$router->postAuth('/api/employees/attachments/delete', ['App\Controller\EmployeeController', 'deleteAttachment'], 'perm:employees.write');

// Messenger
$router->getAuth('/api/messenger/people', ['App\Controller\MessengerController', 'people'], 'tenant');
$router->getAuth('/api/messenger/conversations', ['App\Controller\MessengerController', 'conversations'], 'tenant');
$router->postAuth('/api/messenger/conversations/direct', ['App\Controller\MessengerController', 'directConversation'], 'tenant');
$router->getAuth('/api/messenger/messages', ['App\Controller\MessengerController', 'messages'], 'tenant');
$router->getAuth('/api/messenger/unread_count', ['App\Controller\MessengerController', 'unreadCount'], 'tenant');
$router->postAuth('/api/messenger/messages/send', ['App\Controller\MessengerController', 'sendMessage'], 'tenant');
$router->postAuth('/api/messenger/messages/broadcast', ['App\Controller\MessengerController', 'broadcast'], 'tenant');

// Leaves
$router->getAuth('/api/leaves', ['App\Controller\AttendanceController', 'leavesList'], 'perm:leaves.read');
$router->getAuth('/api/leaves/pending_unseen', ['App\Controller\AttendanceController', 'leavesPendingUnseen'], 'perm:leaves.read');
$router->postAuth('/api/leaves/mark_seen', ['App\Controller\AttendanceController', 'leavesMarkSeen'], 'perm:leaves.read');
$router->getAuth('/api/leaves/balance', ['App\Controller\AttendanceController', 'leaveBalance'], 'perm:leaves.read');
$router->postAuth('/api/leaves', ['App\Controller\AttendanceController', 'leavesCreate'], 'perm:leaves.manage');
$router->postAuth('/api/leaves/apply', ['App\Controller\AttendanceController', 'leavesApply'], 'perm:leaves.apply');
$router->postAuth('/api/leaves/update', ['App\Controller\AttendanceController', 'leavesUpdate'], 'perm:leaves.approve');
$router->postAuth('/api/leaves/delete', ['App\Controller\AttendanceController', 'leavesDelete'], 'perm:leaves.manage');

// Leave Settings
$router->getAuth('/api/leave_settings', ['App\Controller\AttendanceController', 'leaveSettingsGet'], 'perm:leaves.manage');
$router->postAuth('/api/leave_settings', ['App\Controller\AttendanceController', 'leaveSettingsSet'], 'perm:leaves.manage');

// Leave Allocations
$router->getAuth('/api/leave_allocations', ['App\Controller\AttendanceController', 'leaveAllocationsList'], 'perm:leaves.manage');
$router->postAuth('/api/leave_allocations', ['App\Controller\AttendanceController', 'leaveAllocationsUpsert'], 'perm:leaves.manage');
$router->postAuth('/api/leave_allocations/delete', ['App\Controller\AttendanceController', 'leaveAllocationsDelete'], 'perm:leaves.manage');

// Leave Types
$router->getAuth('/api/leave_types', ['App\Controller\AttendanceController', 'leaveTypesList'], 'perm:leaves.read');
$router->postAuth('/api/leave_types', ['App\Controller\AttendanceController', 'leaveTypesUpsert'], 'perm:leaves.manage');
$router->postAuth('/api/leave_types/deactivate', ['App\Controller\AttendanceController', 'leaveTypesDeactivate'], 'perm:leaves.manage');

// Holidays
$router->getAuth('/api/holidays', ['App\Controller\AttendanceController', 'holidaysList'], 'perm:attendance.read');
$router->postAuth('/api/holidays', ['App\Controller\AttendanceController', 'holidaysCreate'], 'perm:attendance.write');
$router->postAuth('/api/holidays/update', ['App\Controller\AttendanceController', 'holidaysUpdate'], 'perm:attendance.write');
$router->postAuth('/api/holidays/delete', ['App\Controller\AttendanceController', 'holidaysDelete'], 'perm:attendance.write');

// Attendance
$router->getAuth('/api/attendance', ['App\Controller\AttendanceController', 'list'], 'perm:attendance.read');
$router->getAuth('/api/attendance/dashboard', ['App\Controller\AttendanceController', 'dashboard'], 'perm:attendance.read');
$router->getAuth('/api/attendance/days', ['App\Controller\AttendanceController', 'days'], 'perm:attendance.read');
$router->getAuth('/api/attendance/employee', ['App\Controller\AttendanceController', 'employeeStats'], 'perm:attendance.read');
$router->getAuth('/api/attendance/open', ['App\Controller\AttendanceController', 'openShift'], 'perm:attendance.clock');
$router->postAuth('/api/attendance/clockin', ['App\Controller\AttendanceController', 'clockIn'], 'perm:attendance.clock');
$router->postAuth('/api/attendance/clockout', ['App\Controller\AttendanceController', 'clockOut'], 'perm:attendance.clock');
$router->getAuth('/api/attendance/evidence', ['App\Controller\AttendanceController', 'evidence'], 'perm:attendance.read');
$router->getAuth('/api/attendance/raw_events', ['App\Controller\AttendanceController', 'rawEvents'], 'perm:attendance.read');
$router->postAuth('/api/attendance/process', ['App\Controller\AttendanceController', 'process'], 'perm:attendance.read');

// Biometrics
$router->postAuth('/api/biometrics/enroll', ['App\Controller\AttendanceController', 'enrollBiometric'], 'perm:attendance.clock');

// Shifts
$router->getAuth('/api/shifts', ['App\Controller\ShiftController', 'index'], 'perm:attendance.read');
$router->postAuth('/api/shifts', ['App\Controller\ShiftController', 'create'], 'perm:attendance.write');
$router->postAuth('/api/shifts/update', ['App\Controller\ShiftController', 'update'], 'perm:attendance.write');
$router->postAuth('/api/shifts/delete', ['App\Controller\ShiftController', 'delete'], 'perm:attendance.write');
$router->postAuth('/api/shifts/assign', ['App\Controller\ShiftController', 'assign'], 'perm:attendance.write');

$router->getAuth('/api/me', ['App\Controller\ProfileController', 'me'], 'any');
$router->postAuth('/api/me/update', ['App\Controller\ProfileController', 'updateMe'], 'any');
$router->postAuth('/api/change_password', ['App\Controller\ProfileController', 'changePassword'], 'any');
$router->getAuth('/api/me/profile_photo', ['App\Controller\ProfileController', 'profilePhoto'], 'any');
$router->postAuth('/api/me/profile_photo/upload', ['App\Controller\ProfileController', 'uploadProfilePhoto'], 'any');
$router->getAuth('/api/tenant/logo', ['App\Controller\ProfileController', 'tenantLogo'], 'tenant');
$router->postAuth('/api/tenant/logo/upload', ['App\Controller\ProfileController', 'uploadTenantLogo'], 'perm:employees.write');

// Dispatch
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

$router->dispatch($method, $uri);
