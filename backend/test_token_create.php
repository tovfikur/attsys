<?php
require_once __DIR__ . '/src/Core/Token.php';
require_once __DIR__ . '/src/Core/Database.php';

use App\Core\Token;

$token = Token::create([
    'user_id' => 1,
    'tenant_id' => 1,
    'role' => 'tenant_owner',
    'user_name' => 'Test User',
    'user_email' => 'test@example.com',
    'expires_at' => null
]);

if ($token) {
    echo "Token created successfully: " . $token . "\n";
} else {
    echo "Token creation failed.\n";
}
