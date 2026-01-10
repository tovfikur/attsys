<?php
$baseUrl = 'http://localhost:8000/api/shifts';
$headers = [
    'Content-Type: application/json',
    'Authorization: Bearer e94fb922fd02d566473d7af1ab156ac2c7123bee0aa9da59',
    'X-Tenant-ID: demo'
];

function request($url, $method, $data = []) {
    global $headers;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method); // POST or GET
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $response = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'body' => json_decode($response, true)];
}

echo "1. List Shifts\n";
$res = request($baseUrl, 'GET');
print_r($res);

echo "\n2. Create Shift\n";
$newShift = [
    'name' => 'Lifecycle Shift',
    'start_time' => '09:00',
    'end_time' => '17:00',
    'working_days' => 'Mon,Wed,Fri'
];
$res = request($baseUrl, 'POST', $newShift);
print_r($res);
$shiftId = $res['body']['id'] ?? null;

if ($shiftId) {
    echo "\n3. Update Shift\n";
    $updateData = ['id' => $shiftId, 'name' => 'Lifecycle Shift Updated'];
    // Note: Update route is /api/shifts/update usually, or PUT /api/shifts?
    // Checking index.php: $router->postAuth('/api/shifts/update', ...)
    $res = request($baseUrl . '/update?id=' . $shiftId, 'POST', $updateData);
    print_r($res);

    echo "\n4. Assign Shift (Mock Employee ID 1)\n";
    // Check if employee 1 exists? assuming yes from previous context
    $assignData = ['shift_id' => $shiftId, 'employee_ids' => [1]];
    $res = request($baseUrl . '/assign', 'POST', $assignData);
    print_r($res);

    echo "\n5. Delete Shift\n";
    // Route: /api/shifts/delete
    $res = request($baseUrl . '/delete?id=' . $shiftId, 'POST');
    print_r($res);
}
