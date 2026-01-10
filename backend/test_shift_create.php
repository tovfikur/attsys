<?php
$url = 'http://localhost:8000/api/shifts';
$data = [
    'name' => 'Night Shift',
    'start_time' => '22:00',
    'end_time' => '06:00'
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer e94fb922fd02d566473d7af1ab156ac2c7123bee0aa9da59',
    'X-Tenant-ID: demo'
]);
curl_setopt($ch, CURLOPT_VERBOSE, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    echo 'Curl error: ' . curl_error($ch);
}

curl_close($ch);

echo "\nHTTP Code: $httpCode\n";
echo "Response: $response\n";
