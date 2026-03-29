<?php

namespace App\Core;

class EventController
{
    public function stream(): void
    {
        // EventSource (SSE) cannot send custom headers, so accept token as ?token= query param too
        if (!empty($_GET['token']) && empty($_SERVER['HTTP_AUTHORIZATION'])) {
            $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
        }

        // Auth
        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $role = (string)($user['role'] ?? '');
        // Reject superadmin — they have no tenant context
        if ($role === 'superadmin') {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        // Resolve tenant
        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = (int)($user['tenant_id'] ?? 0);
        if ($tenantId <= 0) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) {
                $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=? LIMIT 1');
                $t->execute([strtolower((string)$hint)]);
                $tenantId = (int)($t->fetchColumn() ?: 0);
            }
        }
        if ($tenantId <= 0) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Tenant not resolved']);
            return;
        }

        $userId     = isset($user['id']) && is_numeric($user['id']) ? (int)$user['id'] : 0;
        $employeeId = isset($user['employee_id']) && is_numeric($user['employee_id']) ? (int)$user['employee_id'] : 0;

        // SSE headers — must be sent before any output
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache, no-store');
        header('X-Accel-Buffering: no'); // Disable Nginx buffering
        header('Connection: keep-alive');

        // Disable output buffering
        if (ob_get_level()) ob_end_clean();
        if (function_exists('apache_setenv')) {
            @apache_setenv('no-gzip', 1);
        }
        @ini_set('zlib.output_compression', 0);

        $wantsMessenger = in_array($role, ['tenant_owner','hr_admin','payroll_admin','manager','employee'], true);
        $wantsLeaves    = $role === 'tenant_owner';
        $wantsGeo       = in_array($role, ['tenant_owner','hr_admin','manager'], true);

        $iteration = 0;

        while (!connection_aborted()) {
            $counts = [];

            // Messenger unread
            if ($wantsMessenger && $userId > 0) {
                try {
                    if ($role === 'tenant_owner') {
                        $accessWhere  = 'c.tenant_id=?';
                        $accessParams = [$tenantId];
                    } else {
                        $accessWhere  = "c.tenant_id=? AND (c.kind='announcements' OR c.direct_employee_a=? OR c.direct_employee_b=? OR c.direct_employee_id=?)";
                        $accessParams = [$tenantId, $employeeId, $employeeId, $employeeId];
                    }
                    $sql = "SELECT COUNT(*) FROM messenger_messages m
                        JOIN messenger_conversations c ON c.tenant_id=m.tenant_id AND c.id=m.conversation_id
                        LEFT JOIN messenger_reads r ON r.tenant_id=m.tenant_id AND r.conversation_id=m.conversation_id AND r.user_id=?
                        WHERE $accessWhere
                          AND m.id > COALESCE(r.last_seen_message_id, 0)
                          AND NOT (
                            (m.sender_user_id IS NOT NULL AND m.sender_user_id=?)
                            OR
                            (m.sender_employee_id IS NOT NULL AND m.sender_employee_id=?)
                          )";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute(array_merge([$userId], $accessParams, [$userId, $employeeId]));
                    $counts['messenger_unread'] = (int)($stmt->fetchColumn() ?: 0);
                } catch (\Throwable $e) {
                    $counts['messenger_unread'] = 0;
                }
            }

            // Leave pending unseen
            if ($wantsLeaves) {
                try {
                    $stmt = $pdo->prepare("SELECT COUNT(*) FROM leave_requests WHERE tenant_id=? AND status='pending' AND seen_by_owner=0");
                    $stmt->execute([$tenantId]);
                    $counts['leaves_pending'] = (int)($stmt->fetchColumn() ?: 0);
                } catch (\Throwable $e) {
                    $counts['leaves_pending'] = 0;
                }
            }

            // Geo breach unseen
            if ($wantsGeo) {
                try {
                    $stmt = $pdo->prepare("SELECT COUNT(*) FROM geo_breaches WHERE tenant_id=? AND seen=0");
                    $stmt->execute([$tenantId]);
                    $counts['geo_breaches'] = (int)($stmt->fetchColumn() ?: 0);
                } catch (\Throwable $e) {
                    $counts['geo_breaches'] = 0;
                }
            }

            // Send SSE event
            echo "event: counts\n";
            echo "data: " . json_encode($counts) . "\n\n";
            flush();

            // Heartbeat every 5 loops (~100s) to keep proxies alive
            if ($iteration % 5 === 0) {
                echo ": heartbeat\n\n";
                flush();
            }

            $iteration++;

            // Sleep 20s — check for aborted connection every second
            for ($s = 0; $s < 20; $s++) {
                if (connection_aborted()) return;
                sleep(1);
            }
        }
    }
}
