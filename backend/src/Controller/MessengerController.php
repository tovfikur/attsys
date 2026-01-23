<?php

namespace App\Controller;

use App\Core\Auth;
use App\Core\Database;

class MessengerController
{
    private function resolveTenantIdFromUser(array $user, \PDO $pdo): ?int
    {
        $tenantId = (int)($user['tenant_id'] ?? 0);
        if ($tenantId > 0) return $tenantId;
        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        if (!$hint) return null;
        $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=? LIMIT 1');
        $t->execute([strtolower((string)$hint)]);
        $id = (int)($t->fetchColumn() ?: 0);
        return $id > 0 ? $id : null;
    }

    private function getOrCreateAnnouncementsConversation(\PDO $pdo, int $tenantId): int
    {
        $stmt = $pdo->prepare("SELECT id FROM messenger_conversations WHERE tenant_id=? AND conversation_key='announcements' LIMIT 1");
        $stmt->execute([(int)$tenantId]);
        $id = (int)($stmt->fetchColumn() ?: 0);
        if ($id > 0) return $id;

        $ins = $pdo->prepare("INSERT INTO messenger_conversations(tenant_id, kind, conversation_key) VALUES(?, 'announcements', 'announcements')");
        $ins->execute([(int)$tenantId]);
        return (int)$pdo->lastInsertId();
    }

    private function canAccessConversation(array $user, int $tenantId, array $conv): bool
    {
        if ((int)($conv['tenant_id'] ?? 0) !== (int)$tenantId) return false;
        $role = (string)($user['role'] ?? '');
        if ($role === 'tenant_owner') return true;
        if ((string)($conv['kind'] ?? '') === 'announcements') return true;
        $employeeId = (int)($user['employee_id'] ?? 0);
        if ($employeeId <= 0) return false;
        if ((string)($conv['kind'] ?? '') === 'owner_direct') {
            return (int)($conv['direct_employee_id'] ?? 0) === $employeeId;
        }
        return (int)($conv['direct_employee_a'] ?? 0) === $employeeId || (int)($conv['direct_employee_b'] ?? 0) === $employeeId;
    }

    private function getConversation(\PDO $pdo, int $tenantId, int $conversationId): ?array
    {
        $stmt = $pdo->prepare('SELECT id, tenant_id, kind, conversation_key, direct_employee_a, direct_employee_b, direct_user_id, direct_employee_id, created_at, updated_at FROM messenger_conversations WHERE tenant_id=? AND id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, (int)$conversationId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    }

    private function ensureReadsTable(\PDO $pdo): void
    {
        $pdo->exec("CREATE TABLE IF NOT EXISTS messenger_reads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            conversation_id INT NOT NULL,
            user_id INT NOT NULL,
            last_seen_message_id INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_messenger_reads (tenant_id, conversation_id, user_id),
            INDEX idx_messenger_reads_user (tenant_id, user_id),
            INDEX idx_messenger_reads_conversation (tenant_id, conversation_id)
        ) ENGINE=InnoDB");
    }

    private function markConversationSeen(\PDO $pdo, int $tenantId, int $conversationId, array $user, int $lastSeenMessageId): void
    {
        $userId = isset($user['id']) && is_numeric($user['id']) ? (int)$user['id'] : 0;
        if ($userId <= 0 || $lastSeenMessageId <= 0) return;

        $this->ensureReadsTable($pdo);
        $stmt = $pdo->prepare('INSERT INTO messenger_reads(tenant_id, conversation_id, user_id, last_seen_message_id) VALUES(?, ?, ?, ?) ON DUPLICATE KEY UPDATE last_seen_message_id=GREATEST(last_seen_message_id, VALUES(last_seen_message_id))');
        $stmt->execute([(int)$tenantId, (int)$conversationId, (int)$userId, (int)$lastSeenMessageId]);
    }

    public function people()
    {
        Auth::requireRole('tenant');
        header('Content-Type: application/json');

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantIdFromUser($user, $pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $stmt = $pdo->prepare("SELECT id, name, code, designation, department, profile_photo_path, status FROM employees WHERE tenant_id=? AND status='active' ORDER BY name ASC, id ASC");
        $stmt->execute([(int)$tenantId]);
        echo json_encode(['people' => $stmt->fetchAll()]);
    }

    public function conversations()
    {
        Auth::requireRole('tenant');
        header('Content-Type: application/json');

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantIdFromUser($user, $pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $annId = $this->getOrCreateAnnouncementsConversation($pdo, (int)$tenantId);

        $role = (string)($user['role'] ?? '');
        $employeeId = (int)($user['employee_id'] ?? 0);
        if ($role !== 'tenant_owner' && $employeeId <= 0) {
            http_response_code(403);
            echo json_encode(['error' => 'Employee account is not linked']);
            return;
        }

        if ($role === 'tenant_owner') {
            $stmt = $pdo->prepare("SELECT c.id, c.tenant_id, c.kind, c.conversation_key, c.direct_employee_a, c.direct_employee_b, c.direct_user_id, c.direct_employee_id, c.created_at, c.updated_at, ea.name AS a_name, ea.code AS a_code, ea.profile_photo_path AS a_photo, eb.name AS b_name, eb.code AS b_code, eb.profile_photo_path AS b_photo, ou.name AS owner_name, oe.name AS owner_employee_name, oe.code AS owner_employee_code, oe.profile_photo_path AS owner_employee_photo, m.sender_name AS last_sender, m.body AS last_message FROM messenger_conversations c LEFT JOIN employees ea ON ea.tenant_id=c.tenant_id AND ea.id=c.direct_employee_a LEFT JOIN employees eb ON eb.tenant_id=c.tenant_id AND eb.id=c.direct_employee_b LEFT JOIN tenant_users ou ON ou.tenant_id=c.tenant_id AND ou.id=c.direct_user_id LEFT JOIN employees oe ON oe.tenant_id=c.tenant_id AND oe.id=c.direct_employee_id LEFT JOIN messenger_messages m ON m.tenant_id=c.tenant_id AND m.conversation_id=c.id AND m.id=(SELECT MAX(id) FROM messenger_messages m2 WHERE m2.conversation_id=c.id) WHERE c.tenant_id=? ORDER BY (c.id=? ) DESC, c.updated_at DESC, c.id DESC");
            $stmt->execute([(int)$tenantId, (int)$annId]);
        } else {
            $stmt = $pdo->prepare("SELECT c.id, c.tenant_id, c.kind, c.conversation_key, c.direct_employee_a, c.direct_employee_b, c.direct_user_id, c.direct_employee_id, c.created_at, c.updated_at, ea.name AS a_name, ea.code AS a_code, ea.profile_photo_path AS a_photo, eb.name AS b_name, eb.code AS b_code, eb.profile_photo_path AS b_photo, ou.name AS owner_name, oe.name AS owner_employee_name, oe.code AS owner_employee_code, oe.profile_photo_path AS owner_employee_photo, m.sender_name AS last_sender, m.body AS last_message FROM messenger_conversations c LEFT JOIN employees ea ON ea.tenant_id=c.tenant_id AND ea.id=c.direct_employee_a LEFT JOIN employees eb ON eb.tenant_id=c.tenant_id AND eb.id=c.direct_employee_b LEFT JOIN tenant_users ou ON ou.tenant_id=c.tenant_id AND ou.id=c.direct_user_id LEFT JOIN employees oe ON oe.tenant_id=c.tenant_id AND oe.id=c.direct_employee_id LEFT JOIN messenger_messages m ON m.tenant_id=c.tenant_id AND m.conversation_id=c.id AND m.id=(SELECT MAX(id) FROM messenger_messages m2 WHERE m2.conversation_id=c.id) WHERE c.tenant_id=? AND (c.id=? OR c.direct_employee_a=? OR c.direct_employee_b=? OR c.direct_employee_id=?) ORDER BY (c.id=? ) DESC, c.updated_at DESC, c.id DESC");
            $stmt->execute([(int)$tenantId, (int)$annId, (int)$employeeId, (int)$employeeId, (int)$employeeId, (int)$annId]);
        }

        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        echo json_encode(['conversations' => $rows]);
    }

    public function directConversation()
    {
        Auth::requireRole('tenant');
        header('Content-Type: application/json');

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantIdFromUser($user, $pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $otherId = (int)($in['employee_id'] ?? 0);
        if ($otherId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid employee_id']);
            return;
        }

        $check = $pdo->prepare("SELECT id FROM employees WHERE tenant_id=? AND id=? AND status='active' LIMIT 1");
        $check->execute([(int)$tenantId, (int)$otherId]);
        if (!$check->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $role = (string)($user['role'] ?? '');
        $employeeId = (int)($user['employee_id'] ?? 0);

        if ($role === 'tenant_owner' && $employeeId <= 0) {
            $ownerUserId = isset($user['id']) && is_numeric($user['id']) ? (int)$user['id'] : 0;
            if ($ownerUserId <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid user']);
                return;
            }

            $key = "owner:$ownerUserId:$otherId";
            $stmt = $pdo->prepare('SELECT id FROM messenger_conversations WHERE tenant_id=? AND conversation_key=? LIMIT 1');
            $stmt->execute([(int)$tenantId, $key]);
            $cid = (int)($stmt->fetchColumn() ?: 0);
            if ($cid <= 0) {
                $ins = $pdo->prepare("INSERT INTO messenger_conversations(tenant_id, kind, conversation_key, direct_user_id, direct_employee_id) VALUES(?, 'owner_direct', ?, ?, ?)");
                $ins->execute([(int)$tenantId, $key, (int)$ownerUserId, (int)$otherId]);
                $cid = (int)$pdo->lastInsertId();
            }

            $conv = $this->getConversation($pdo, (int)$tenantId, (int)$cid);
            echo json_encode(['conversation' => $conv]);
            return;
        }

        if ($employeeId <= 0) {
            http_response_code(403);
            echo json_encode(['error' => 'Employee account is not linked']);
            return;
        }
        if ($otherId === $employeeId) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid employee_id']);
            return;
        }

        $a = min($employeeId, $otherId);
        $b = max($employeeId, $otherId);
        $key = "direct:$a:$b";

        $stmt = $pdo->prepare('SELECT id FROM messenger_conversations WHERE tenant_id=? AND conversation_key=? LIMIT 1');
        $stmt->execute([(int)$tenantId, $key]);
        $cid = (int)($stmt->fetchColumn() ?: 0);
        if ($cid <= 0) {
            $ins = $pdo->prepare("INSERT INTO messenger_conversations(tenant_id, kind, conversation_key, direct_employee_a, direct_employee_b) VALUES(?, 'direct', ?, ?, ?)");
            $ins->execute([(int)$tenantId, $key, (int)$a, (int)$b]);
            $cid = (int)$pdo->lastInsertId();
        }

        $conv = $this->getConversation($pdo, (int)$tenantId, (int)$cid);
        echo json_encode(['conversation' => $conv]);
    }

    public function messages()
    {
        Auth::requireRole('tenant');
        header('Content-Type: application/json');

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantIdFromUser($user, $pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $conversationId = is_numeric($_GET['conversation_id'] ?? null) ? (int)$_GET['conversation_id'] : 0;
        if ($conversationId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'conversation_id required']);
            return;
        }

        $limit = is_numeric($_GET['limit'] ?? null) ? (int)$_GET['limit'] : 50;
        if ($limit <= 0) $limit = 50;
        if ($limit > 200) $limit = 200;

        $conv = $this->getConversation($pdo, (int)$tenantId, (int)$conversationId);
        if (!$conv || !$this->canAccessConversation($user, (int)$tenantId, $conv)) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }

        $stmt = $pdo->prepare('SELECT id, tenant_id, conversation_id, sender_user_id, sender_employee_id, sender_role, sender_name, body, created_at FROM messenger_messages WHERE tenant_id=? AND conversation_id=? ORDER BY id DESC LIMIT ?');
        $stmt->bindValue(1, (int)$tenantId, \PDO::PARAM_INT);
        $stmt->bindValue(2, (int)$conversationId, \PDO::PARAM_INT);
        $stmt->bindValue(3, (int)$limit, \PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $rows = array_reverse($rows);

        if ($rows) {
            $last = $rows[count($rows) - 1];
            $lastSeenId = (int)($last['id'] ?? 0);
            if ($lastSeenId > 0) {
                $this->markConversationSeen($pdo, (int)$tenantId, (int)$conversationId, $user, $lastSeenId);
            }
        }

        echo json_encode(['messages' => $rows]);
    }

    public function unreadCount()
    {
        Auth::requireRole('tenant');
        header('Content-Type: application/json');

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantIdFromUser($user, $pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $userId = isset($user['id']) && is_numeric($user['id']) ? (int)$user['id'] : 0;
        if ($userId <= 0) {
            echo json_encode(['unread' => 0]);
            return;
        }

        $this->ensureReadsTable($pdo);

        $role = (string)($user['role'] ?? '');
        $employeeId = isset($user['employee_id']) && is_numeric($user['employee_id']) ? (int)$user['employee_id'] : 0;

        if ($role !== 'tenant_owner' && $employeeId <= 0) {
            echo json_encode(['unread' => 0]);
            return;
        }

        $params = [
            (int)$userId,
            (int)$tenantId,
            (int)$userId,
            (int)$employeeId,
        ];

        if ($role === 'tenant_owner') {
            $accessWhere = "c.tenant_id=?";
            $accessParams = [(int)$tenantId];
        } else {
            $accessWhere = "c.tenant_id=? AND (c.kind='announcements' OR c.direct_employee_a=? OR c.direct_employee_b=? OR c.direct_employee_id=?)";
            $accessParams = [(int)$tenantId, (int)$employeeId, (int)$employeeId, (int)$employeeId];
        }

        $sql = "SELECT COUNT(*) AS unread
            FROM messenger_messages m
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
        $stmt->execute(array_merge([(int)$userId], $accessParams, [(int)$userId, (int)$employeeId]));
        $unread = (int)($stmt->fetchColumn() ?: 0);

        echo json_encode(['unread' => $unread]);
    }

    public function sendMessage()
    {
        Auth::requireRole('tenant');
        header('Content-Type: application/json');

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantIdFromUser($user, $pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $conversationId = (int)($in['conversation_id'] ?? 0);
        $body = trim((string)($in['body'] ?? ''));
        if ($conversationId <= 0 || $body === '') {
            http_response_code(400);
            echo json_encode(['error' => 'conversation_id and body are required']);
            return;
        }
        if (mb_strlen($body) > 4000) {
            http_response_code(400);
            echo json_encode(['error' => 'Message too long']);
            return;
        }

        $conv = $this->getConversation($pdo, (int)$tenantId, (int)$conversationId);
        if (!$conv || !$this->canAccessConversation($user, (int)$tenantId, $conv)) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }

        $role = (string)($user['role'] ?? '');
        if ((string)($conv['kind'] ?? '') === 'announcements' && $role !== 'tenant_owner') {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $stmt = $pdo->prepare('INSERT INTO messenger_messages(tenant_id, conversation_id, sender_user_id, sender_employee_id, sender_role, sender_name, body) VALUES(?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            (int)$tenantId,
            (int)$conversationId,
            isset($user['id']) ? (int)$user['id'] : null,
            isset($user['employee_id']) && is_numeric($user['employee_id']) ? (int)$user['employee_id'] : null,
            $role !== '' ? $role : 'unknown',
            (string)($user['name'] ?? 'User'),
            $body,
        ]);
        $msgId = (int)$pdo->lastInsertId();

        $pdo->prepare('UPDATE messenger_conversations SET updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=?')->execute([(int)$tenantId, (int)$conversationId]);

        echo json_encode(['ok' => true, 'id' => $msgId]);
    }

    public function broadcast()
    {
        Auth::requireRole('tenant');
        header('Content-Type: application/json');

        $pdo = Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if ((string)($user['role'] ?? '') !== 'tenant_owner') {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $tenantId = $this->resolveTenantIdFromUser($user, $pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $body = trim((string)($in['body'] ?? ''));
        if ($body === '') {
            http_response_code(400);
            echo json_encode(['error' => 'body required']);
            return;
        }
        if (mb_strlen($body) > 4000) {
            http_response_code(400);
            echo json_encode(['error' => 'Message too long']);
            return;
        }

        $annId = $this->getOrCreateAnnouncementsConversation($pdo, (int)$tenantId);
        $stmt = $pdo->prepare('INSERT INTO messenger_messages(tenant_id, conversation_id, sender_user_id, sender_employee_id, sender_role, sender_name, body) VALUES(?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            (int)$tenantId,
            (int)$annId,
            isset($user['id']) ? (int)$user['id'] : null,
            isset($user['employee_id']) && is_numeric($user['employee_id']) ? (int)$user['employee_id'] : null,
            (string)($user['role'] ?? 'tenant_owner'),
            (string)($user['name'] ?? 'Owner'),
            $body,
        ]);
        $msgId = (int)$pdo->lastInsertId();

        $pdo->prepare('UPDATE messenger_conversations SET updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=?')->execute([(int)$tenantId, (int)$annId]);

        echo json_encode(['ok' => true, 'id' => $msgId, 'conversation_id' => $annId]);
    }
}
