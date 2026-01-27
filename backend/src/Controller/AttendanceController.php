<?php

namespace App\Controller;

use App\Core\AttendanceStore;

class AttendanceController
{
    private $store;
    public function __construct() { $this->store = new AttendanceStore(); }

    private function normalizeDate(?string $raw): ?string
    {
        if (!is_string($raw)) return null;
        $v = trim($raw);
        if ($v === '') return null;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) return $v;
        if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $v, $m)) return $m[3] . '-' . $m[2] . '-' . $m[1];
        if (preg_match('/^(\d{2})-(\d{2})-(\d{4})$/', $v, $m)) return $m[3] . '-' . $m[2] . '-' . $m[1];
        if (preg_match('/^(\d{4})\/(\d{2})\/(\d{2})$/', $v, $m)) return $m[1] . '-' . $m[2] . '-' . $m[3];
        return null;
    }

    private function normalizeLeaveStatus(?string $raw): string
    {
        if (!is_string($raw)) return 'pending';
        $v = strtolower(trim($raw));
        if ($v === '') return 'pending';
        if ($v === 'pending') return 'pending';
        if ($v === 'pending_manager') return 'pending';
        if ($v === 'pending_hr') return 'pending';
        if ($v === 'hr_pending') return 'pending';
        if ($v === 'approved') return 'approved';
        if ($v === 'rejected') return 'rejected';
        if ($v === 'cancelled') return 'rejected';
        if ($v === 'canceled') return 'rejected';
        return 'pending';
    }

    private function defaultLeaveTypes(): array
    {
        return [
            ['code' => 'casual', 'name' => 'Casual', 'is_paid' => 1, 'requires_document' => 0, 'active' => 1, 'sort_order' => 10],
            ['code' => 'sick', 'name' => 'Sick', 'is_paid' => 1, 'requires_document' => 0, 'active' => 1, 'sort_order' => 20],
            ['code' => 'annual', 'name' => 'Annual', 'is_paid' => 1, 'requires_document' => 0, 'active' => 1, 'sort_order' => 30],
            ['code' => 'unpaid', 'name' => 'Unpaid', 'is_paid' => 0, 'requires_document' => 0, 'active' => 1, 'sort_order' => 40],
        ];
    }

    private function getLeaveTypes($pdo, int $tenantId, bool $includeInactive = false): array
    {
        try {
            $where = $includeInactive ? '' : ' AND active=1';
            $stmt = $pdo->prepare("SELECT id, tenant_id, code, name, is_paid, requires_document, active, sort_order, created_at FROM leave_types WHERE tenant_id=?$where ORDER BY sort_order ASC, name ASC");
            $stmt->execute([(int)$tenantId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (is_array($rows) && count($rows) > 0) return $rows;
        } catch (\Exception $e) {
        }
        $fallback = $this->defaultLeaveTypes();
        if (!$includeInactive) {
            $fallback = array_values(array_filter($fallback, fn($t) => (int)($t['active'] ?? 0) === 1));
        }
        return $fallback;
    }

    private function getTenantLeaveSettings($pdo, int $tenantId): array
    {
        try {
            $stmt = $pdo->prepare('SELECT auto_approve FROM tenant_leave_settings WHERE tenant_id=? LIMIT 1');
            $stmt->execute([(int)$tenantId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row) {
                return [
                    'auto_approve' => (int)($row['auto_approve'] ?? 0) ? 1 : 0,
                ];
            }
        } catch (\Exception $e) {
        }
        return [
            'auto_approve' => 0,
        ];
    }

    private function resolveLeaveType($pdo, int $tenantId, $raw): ?string
    {
        $v = is_string($raw) ? strtolower(trim($raw)) : '';
        if ($v === '') $v = 'casual';

        $allowed = [];
        foreach ($this->getLeaveTypes($pdo, $tenantId, false) as $t) {
            $code = strtolower(trim((string)($t['code'] ?? '')));
            if ($code !== '') $allowed[$code] = true;
        }

        if (isset($allowed[$v])) return $v;
        return null;
    }

    private function resolveLeaveTypeAny($pdo, int $tenantId, $raw): ?string
    {
        $v = is_string($raw) ? strtolower(trim($raw)) : '';
        if ($v === '') return null;

        $allowed = [];
        foreach ($this->getLeaveTypes($pdo, $tenantId, true) as $t) {
            $code = strtolower(trim((string)($t['code'] ?? '')));
            if ($code !== '') $allowed[$code] = true;
        }

        if (isset($allowed[$v])) return $v;
        return null;
    }

    private function normalizeDayPart(?string $raw): string
    {
        if (!is_string($raw)) return 'full';
        $v = strtolower(trim($raw));
        if ($v === '') return 'full';
        if ($v === 'half') return 'full';
        if ($v === 'first_half') return 'am';
        if ($v === 'second_half') return 'pm';
        $allowed = ['full' => true, 'am' => true, 'pm' => true];
        return isset($allowed[$v]) ? $v : 'full';
    }

    private function getEmployeeWorkingDays($pdo, int $tenantId, int $employeeId): array
    {
        $stmt = $pdo->prepare('SELECT s.working_days FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? AND e.id=? LIMIT 1');
        $stmt->execute([(int)$tenantId, (int)$employeeId]);
        $raw = $stmt->fetchColumn();
        if (!is_string($raw) || trim($raw) === '') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        $parts = array_map('trim', explode(',', $raw));
        $out = [];
        foreach ($parts as $p) {
            if ($p === '') continue;
            $out[$p] = true;
        }
        return array_keys($out);
    }

    private function normalizeRange(string $start, string $end): array
    {
        $s = $this->normalizeDate($start) ?? date('Y-m-d');
        $e = $this->normalizeDate($end) ?? $s;
        if ($s > $e) {
            $tmp = $s;
            $s = $e;
            $e = $tmp;
        }
        return [$s, $e];
    }

    private function toTenantTime(?string $utcDateTime): ?string
    {
        if (!is_string($utcDateTime)) return null;
        $utcDateTime = trim($utcDateTime);
        if ($utcDateTime === '') return null;
        try {
            $dt = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $utcDateTime, new \DateTimeZone('UTC'));
            if (!$dt) return $utcDateTime;
            return $dt->setTimezone(new \DateTimeZone('Asia/Dhaka'))->format('Y-m-d H:i:s');
        } catch (\Exception $e) {
            return $utcDateTime;
        }
    }

    private function resolveTenantId($pdo): ?int
    {
        $user = \App\Core\Auth::currentUser() ?? [];
        $tenantId = $user['tenant_id'] ?? null;
        if ($tenantId) return (int)$tenantId;

        $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
        if (!$hint) return null;
        $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
        $t->execute([$hint]);
        $row = $t->fetch();
        return $row ? (int)$row['id'] : null;
    }

    private function normalizeAttendanceRecordRow(array $r): array
    {
        $asFloat = function ($v): ?float {
            return is_numeric($v) ? (float)$v : null;
        };
        $asInt = function ($v): ?int {
            return is_numeric($v) ? (int)round((float)$v) : null;
        };
        $asStringOrNull = function ($v): ?string {
            if (!is_string($v)) return null;
            $s = trim($v);
            return $s === '' ? null : $s;
        };

        $r['clock_in_method'] = $asStringOrNull($r['clock_in_method'] ?? null);
        $r['clock_out_method'] = $asStringOrNull($r['clock_out_method'] ?? null);

        $r['clock_in_lat'] = $asFloat($r['clock_in_lat'] ?? null);
        $r['clock_in_lng'] = $asFloat($r['clock_in_lng'] ?? null);
        $r['clock_in_accuracy_m'] = $asInt($r['clock_in_accuracy_m'] ?? null);

        $r['clock_out_lat'] = $asFloat($r['clock_out_lat'] ?? null);
        $r['clock_out_lng'] = $asFloat($r['clock_out_lng'] ?? null);
        $r['clock_out_accuracy_m'] = $asInt($r['clock_out_accuracy_m'] ?? null);

        $r['clock_in_device_id'] = $asStringOrNull($r['clock_in_device_id'] ?? null);
        $r['clock_out_device_id'] = $asStringOrNull($r['clock_out_device_id'] ?? null);

        if (isset($r['duration_minutes']) && is_numeric($r['duration_minutes'])) $r['duration_minutes'] = (int)$r['duration_minutes'];
        if (isset($r['late_minutes']) && is_numeric($r['late_minutes'])) $r['late_minutes'] = (int)$r['late_minutes'];
        if (isset($r['early_leave_minutes']) && is_numeric($r['early_leave_minutes'])) $r['early_leave_minutes'] = (int)$r['early_leave_minutes'];
        if (isset($r['overtime_minutes']) && is_numeric($r['overtime_minutes'])) $r['overtime_minutes'] = (int)$r['overtime_minutes'];

        return $r;
    }

    private function normalizeAttendanceRecords($rows): array
    {
        if (!is_array($rows)) return [];
        $out = [];
        foreach ($rows as $r) {
            if (!is_array($r)) continue;
            $out[] = $this->normalizeAttendanceRecordRow($r);
        }
        return $out;
    }

    private function normalizeBiometricModality($raw): ?string
    {
        if (!is_string($raw)) return null;
        $v = strtolower(trim($raw));
        if ($v === '') return null;
        if (in_array($v, ['face', 'selfie', 'photo', 'camera'], true)) return 'face';
        if (in_array($v, ['fingerprint', 'finger', 'thumb', 'thumbprint'], true)) {
            throw new \Exception('Fingerprint biometrics not supported');
        }
        return null;
    }

    private function normalizeBiometricHash($raw): ?string
    {
        if (!is_string($raw)) return null;
        $v = strtolower(trim($raw));
        if ($v === '') return null;
        if (!preg_match('/^[0-9a-f]{16}$/', $v)) return null;
        return $v;
    }

    private function decodeBiometricImage($raw): array
    {
        if (!is_string($raw)) throw new \Exception('Biometric image is required');
        $v = trim($raw);
        if ($v === '') throw new \Exception('Biometric image is required');

        $mime = 'image/jpeg';
        $b64 = $v;
        if (preg_match('/^data:([^;]+);base64,(.*)$/', $v, $m)) {
            $mime = strtolower(trim((string)$m[1]));
            $b64 = (string)$m[2];
        }

        $bytes = base64_decode($b64, true);
        if ($bytes === false) throw new \Exception('Invalid biometric image encoding');
        if (strlen($bytes) <= 0) throw new \Exception('Invalid biometric image encoding');
        if (strlen($bytes) > 2 * 1024 * 1024) throw new \Exception('Biometric image too large');

        return [$mime, $bytes];
    }

    private function extractGeo($in): array
    {
        $geo = null;
        if (is_array($in) && isset($in['geo']) && is_array($in['geo'])) $geo = $in['geo'];

        $latRaw = $geo['latitude'] ?? ($in['geo_latitude'] ?? ($in['latitude'] ?? null));
        $lngRaw = $geo['longitude'] ?? ($in['geo_longitude'] ?? ($in['longitude'] ?? null));
        $accRaw = $geo['accuracy_m'] ?? ($geo['accuracy'] ?? ($in['geo_accuracy_m'] ?? ($in['accuracy_m'] ?? null)));

        $lat = is_numeric($latRaw) ? (float)$latRaw : null;
        $lng = is_numeric($lngRaw) ? (float)$lngRaw : null;
        $acc = is_numeric($accRaw) ? (int)round((float)$accRaw) : null;

        if ($lat !== null && ($lat < -90.0 || $lat > 90.0)) $lat = null;
        if ($lng !== null && ($lng < -180.0 || $lng > 180.0)) $lng = null;
        if ($acc !== null && ($acc < 0 || $acc > 1000000)) $acc = null;

        if ($lat === null || $lng === null) return [null, null, null];
        return [$lat, $lng, $acc];
    }

    private function hammingDistanceHex(string $a, string $b): int
    {
        $a = strtolower(trim($a));
        $b = strtolower(trim($b));
        if (strlen($a) !== strlen($b)) return 9999;
        $pop = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
        $dist = 0;
        $len = strlen($a);
        for ($i = 0; $i < $len; $i++) {
            $va = hexdec($a[$i]);
            $vb = hexdec($b[$i]);
            $dist += $pop[$va ^ $vb] ?? 0;
        }
        return $dist;
    }

    private function isAHashTemplateHash(string $hash): bool
    {
        $h = strtolower(trim($hash));
        if (!preg_match('/^[0-9a-f]{64}$/', $h)) return false;
        return preg_match('/^[0-9a-f]{16}0{48}$/', $h) === 1;
    }

    private function computeTemplateHash(string $imageBytes, string $modality): string
    {
        if ($modality === 'face') {
            $this->assertFaceDetected($imageBytes);
        }
        return hash('sha256', $imageBytes);
    }

    private function faceApiUrl(): ?string
    {
        $raw = getenv('FACE_API_URL') ?: '';
        $url = trim((string)$raw);
        if ($url === '') return null;
        return rtrim($url, '/');
    }

    private function callFaceApiJson(string $path, array $payload): array
    {
        $base = $this->faceApiUrl();
        if (!$base) throw new \Exception('Face recognition unavailable');

        $url = $base . $path;
        $body = json_encode($payload);
        if (!is_string($body)) throw new \Exception('Face recognition unavailable');

        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nAccept: application/json\r\n",
                'content' => $body,
                'ignore_errors' => true,
                'timeout' => 12,
            ],
        ]);

        $raw = @file_get_contents($url, false, $ctx);
        if (!is_string($raw) || $raw === '') throw new \Exception('Face recognition unavailable');
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) throw new \Exception('Face recognition unavailable');
        return $decoded;
    }

    private function assertFaceDetected(string $imageBytes): void
    {
        $apiUrl = $this->faceApiUrl();
        if ($apiUrl) {
            $res = $this->callFaceApiJson('/faces/count', ['image_b64' => base64_encode($imageBytes)]);
            $faces = $res['faces'] ?? null;
            if (!is_int($faces) && !is_numeric($faces)) throw new \Exception('Face recognition unavailable');
            if ((int)$faces < 1) throw new \Exception('No face detected in image');
            return;
        }

        $tmp = tempnam(sys_get_temp_dir(), 'att_face_');
        if (!$tmp) throw new \Exception('Face recognition unavailable');
        $path = $tmp . '.jpg';
        @rename($tmp, $path);
        $written = @file_put_contents($path, $imageBytes);
        if (!is_int($written) || $written <= 0) {
            @unlink($path);
            throw new \Exception('Face recognition unavailable');
        }

        try {
            $res = $this->runPythonJson(
                implode("\n", [
                    'import sys, json',
                    'try:',
                    '  import face_recognition',
                    'except Exception as e:',
                    '  print(json.dumps({"error":"module_missing","detail":str(e)}))',
                    '  sys.exit(2)',
                    'p = sys.argv[1]',
                    'try:',
                    '  img = face_recognition.load_image_file(p)',
                    '  loc = face_recognition.face_locations(img)',
                    '  print(json.dumps({"faces":len(loc)}))',
                    '  sys.exit(0)',
                    'except Exception as e:',
                    '  print(json.dumps({"error":"processing_failed","detail":str(e)}))',
                    '  sys.exit(1)',
                ]),
                [$path]
            );

            if (($res['error'] ?? null) === 'module_missing') throw new \Exception('face_recognition module is not installed on server');
            if (!isset($res['faces']) || !is_int($res['faces'])) throw new \Exception('Face recognition unavailable');
            if ($res['faces'] < 1) throw new \Exception('No face detected in image');
        } finally {
            @unlink($path);
        }
    }

    private function computeFaceDistance(string $enrolledImageBytes, string $probeImageBytes): float
    {
        $apiUrl = $this->faceApiUrl();
        if ($apiUrl) {
            $res = $this->callFaceApiJson('/faces/distance', [
                'image1_b64' => base64_encode($enrolledImageBytes),
                'image2_b64' => base64_encode($probeImageBytes),
            ]);
            if (isset($res['distance']) && is_numeric($res['distance'])) return (float)$res['distance'];
            if (($res['error'] ?? null) === 'no_face_enrolled') throw new \Exception('No face detected in enrolled template');
            if (($res['error'] ?? null) === 'no_face_probe') throw new \Exception('No face detected in image');
            throw new \Exception('Face recognition unavailable');
        }

        $tmp1 = tempnam(sys_get_temp_dir(), 'att_face_enr_');
        $tmp2 = tempnam(sys_get_temp_dir(), 'att_face_prb_');
        if (!$tmp1 || !$tmp2) throw new \Exception('Face recognition unavailable');
        $p1 = $tmp1 . '.jpg';
        $p2 = $tmp2 . '.jpg';
        @rename($tmp1, $p1);
        @rename($tmp2, $p2);

        $w1 = @file_put_contents($p1, $enrolledImageBytes);
        $w2 = @file_put_contents($p2, $probeImageBytes);
        if (!is_int($w1) || $w1 <= 0 || !is_int($w2) || $w2 <= 0) {
            @unlink($p1);
            @unlink($p2);
            throw new \Exception('Face recognition unavailable');
        }

        try {
            $res = $this->runPythonJson(
                implode("\n", [
                    'import sys, json',
                    'try:',
                    '  import face_recognition',
                    'except Exception as e:',
                    '  print(json.dumps({"error":"module_missing","detail":str(e)}))',
                    '  sys.exit(2)',
                    'p1 = sys.argv[1]',
                    'p2 = sys.argv[2]',
                    'try:',
                    '  img1 = face_recognition.load_image_file(p1)',
                    '  img2 = face_recognition.load_image_file(p2)',
                    '  enc1 = face_recognition.face_encodings(img1)',
                    '  enc2 = face_recognition.face_encodings(img2)',
                    '  if not enc1:',
                    '    print(json.dumps({"error":"no_face_enrolled"}))',
                    '    sys.exit(3)',
                    '  if not enc2:',
                    '    print(json.dumps({"error":"no_face_probe"}))',
                    '    sys.exit(4)',
                    '  dist = float(face_recognition.face_distance([enc1[0]], enc2[0])[0])',
                    '  print(json.dumps({"distance":dist}))',
                    '  sys.exit(0)',
                    'except Exception as e:',
                    '  print(json.dumps({"error":"processing_failed","detail":str(e)}))',
                    '  sys.exit(1)',
                ]),
                [$p1, $p2]
            );

            if (($res['error'] ?? null) === 'module_missing') throw new \Exception('face_recognition module is not installed on server');
            if (isset($res['distance']) && is_float($res['distance'])) return $res['distance'];
            if (isset($res['distance']) && is_numeric($res['distance'])) return (float)$res['distance'];
            if (($res['error'] ?? null) === 'no_face_enrolled') throw new \Exception('No face detected in enrolled template');
            if (($res['error'] ?? null) === 'no_face_probe') throw new \Exception('No face detected in image');
            throw new \Exception('Face recognition unavailable');
        } finally {
            @unlink($p1);
            @unlink($p2);
        }
    }

    private function runPythonJson(string $code, array $args): array
    {
        $candidates = [
            ['python'],
            ['python3'],
            ['py', '-3'],
        ];

        $lastStdout = '';
        $lastStderr = '';
        $lastExit = null;

        foreach ($candidates as $base) {
            $parts = array_merge($base, ['-c', $code], $args);
            $cmd = implode(' ', array_map('escapeshellarg', $parts));

            $spec = [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
            ];
            $proc = @proc_open($cmd, $spec, $pipes);
            if (!is_resource($proc)) continue;

            fclose($pipes[0]);
            $stdout = stream_get_contents($pipes[1]);
            $stderr = stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            $exit = proc_close($proc);

            $lastStdout = is_string($stdout) ? $stdout : '';
            $lastStderr = is_string($stderr) ? $stderr : '';
            $lastExit = is_int($exit) ? $exit : null;

            $decoded = json_decode(trim($lastStdout), true);
            if (is_array($decoded)) return $decoded;

            if ($lastExit === 0) throw new \Exception('Face recognition unavailable');
        }

        if ($lastExit !== null) throw new \Exception('Face recognition unavailable');
        throw new \Exception('Python is not available on server');
    }

    private function requireBiometricMatch($pdo, int $tenantId, int $employeeId, string $modality, string $imageBytes, ?string $providedHash = null): string
    {
        $evidenceHash = hash('sha256', $imageBytes);
        $stmt = $pdo->prepare('SELECT sha256, image FROM biometric_templates WHERE tenant_id=? AND employee_id=? AND modality=? LIMIT 1');
        $stmt->execute([(int)$tenantId, (int)$employeeId, $modality]);
        $tpl = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!is_array($tpl)) throw new \Exception('Biometric not enrolled');
        $expected = isset($tpl['sha256']) && is_string($tpl['sha256']) ? strtolower(trim($tpl['sha256'])) : '';
        $enrolledImage = $tpl['image'] ?? null;

        if ($modality === 'face' && is_string($enrolledImage) && $enrolledImage !== '') {
            $dist = $this->computeFaceDistance($enrolledImage, $imageBytes);
            if ($dist > 0.55) throw new \Exception('Biometric mismatch');
            return $evidenceHash;
        }

        if ($expected === '') throw new \Exception('Biometric not enrolled');

        if ($this->isAHashTemplateHash($expected)) {
            $expectedA = substr($expected, 0, 16);
            $providedA = $this->normalizeBiometricHash($providedHash ?? '');
            if (!$providedA) throw new \Exception('Biometric mismatch');
            $dist = $this->hammingDistanceHex($expectedA, $providedA);
            $threshold = $modality === 'face' ? 12 : 8;
            if ($dist > $threshold) throw new \Exception('Biometric mismatch');
            return $evidenceHash;
        }

        if (!hash_equals($expected, $evidenceHash)) throw new \Exception('Biometric mismatch');
        return $evidenceHash;
    }

    private function insertBiometricEvidence($pdo, int $tenantId, int $employeeId, ?int $attendanceRecordId, string $eventType, string $modality, string $hash, ?float $lat, ?float $lng, ?int $accuracyM, string $mime, string $imageBytes): void
    {
        $stmt = $pdo->prepare('INSERT INTO biometric_evidence (tenant_id, employee_id, attendance_record_id, event_type, modality, sha256, matched, latitude, longitude, accuracy_m, mime, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->bindValue(1, (int)$tenantId, \PDO::PARAM_INT);
        $stmt->bindValue(2, (int)$employeeId, \PDO::PARAM_INT);
        if ($attendanceRecordId === null) $stmt->bindValue(3, null, \PDO::PARAM_NULL);
        else $stmt->bindValue(3, (int)$attendanceRecordId, \PDO::PARAM_INT);
        $stmt->bindValue(4, $eventType);
        $stmt->bindValue(5, $modality);
        $stmt->bindValue(6, $hash);
        $stmt->bindValue(7, 1, \PDO::PARAM_INT);
        if ($lat === null) $stmt->bindValue(8, null, \PDO::PARAM_NULL);
        else $stmt->bindValue(8, $lat);
        if ($lng === null) $stmt->bindValue(9, null, \PDO::PARAM_NULL);
        else $stmt->bindValue(9, $lng);
        if ($accuracyM === null) $stmt->bindValue(10, null, \PDO::PARAM_NULL);
        else $stmt->bindValue(10, (int)$accuracyM, \PDO::PARAM_INT);
        $stmt->bindValue(11, $mime);
        $stmt->bindValue(12, $imageBytes, \PDO::PARAM_LOB);
        $stmt->execute();
    }

    public function list()
    {
        header('Content-Type: application/json');
        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }
        $start = $_GET['start'] ?? null;
        $end = $_GET['end'] ?? null;
        $employeeId = $_GET['employee_id'] ?? null;
        $limit = $_GET['limit'] ?? 5000;
        if (($user['role'] ?? null) === 'employee') {
            $mapped = (int)($user['employee_id'] ?? 0);
            if ($mapped <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
            $employeeId = $mapped;
        }
        $attendance = $this->store->all($start, $end, $employeeId, $limit);
        echo json_encode(['attendance' => $this->normalizeAttendanceRecords($attendance)]);
    }

    public function dashboard()
    {
        \App\Core\Auth::requireRole('perm:attendance.read');
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            echo json_encode(['employees' => [], 'attendance' => $this->store->all(), 'days' => []]);
            return;
        }

        $user = \App\Core\Auth::currentUser() ?? [];
        $scopedEmployeeId = null;
        if (($user['role'] ?? null) === 'employee') {
            $mapped = (int)($user['employee_id'] ?? 0);
            if ($mapped <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
            $scopedEmployeeId = $mapped;
        }

        $startRaw = $_GET['start'] ?? date('Y-m-d');
        $endRaw = $_GET['end'] ?? $startRaw;
        [$start, $end] = $this->normalizeRange((string)$startRaw, (string)$endRaw);
        $limit = $_GET['limit'] ?? 10000;

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        if ($scopedEmployeeId) {
            $eStmt = $pdo->prepare('SELECT e.id, e.tenant_id, e.shift_id, s.name AS shift_name, s.working_days, e.name, e.code, e.status, e.created_at FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? AND e.id=? ORDER BY e.id DESC');
            $eStmt->execute([(int)$tenantId, (int)$scopedEmployeeId]);
        } else {
            $eStmt = $pdo->prepare('SELECT e.id, e.tenant_id, e.shift_id, s.name AS shift_name, s.working_days, e.name, e.code, e.status, e.created_at FROM employees e JOIN shifts s ON s.id = e.shift_id WHERE e.tenant_id=? ORDER BY e.id DESC');
            $eStmt->execute([(int)$tenantId]);
        }
        $employees = array_map(fn($r) => [
            'id' => (string)$r['id'],
            'tenant_id' => (string)$r['tenant_id'],
            'shift_id' => (string)($r['shift_id'] ?? ''),
            'shift_name' => (string)($r['shift_name'] ?? ''),
            'working_days' => (string)($r['working_days'] ?? ''),
            'name' => $r['name'],
            'code' => $r['code'],
            'status' => $r['status'],
            'created_at' => $r['created_at']
        ], $eStmt->fetchAll());

        $attendance = $this->normalizeAttendanceRecords($this->store->all($start, $end, $scopedEmployeeId, $limit));

        $ensureDays = filter_var($_GET['ensure_days'] ?? '0', \FILTER_VALIDATE_BOOL);
        if ($ensureDays) {
            $localTz = new \DateTimeZone('Asia/Dhaka');
            $utcTz = new \DateTimeZone('UTC');
            $rangeStartUtc = (new \DateTimeImmutable($start . ' 00:00:00', $localTz))->setTimezone($utcTz)->format('Y-m-d H:i:s');
            $rangeEndUtc = (new \DateTimeImmutable($end . ' 23:59:59', $localTz))->setTimezone($utcTz)->format('Y-m-d H:i:s');

            $rawExistsStmt = $pdo->prepare('SELECT 1 FROM raw_events WHERE tenant_id=? AND occurred_at_utc BETWEEN ? AND ? LIMIT 1');
            $rawExistsStmt->execute([(int)$tenantId, $rangeStartUtc, $rangeEndUtc]);
            $hasRaw = (bool)$rawExistsStmt->fetchColumn();

            if ($hasRaw) {
                $proc = new \App\Core\AttendanceProcessor();
                try {
                    $proc->processRange((int)$tenantId, $start, $end);
                } catch (\Exception $e) {
                }
            }
        }

        if ($scopedEmployeeId) {
            $dStmt = $pdo->prepare('SELECT employee_id, date, in_time, out_time, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, status FROM attendance_days WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ? ORDER BY date DESC, employee_id DESC');
            $dStmt->execute([(int)$tenantId, (int)$scopedEmployeeId, $start, $end]);
        } else {
            $dStmt = $pdo->prepare('SELECT employee_id, date, in_time, out_time, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, status FROM attendance_days WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date DESC, employee_id DESC');
            $dStmt->execute([(int)$tenantId, $start, $end]);
        }
        $days = array_map(fn($r) => [
            'employee_id' => (int)$r['employee_id'],
            'date' => $r['date'],
            'in_time' => $this->toTenantTime($r['in_time'] ?? null),
            'out_time' => $this->toTenantTime($r['out_time'] ?? null),
            'worked_minutes' => (int)$r['worked_minutes'],
            'late_minutes' => (int)($r['late_minutes'] ?? 0),
            'early_leave_minutes' => (int)($r['early_leave_minutes'] ?? 0),
            'overtime_minutes' => (int)($r['overtime_minutes'] ?? 0),
            'status' => $r['status']
        ], $dStmt->fetchAll());

        if ($scopedEmployeeId) {
            $lStmt = $pdo->prepare('SELECT id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ? ORDER BY date DESC, employee_id DESC, id DESC');
            $lStmt->execute([(int)$tenantId, (int)$scopedEmployeeId, $start, $end]);
        } else {
            $lStmt = $pdo->prepare('SELECT id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date DESC, employee_id DESC, id DESC');
            $lStmt->execute([(int)$tenantId, $start, $end]);
        }
        $leaves = $lStmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($leaves as &$l) {
            $l['status'] = $this->normalizeLeaveStatus($l['status'] ?? null);
        }
        unset($l);

        $hStmt = $pdo->prepare('SELECT id, date, name, created_at FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date ASC, id ASC');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidays = $hStmt->fetchAll(\PDO::FETCH_ASSOC);

        $leaveByEmpDate = [];
        foreach ($leaves as $l) {
            $empId = (int)($l['employee_id'] ?? 0);
            $dateStr = (string)($l['date'] ?? '');
            if ($empId <= 0 || $dateStr === '') continue;
            $key = $empId . '|' . $dateStr;
            $curId = isset($leaveByEmpDate[$key]) ? (int)($leaveByEmpDate[$key]['id'] ?? 0) : 0;
            $newId = (int)($l['id'] ?? 0);
            if ($newId >= $curId) $leaveByEmpDate[$key] = $l;
        }

        $daysByEmpDate = [];
        foreach ($days as $d) {
            $empId = (int)($d['employee_id'] ?? 0);
            $dateStr = (string)($d['date'] ?? '');
            if ($empId <= 0 || $dateStr === '') continue;
            $daysByEmpDate[$empId . '|' . $dateStr] = $d;
        }

        foreach ($leaveByEmpDate as $key => $l) {
            $status = strtolower((string)($l['status'] ?? ''));
            if ($status !== 'approved') continue;
            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $leaveStatus = $dayPart === 'full' ? 'Leave' : 'Half Leave';

            if (isset($daysByEmpDate[$key])) {
                $d = $daysByEmpDate[$key];
                $d['late_minutes'] = 0;
                $d['early_leave_minutes'] = 0;
                if ($dayPart === 'full') {
                    $d['status'] = $leaveStatus;
                } elseif ((string)($d['status'] ?? '') === 'Absent' && (int)($d['worked_minutes'] ?? 0) <= 0) {
                    $d['status'] = $leaveStatus;
                }
                $daysByEmpDate[$key] = $d;
            } else {
                [$empIdRaw, $dateStr] = explode('|', $key, 2);
                $daysByEmpDate[$key] = [
                    'employee_id' => (int)$empIdRaw,
                    'date' => $dateStr,
                    'in_time' => null,
                    'out_time' => null,
                    'worked_minutes' => 0,
                    'late_minutes' => 0,
                    'early_leave_minutes' => 0,
                    'overtime_minutes' => 0,
                    'status' => $leaveStatus,
                ];
            }
        }

        $days = array_values($daysByEmpDate);
        usort($days, function ($a, $b) {
            $d = strcmp((string)($b['date'] ?? ''), (string)($a['date'] ?? ''));
            if ($d !== 0) return $d;
            return (int)($b['employee_id'] ?? 0) <=> (int)($a['employee_id'] ?? 0);
        });

        $workingDaysByEmployee = [];
        foreach ($employees as $e) {
            $raw = (string)($e['working_days'] ?? '');
            $parts = $raw !== '' ? array_map('trim', explode(',', $raw)) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
            $set = [];
            foreach ($parts as $p) {
                if ($p === '') continue;
                $set[strtolower($p)] = true;
            }
            $workingDaysByEmployee[(int)$e['id']] = $set;
        }

        $holidaySet = [];
        foreach ($holidays as $h) {
            $d = (string)($h['date'] ?? '');
            if ($d !== '') $holidaySet[$d] = true;
        }

        $leaveTotalsByEmployee = [];
        foreach ($leaveByEmpDate as $key => $l) {
            $status = strtolower((string)($l['status'] ?? ''));
            if ($status !== 'approved') continue;
            $empId = (int)($l['employee_id'] ?? 0);
            $dateStr = (string)($l['date'] ?? '');
            if ($empId <= 0 || $dateStr === '') continue;
            if (isset($holidaySet[$dateStr])) continue;

            $wd = $workingDaysByEmployee[$empId] ?? null;
            if (is_array($wd)) {
                $dowKey = strtolower((new \DateTimeImmutable($dateStr, new \DateTimeZone('Asia/Dhaka')))->format('D'));
                if (!isset($wd[$dowKey])) continue;
            }

            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $amount = $dayPart === 'full' ? 1.0 : 0.5;
            $type = strtolower((string)($l['leave_type'] ?? 'casual'));
            $isUnpaid = $type === 'unpaid';
            if (!isset($leaveTotalsByEmployee[$empId])) {
                $leaveTotalsByEmployee[$empId] = [
                    'paid' => 0.0,
                    'unpaid' => 0.0,
                    'total' => 0.0,
                ];
            }
            $leaveTotalsByEmployee[$empId]['total'] += $amount;
            if ($isUnpaid) $leaveTotalsByEmployee[$empId]['unpaid'] += $amount;
            else $leaveTotalsByEmployee[$empId]['paid'] += $amount;
        }

        echo json_encode(['employees' => $employees, 'attendance' => $attendance, 'days' => $days, 'leaves' => $leaves, 'holidays' => $holidays, 'leave_totals' => $leaveTotalsByEmployee]);
    }

    public function days()
    {
        \App\Core\Auth::requireRole('perm:attendance.read');
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            echo json_encode(['days' => []]);
            return;
        }

        $user = \App\Core\Auth::currentUser() ?? [];
        $scopedEmployeeId = null;
        if (($user['role'] ?? null) === 'employee') {
            $mapped = (int)($user['employee_id'] ?? 0);
            if ($mapped <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
            $scopedEmployeeId = $mapped;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $start = $_GET['start'] ?? date('Y-m-d');
        $end = $_GET['end'] ?? $start;
        $employeeId = $_GET['employee_id'] ?? null;
        if ($scopedEmployeeId) $employeeId = $scopedEmployeeId;
        $limit = (int)($_GET['limit'] ?? 5000);
        if ($limit <= 0) $limit = 5000;
        if ($limit > 10000) $limit = 10000;

        $where = 'WHERE tenant_id=? AND date BETWEEN ? AND ?';
        $params = [(int)$tenantId, $start, $end];
        if ($employeeId !== null && $employeeId !== '') {
            $where .= ' AND employee_id=?';
            $params[] = (int)$employeeId;
        }

        $sql = "SELECT employee_id, date, in_time, out_time, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, status FROM attendance_days $where ORDER BY date DESC, employee_id DESC LIMIT $limit";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $days = array_map(fn($r) => [
            'employee_id' => (int)$r['employee_id'],
            'date' => $r['date'],
            'in_time' => $this->toTenantTime($r['in_time'] ?? null),
            'out_time' => $this->toTenantTime($r['out_time'] ?? null),
            'worked_minutes' => (int)$r['worked_minutes'],
            'late_minutes' => (int)($r['late_minutes'] ?? 0),
            'early_leave_minutes' => (int)($r['early_leave_minutes'] ?? 0),
            'overtime_minutes' => (int)($r['overtime_minutes'] ?? 0),
            'status' => $r['status']
        ], $stmt->fetchAll());

        echo json_encode(['days' => $days]);
    }

    public function clockIn()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        try {
            $user = \App\Core\Auth::currentUser();
            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }
            if (($user['role'] ?? null) === 'employee') {
                $mapped = (int)($user['employee_id'] ?? 0);
                if ($mapped <= 0) throw new \Exception('Employee account not linked');
                $in['employee_id'] = $mapped;
            }
            $pdo = \App\Core\Database::get();
            if (!$pdo) throw new \Exception('Database unavailable');

            $tenantId = $user['tenant_id'] ?? null;
            if (!$tenantId) $tenantId = $this->resolveTenantId($pdo);
            if (!$tenantId) throw new \Exception('tenant not resolved');

            $employeeId = (int)($in['employee_id'] ?? 0);
            if ($employeeId <= 0) throw new \Exception('employee_id is required');

            $modality = $this->normalizeBiometricModality($in['biometric_modality'] ?? ($in['modality'] ?? null));
            if (!$modality) throw new \Exception('Biometric modality is required');
            [$mime, $bytes] = $this->decodeBiometricImage($in['biometric_image'] ?? ($in['image'] ?? null));
            $hash = $this->requireBiometricMatch($pdo, (int)$tenantId, (int)$employeeId, $modality, $bytes);
            [$lat, $lng, $acc] = $this->extractGeo($in);

            $r = $this->store->clockIn($employeeId, $tenantId);
            $rid = isset($r['id']) ? (int)$r['id'] : null;
            if ($rid) {
                $m = 'face';
                $upd = $pdo->prepare('UPDATE attendance_records SET clock_in_method=?, clock_in_lat=?, clock_in_lng=?, clock_in_accuracy_m=? WHERE id=?');
                $upd->execute([$m, $lat, $lng, $acc, $rid]);
                $r['clock_in_method'] = $m;
                $r['clock_in_lat'] = $lat;
                $r['clock_in_lng'] = $lng;
                $r['clock_in_accuracy_m'] = $acc;
            }
            $this->insertBiometricEvidence($pdo, (int)$tenantId, (int)$employeeId, $rid, 'clock_in', $modality, $hash, $lat, $lng, $acc, $mime, $bytes);
            echo json_encode(['record' => $r]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function clockOut()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        try {
            $user = \App\Core\Auth::currentUser();
            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }
            if (($user['role'] ?? null) === 'employee') {
                $mapped = (int)($user['employee_id'] ?? 0);
                if ($mapped <= 0) throw new \Exception('Employee account not linked');
                $in['employee_id'] = $mapped;
            }
            $pdo = \App\Core\Database::get();
            if (!$pdo) throw new \Exception('Database unavailable');

            $tenantId = $user['tenant_id'] ?? null;
            if (!$tenantId) $tenantId = $this->resolveTenantId($pdo);
            if (!$tenantId) throw new \Exception('tenant not resolved');

            $employeeId = (int)($in['employee_id'] ?? 0);
            if ($employeeId <= 0) throw new \Exception('employee_id is required');

            $modality = $this->normalizeBiometricModality($in['biometric_modality'] ?? ($in['modality'] ?? null));
            if (!$modality) throw new \Exception('Biometric modality is required');
            [$mime, $bytes] = $this->decodeBiometricImage($in['biometric_image'] ?? ($in['image'] ?? null));
            $hash = $this->requireBiometricMatch($pdo, (int)$tenantId, (int)$employeeId, $modality, $bytes);
            [$lat, $lng, $acc] = $this->extractGeo($in);

            $r = $this->store->clockOut($employeeId, $tenantId);
            $rid = isset($r['id']) ? (int)$r['id'] : null;
            if ($rid) {
                $m = 'face';
                $upd = $pdo->prepare('UPDATE attendance_records SET clock_out_method=?, clock_out_lat=?, clock_out_lng=?, clock_out_accuracy_m=? WHERE id=?');
                $upd->execute([$m, $lat, $lng, $acc, $rid]);
                $r['clock_out_method'] = $m;
                $r['clock_out_lat'] = $lat;
                $r['clock_out_lng'] = $lng;
                $r['clock_out_accuracy_m'] = $acc;
            }
            $this->insertBiometricEvidence($pdo, (int)$tenantId, (int)$employeeId, $rid, 'clock_out', $modality, $hash, $lat, $lng, $acc, $mime, $bytes);
            echo json_encode(['record' => $r]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function enrollBiometric()
    {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true);
        try {
            $user = \App\Core\Auth::currentUser();
            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }
            $role = (string)($user['role'] ?? '');
            if ($role === 'employee' || $role === 'superadmin') {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden']);
                return;
            }
            \App\Core\Auth::requireRole('perm:employees.write');

            $pdo = \App\Core\Database::get();
            if (!$pdo) throw new \Exception('Database unavailable');

            $tenantId = $user['tenant_id'] ?? null;
            if (!$tenantId) $tenantId = $this->resolveTenantId($pdo);
            if (!$tenantId) throw new \Exception('tenant not resolved');

            $employeeId = (int)($in['employee_id'] ?? 0);
            if ($employeeId <= 0) throw new \Exception('employee_id is required');

            $modality = $this->normalizeBiometricModality($in['biometric_modality'] ?? ($in['modality'] ?? null));
            if (!$modality) throw new \Exception('Biometric modality is required');

            [$mime, $bytes] = $this->decodeBiometricImage($in['biometric_image'] ?? ($in['image'] ?? null));
            $hash = $this->computeTemplateHash($bytes, $modality);

            $chk = $pdo->prepare('SELECT id FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
            $chk->execute([(int)$tenantId, (int)$employeeId]);
            if (!$chk->fetchColumn()) throw new \Exception('Employee not in tenant');

            $stmt = $pdo->prepare('INSERT INTO biometric_templates (tenant_id, employee_id, modality, sha256, mime, image) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE sha256=VALUES(sha256), mime=VALUES(mime), image=VALUES(image), updated_at=CURRENT_TIMESTAMP');
            $stmt->bindValue(1, (int)$tenantId, \PDO::PARAM_INT);
            $stmt->bindValue(2, (int)$employeeId, \PDO::PARAM_INT);
            $stmt->bindValue(3, $modality);
            $stmt->bindValue(4, $hash);
            $stmt->bindValue(5, $mime);
            $stmt->bindValue(6, $bytes, \PDO::PARAM_LOB);
            $stmt->execute();

            echo json_encode(['ok' => true, 'modality' => $modality]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function evidence()
    {
        header('Content-Type: application/json');
        try {
            $user = \App\Core\Auth::currentUser();
            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }
            $pdo = \App\Core\Database::get();
            if (!$pdo) throw new \Exception('Database unavailable');

            $tenantId = $user['tenant_id'] ?? null;
            if (!$tenantId) $tenantId = $this->resolveTenantId($pdo);
            if (!$tenantId) throw new \Exception('tenant not resolved');

            $attendanceRecordId = (int)($_GET['attendance_record_id'] ?? ($_GET['record_id'] ?? 0));
            if ($attendanceRecordId <= 0) throw new \Exception('attendance_record_id is required');

            $params = [(int)$tenantId, $attendanceRecordId];
            $where = 'WHERE tenant_id=? AND attendance_record_id=?';

            if (($user['role'] ?? null) === 'employee') {
                $mapped = (int)($user['employee_id'] ?? 0);
                if ($mapped <= 0) throw new \Exception('Employee account not linked');
                $where .= ' AND employee_id=?';
                $params[] = $mapped;
            }

            $stmt = $pdo->prepare("SELECT id, employee_id, attendance_record_id, event_type, modality, matched, sha256, latitude, longitude, accuracy_m, mime, image, created_at FROM biometric_evidence $where ORDER BY id ASC LIMIT 20");
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            $out = [];
            foreach ($rows as $r) {
                $mime = (string)($r['mime'] ?? 'application/octet-stream');
                $bytes = $r['image'] ?? '';
                $b64 = is_string($bytes) ? base64_encode($bytes) : '';
                $lat = isset($r['latitude']) && is_numeric($r['latitude']) ? (float)$r['latitude'] : null;
                $lng = isset($r['longitude']) && is_numeric($r['longitude']) ? (float)$r['longitude'] : null;
                $acc = isset($r['accuracy_m']) && is_numeric($r['accuracy_m']) ? (int)$r['accuracy_m'] : null;
                $out[] = [
                    'id' => (string)($r['id'] ?? ''),
                    'employee_id' => (string)($r['employee_id'] ?? ''),
                    'attendance_record_id' => (string)($r['attendance_record_id'] ?? ''),
                    'event_type' => (string)($r['event_type'] ?? ''),
                    'modality' => (string)($r['modality'] ?? ''),
                    'matched' => (int)($r['matched'] ?? 0),
                    'sha256' => (string)($r['sha256'] ?? ''),
                    'created_at' => (string)($r['created_at'] ?? ''),
                    'latitude' => $lat,
                    'longitude' => $lng,
                    'accuracy_m' => $acc,
                    'image_data_url' => $b64 !== '' ? ('data:' . $mime . ';base64,' . $b64) : null,
                ];
            }

            echo json_encode(['evidence' => $out]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function rawEvents()
    {
        header('Content-Type: application/json');
        try {
            $user = \App\Core\Auth::currentUser();
            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                return;
            }

            $pdo = \App\Core\Database::get();
            if (!$pdo) throw new \Exception('Database unavailable');

            $tenantId = $user['tenant_id'] ?? null;
            if (!$tenantId) $tenantId = $this->resolveTenantId($pdo);
            if (!$tenantId) throw new \Exception('tenant not resolved');

            $employeeId = (int)($_GET['employee_id'] ?? 0);
            if (($user['role'] ?? null) === 'employee') {
                $mapped = (int)($user['employee_id'] ?? 0);
                if ($mapped <= 0) throw new \Exception('Employee account not linked');
                $employeeId = $mapped;
            }
            if ($employeeId <= 0) throw new \Exception('employee_id is required');

            $date = $_GET['date'] ?? null;
            $startDate = $_GET['start_date'] ?? (is_string($date) ? $date : date('Y-m-d'));
            $endDate = $_GET['end_date'] ?? $startDate;
            [$startDate, $endDate] = $this->normalizeRange((string)$startDate, (string)$endDate);

            $limit = (int)($_GET['limit'] ?? 2000);
            if ($limit <= 0) $limit = 2000;
            if ($limit > 5000) $limit = 5000;

            $includePayload = ($_GET['include_payload'] ?? '') === '1';

            $empCheck = $pdo->prepare('SELECT id FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
            $empCheck->execute([(int)$tenantId, (int)$employeeId]);
            if (!$empCheck->fetchColumn()) throw new \Exception('Employee not in tenant');

            $dhakaTz = new \DateTimeZone('Asia/Dhaka');
            $utcTz = new \DateTimeZone('UTC');
            $localStart = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $startDate . ' 00:00:00', $dhakaTz);
            $localEnd = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $endDate . ' 23:59:59', $dhakaTz);
            $startUtc = $localStart ? $localStart->setTimezone($utcTz)->format('Y-m-d H:i:s') : ($startDate . ' 00:00:00');
            $endUtc = $localEnd ? $localEnd->setTimezone($utcTz)->format('Y-m-d H:i:s') : ($endDate . ' 23:59:59');

            $select = $includePayload
                ? 'id, tenant_id, device_id, employee_id, event_type, occurred_at_utc, raw_payload, created_at'
                : 'id, tenant_id, device_id, employee_id, event_type, occurred_at_utc, created_at';
            $stmt = $pdo->prepare("SELECT $select FROM raw_events WHERE tenant_id=? AND employee_id=? AND occurred_at_utc BETWEEN ? AND ? ORDER BY occurred_at_utc ASC LIMIT $limit");
            $stmt->execute([(int)$tenantId, (int)$employeeId, $startUtc, $endUtc]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            $out = [];
            foreach ($rows as $r) {
                $payload = $includePayload ? ($r['raw_payload'] ?? null) : null;
                if ($includePayload && is_string($payload) && $payload !== '') {
                    $decoded = json_decode($payload, true);
                    if (json_last_error() === \JSON_ERROR_NONE) $payload = $decoded;
                }

                $occurredUtc = is_string($r['occurred_at_utc'] ?? null) ? (string)$r['occurred_at_utc'] : '';
                $out[] = [
                    'id' => (string)($r['id'] ?? ''),
                    'device_id' => (string)($r['device_id'] ?? ''),
                    'employee_id' => (string)($r['employee_id'] ?? ''),
                    'event_type' => (string)($r['event_type'] ?? ''),
                    'occurred_at_utc' => $occurredUtc,
                    'occurred_at' => $this->toTenantTime($occurredUtc),
                    'created_at' => (string)($r['created_at'] ?? ''),
                    'raw_payload' => $includePayload ? $payload : null,
                ];
            }

            echo json_encode([
                'employee_id' => (string)$employeeId,
                'start_date' => $startDate,
                'end_date' => $endDate,
                'events' => $out,
            ]);
        } catch (\Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    public function openShift()
    {
        header('Content-Type: application/json');
        $employeeId = $_GET['employee_id'] ?? null;
        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }
        if (($user['role'] ?? null) === 'employee') {
            $mapped = (int)($user['employee_id'] ?? 0);
            if ($mapped <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
            $employeeId = (string)$mapped;
        }
        if (!$employeeId) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing employee id']);
            return;
        }

        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            $records = $this->store->all();
            foreach ($records as $r) {
                if ((string)($r['employee_id'] ?? '') === (string)$employeeId && empty($r['clock_out'])) {
                    echo json_encode(['open' => true, 'record' => $r]);
                    return;
                }
            }
            echo json_encode(['open' => false]);
            return;
        }

        $tenantId = $user['tenant_id'] ?? null;
        if (!$tenantId) {
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) {
                $t = $pdo->prepare('SELECT id FROM tenants WHERE subdomain=?');
                $t->execute([$hint]);
                $row = $t->fetch();
                if ($row) $tenantId = (int)$row['id'];
            }
        }
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT id FROM employees WHERE id=? AND tenant_id=?');
        $empCheck->execute([(int)$employeeId, (int)$tenantId]);
        if (!$empCheck->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $stmt = $pdo->prepare('SELECT id, employee_id, clock_in, clock_out, duration_minutes, date, status, late_minutes, early_leave_minutes, clock_in_method, clock_in_lat, clock_in_lng, clock_in_accuracy_m, clock_in_device_id, clock_out_method, clock_out_lat, clock_out_lng, clock_out_accuracy_m, clock_out_device_id FROM attendance_records WHERE employee_id=? AND clock_out IS NULL ORDER BY id DESC LIMIT 1');
        $stmt->execute([(int)$employeeId]);
        $r = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$r) {
            echo json_encode(['open' => false]);
            return;
        }
        $r = $this->normalizeAttendanceRecordRow($r);
        $r['id'] = (string)$r['id'];
        $r['employee_id'] = (string)$r['employee_id'];

        echo json_encode(['open' => true, 'record' => $r]);
    }

    public function process()
    {
        \App\Core\Auth::requireRole('perm:attendance.read');
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) { http_response_code(400); echo json_encode(['error'=>'tenant not resolved']); return; }
        $in = json_decode(file_get_contents('php://input'), true);
        $start = $in['start_date'] ?? date('Y-m-d');
        $end = $in['end_date'] ?? $start;
        $proc = new \App\Core\AttendanceProcessor();
        $res = $proc->processRange($tenantId, $start, $end);
        echo json_encode(['processed' => $res]);
    }

    public function employeeStats()
    {
        header('Content-Type: application/json');
        $employeeId = $_GET['id'] ?? null;
        $month = $_GET['month'] ?? date('Y-m'); // Format YYYY-MM
        
        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }
        if (($user['role'] ?? null) === 'employee') {
            $mapped = (int)($user['employee_id'] ?? 0);
            if ($mapped <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
            $employeeId = (string)$mapped;
        }

        if (!$employeeId) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing employee id']);
            return;
        }

        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        // Get tenant from user context
        $tenantId = $user['tenant_id'] ?? null;
        if (!$tenantId) {
             // Try to resolve from hint if not in user context (unlikely for this endpoint but safe)
            $hint = $_SERVER['HTTP_X_TENANT_ID'] ?? null;
            if ($hint) { $t=$pdo->prepare('SELECT id FROM tenants WHERE subdomain=?'); $t->execute([$hint]); $row=$t->fetch(); if($row){ $tenantId=(int)$row['id']; } }
        }

        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'Tenant context missing']);
            return;
        }

        // Verify employee belongs to tenant
        $empCheck = $pdo->prepare('SELECT id FROM employees WHERE id=? AND tenant_id=?');
        $empCheck->execute([(int)$employeeId, (int)$tenantId]);
        if (!$empCheck->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        // Fetch Attendance Records (from attendance_records table)
        // Filter by month on date column
        $start = "$month-01";
        $end = date("Y-m-t", strtotime($start));

        $attendance = [];
        $existingDates = [];

        $stmt = $pdo->prepare('SELECT id, employee_id, clock_in, clock_out, duration_minutes, date, status, late_minutes, early_leave_minutes, overtime_minutes, clock_in_method, clock_in_lat, clock_in_lng, clock_in_accuracy_m, clock_in_device_id, clock_out_method, clock_out_lat, clock_out_lng, clock_out_accuracy_m, clock_out_device_id FROM attendance_records WHERE employee_id=? AND date BETWEEN ? AND ? ORDER BY date ASC, clock_in ASC, id ASC');
        $stmt->execute([(int)$employeeId, $start, $end]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        foreach ($rows as $r) {
            if (!is_array($r)) continue;
            $r = $this->normalizeAttendanceRecordRow($r);
            $r['id'] = (string)($r['id'] ?? '');
            $r['employee_id'] = (string)($r['employee_id'] ?? '');
            $attendance[] = $r;

            $d = $r['date'] ?? null;
            if (is_string($d) && $d !== '') $existingDates[$d] = true;
        }

        if (!$attendance) {
            $punchStmt = $pdo->prepare("SELECT device_id, occurred_at_utc FROM raw_events WHERE tenant_id=? AND employee_id=? AND event_type='punch' AND occurred_at_utc BETWEEN ? AND ? ORDER BY occurred_at_utc ASC");
            $punchStmt->execute([(int)$tenantId, (int)$employeeId, $start . ' 00:00:00', $end . ' 23:59:59']);
            $punchRows = $punchStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            if ($punchRows) {
                $punchesByDate = [];
                foreach ($punchRows as $pr) {
                    $ts = $pr['occurred_at_utc'] ?? null;
                    if (!is_string($ts) || $ts === '') continue;
                    $local = $this->toTenantTime($ts);
                    if (!is_string($local) || $local === '') continue;
                    $dateStr = substr($local, 0, 10);
                    if (!is_string($dateStr) || $dateStr === '') continue;
                    if (!isset($punchesByDate[$dateStr])) $punchesByDate[$dateStr] = [];
                    $punchesByDate[$dateStr][] = [
                        'ts' => $local,
                        'device_id' => is_string($pr['device_id'] ?? null) ? (string)$pr['device_id'] : null,
                    ];
                }

                foreach ($punchesByDate as $dateStr => $list) {
                    if (!is_array($list) || !$list) continue;
                    usort($list, fn($a, $b) => strcmp((string)($a['ts'] ?? ''), (string)($b['ts'] ?? '')));

                    for ($i = 0; $i + 1 < count($list); $i += 2) {
                        $in = (string)($list[$i]['ts'] ?? '');
                        $out = (string)($list[$i + 1]['ts'] ?? '');
                        $dur = 0;
                        $inTs = $in !== '' ? strtotime($in) : false;
                        $outTs = $out !== '' ? strtotime($out) : false;
                        if ($inTs !== false && $outTs !== false && $outTs > $inTs) {
                            $dur = (int)floor(($outTs - $inTs) / 60);
                        }
                        $attendance[] = [
                            'id' => null,
                            'employee_id' => (string)$employeeId,
                            'date' => $dateStr,
                            'clock_in' => $in,
                            'clock_out' => $out,
                            'duration_minutes' => $dur,
                            'clock_in_method' => 'machine',
                            'clock_out_method' => 'machine',
                            'clock_in_device_id' => $list[$i]['device_id'] ?? null,
                            'clock_out_device_id' => $list[$i + 1]['device_id'] ?? null,
                            'clock_in_lat' => null,
                            'clock_in_lng' => null,
                            'clock_in_accuracy_m' => null,
                            'clock_out_lat' => null,
                            'clock_out_lng' => null,
                            'clock_out_accuracy_m' => null,
                        ];
                        $existingDates[$dateStr] = true;
                    }

                    if ((count($list) % 2) === 1) {
                        $last = $list[count($list) - 1] ?? null;
                        $in = is_array($last) ? (string)($last['ts'] ?? '') : '';
                        if ($in !== '') {
                            $attendance[] = [
                                'id' => null,
                                'employee_id' => (string)$employeeId,
                                'date' => $dateStr,
                                'clock_in' => $in,
                                'clock_out' => null,
                                'duration_minutes' => 0,
                                'clock_in_method' => 'machine',
                                'clock_out_method' => null,
                                'clock_in_device_id' => is_array($last) ? ($last['device_id'] ?? null) : null,
                                'clock_out_device_id' => null,
                                'clock_in_lat' => null,
                                'clock_in_lng' => null,
                                'clock_in_accuracy_m' => null,
                                'clock_out_lat' => null,
                                'clock_out_lng' => null,
                                'clock_out_accuracy_m' => null,
                            ];
                            $existingDates[$dateStr] = true;
                        }
                    }
                }

                usort($attendance, function ($a, $b) {
                    $d = strcmp((string)($a['date'] ?? ''), (string)($b['date'] ?? ''));
                    if ($d !== 0) return $d;
                    return strcmp((string)($a['clock_in'] ?? ''), (string)($b['clock_in'] ?? ''));
                });
            }
        }

        $dayStmt = $pdo->prepare('SELECT date, in_time, out_time, worked_minutes FROM attendance_days WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ? ORDER BY date ASC');
        $dayStmt->execute([(int)$tenantId, (int)$employeeId, $start, $end]);
        $days = $dayStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        foreach ($days as $d) {
            $dateStr = $d['date'] ?? null;
            if (!is_string($dateStr) || $dateStr === '') continue;
            if (isset($existingDates[$dateStr])) continue;
            $in = $d['in_time'] ?? null;
            if (!is_string($in) || $in === '') continue;
            $attendance[] = [
                'id' => null,
                'employee_id' => (string)$employeeId,
                'date' => $dateStr,
                'clock_in' => $in,
                'clock_out' => is_string($d['out_time'] ?? null) ? $d['out_time'] : null,
                'duration_minutes' => (int)($d['worked_minutes'] ?? 0),
                'clock_in_method' => null,
                'clock_out_method' => null,
                'clock_in_lat' => null,
                'clock_in_lng' => null,
                'clock_in_accuracy_m' => null,
                'clock_out_lat' => null,
                'clock_out_lng' => null,
                'clock_out_accuracy_m' => null,
                'clock_in_device_id' => null,
                'clock_out_device_id' => null,
            ];
        }

        // Fetch Leaves
        $lStmt = $pdo->prepare('SELECT id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ? ORDER BY date ASC, id ASC');
        $lStmt->execute([(int)$tenantId, (int)$employeeId, $start, $end]);
        $leaves = $lStmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($leaves as &$l) {
            $l['status'] = $this->normalizeLeaveStatus($l['status'] ?? null);
        }
        unset($l);

        $hStmt = $pdo->prepare('SELECT id, date, name, created_at FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date ASC, id ASC');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidays = $hStmt->fetchAll(\PDO::FETCH_ASSOC);

        $workingDays = $this->getEmployeeWorkingDays($pdo, (int)$tenantId, (int)$employeeId);

        $workingDaysSet = [];
        foreach ($workingDays as $d) $workingDaysSet[strtolower($d)] = true;
        $holidaySet = [];
        foreach ($holidays as $h) {
            $d = (string)($h['date'] ?? '');
            if ($d !== '') $holidaySet[$d] = true;
        }
        $totals = ['paid' => 0.0, 'unpaid' => 0.0, 'total' => 0.0];
        foreach ($leaves as $l) {
            $status = strtolower((string)($l['status'] ?? ''));
            if ($status !== 'approved') continue;
            $dateStr = (string)($l['date'] ?? '');
            if ($dateStr === '' || isset($holidaySet[$dateStr])) continue;
            $dowKey = strtolower((new \DateTimeImmutable($dateStr, new \DateTimeZone('Asia/Dhaka')))->format('D'));
            if (!isset($workingDaysSet[$dowKey])) continue;
            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $amount = $dayPart === 'full' ? 1.0 : 0.5;
            $type = strtolower((string)($l['leave_type'] ?? 'casual'));
            $isUnpaid = $type === 'unpaid';
            $totals['total'] += $amount;
            if ($isUnpaid) $totals['unpaid'] += $amount;
            else $totals['paid'] += $amount;
        }

        echo json_encode([
            'attendance' => $attendance,
            'leaves' => $leaves,
            'holidays' => $holidays,
            'working_days' => implode(',', $workingDays),
            'leave_totals' => $totals,
            'month' => $month
        ]);
    }

    public function payslipPreview()
    {
        header('Content-Type: application/json');
        $employeeId = (int)($_GET['employee_id'] ?? 0);
        $month = $_GET['month'] ?? date('Y-m');
        $baseSalaryRaw = $_GET['base_salary'] ?? null;

        if ($employeeId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id required']);
            return;
        }

        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        if (!is_string($month) || !preg_match('/^\d{4}-\d{2}$/', $month)) {
            http_response_code(400);
            echo json_encode(['error' => 'month must be YYYY-MM']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $start = $month . '-01';
        $end = date('Y-m-t', strtotime($start));

        $workingDays = $this->getEmployeeWorkingDays($pdo, (int)$tenantId, (int)$employeeId);
        $workingDaysSet = [];
        foreach ($workingDays as $d) $workingDaysSet[strtolower($d)] = true;

        $hStmt = $pdo->prepare('SELECT date FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ?');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidaySet = [];
        foreach ($hStmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $holidaySet[(string)($r['date'] ?? '')] = true;
        }

        $workdayCount = 0;
        $cursor = new \DateTimeImmutable($start, new \DateTimeZone('Asia/Dhaka'));
        $endDt = new \DateTimeImmutable($end, new \DateTimeZone('Asia/Dhaka'));
        while ($cursor <= $endDt) {
            $dateStr = $cursor->format('Y-m-d');
            $dowKey = strtolower($cursor->format('D'));
            if (!isset($holidaySet[$dateStr]) && isset($workingDaysSet[$dowKey])) {
                $workdayCount += 1;
            }
            $cursor = $cursor->modify('+1 day');
        }

        $lStmt = $pdo->prepare('SELECT date, leave_type, day_part, status FROM leaves WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ?');
        $lStmt->execute([(int)$tenantId, (int)$employeeId, $start, $end]);
        $leaves = $lStmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($leaves as &$l) {
            $l['status'] = $this->normalizeLeaveStatus($l['status'] ?? null);
        }
        unset($l);

        $paid = 0.0;
        $unpaid = 0.0;
        foreach ($leaves as $l) {
            $status = strtolower((string)($l['status'] ?? ''));
            if ($status !== 'approved') continue;
            $dateStr = (string)($l['date'] ?? '');
            if ($dateStr === '' || isset($holidaySet[$dateStr])) continue;
            $dowKey = strtolower((new \DateTimeImmutable($dateStr, new \DateTimeZone('Asia/Dhaka')))->format('D'));
            if (!isset($workingDaysSet[$dowKey])) continue;

            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $amount = $dayPart === 'full' ? 1.0 : 0.5;
            $type = strtolower((string)($l['leave_type'] ?? 'casual'));
            if ($type === 'unpaid') $unpaid += $amount;
            else $paid += $amount;
        }

        $baseSalary = null;
        if ($baseSalaryRaw !== null && $baseSalaryRaw !== '') {
            $baseSalary = (float)$baseSalaryRaw;
        }
        $unpaidDeduction = null;
        $netSalary = null;
        if ($baseSalary !== null && $workdayCount > 0) {
            $unpaidDeduction = round(($baseSalary / $workdayCount) * $unpaid, 2);
            $netSalary = round($baseSalary - $unpaidDeduction, 2);
        }

        echo json_encode([
            'employee_id' => $employeeId,
            'month' => $month,
            'workdays' => $workdayCount,
            'paid_leave_days' => $paid,
            'unpaid_leave_days' => $unpaid,
            'base_salary' => $baseSalary,
            'unpaid_deduction' => $unpaidDeduction,
            'net_salary' => $netSalary,
        ]);
    }

    public function leavesList()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $employeeId = $_GET['employee_id'] ?? null;
        if (($user['role'] ?? null) === 'employee') {
            $mapped = (int)($user['employee_id'] ?? 0);
            if ($mapped <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
            $employeeId = $mapped;
        }
        $month = $_GET['month'] ?? null;
        if (is_string($month) && preg_match('/^\d{4}-\d{2}$/', $month)) {
            $start = $month . '-01';
            $end = date('Y-m-t', strtotime($start));
        } else {
            $startRaw = $_GET['start'] ?? date('Y-m-d');
            $endRaw = $_GET['end'] ?? $startRaw;
            [$start, $end] = $this->normalizeRange((string)$startRaw, (string)$endRaw);
        }

        $where = 'WHERE tenant_id=? AND date BETWEEN ? AND ?';
        $params = [(int)$tenantId, $start, $end];
        if ($employeeId !== null && $employeeId !== '') {
            $where .= ' AND employee_id=?';
            $params[] = (int)$employeeId;
        }

        $stmt = $pdo->prepare("SELECT id, tenant_id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves $where ORDER BY date ASC, employee_id ASC, id ASC");
        $stmt->execute($params);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            $r['status'] = $this->normalizeLeaveStatus($r['status'] ?? null);
        }
        unset($r);
        echo json_encode(['leaves' => $rows]);
    }

    private function ensureLeaveViewsTable(\PDO $pdo): void
    {
        $pdo->exec("CREATE TABLE IF NOT EXISTS leave_views (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            user_id INT NOT NULL,
            last_seen_at TIMESTAMP NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_leave_views (tenant_id, user_id),
            INDEX idx_leave_views_user (tenant_id, user_id)
        ) ENGINE=InnoDB");
    }

    public function leavesPendingUnseen()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $userId = isset($user['id']) && is_numeric($user['id']) ? (int)$user['id'] : 0;
        if ($userId <= 0) {
            echo json_encode(['unseen_pending' => 0]);
            return;
        }

        $this->ensureLeaveViewsTable($pdo);

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM leaves
            WHERE tenant_id=?
              AND status='pending'
              AND created_at > COALESCE((SELECT last_seen_at FROM leave_views WHERE tenant_id=? AND user_id=? LIMIT 1), '1970-01-01 00:00:00')");
        $stmt->execute([(int)$tenantId, (int)$tenantId, (int)$userId]);
        $count = (int)($stmt->fetchColumn() ?: 0);

        echo json_encode(['unseen_pending' => $count]);
    }

    public function leavesMarkSeen()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $userId = isset($user['id']) && is_numeric($user['id']) ? (int)$user['id'] : 0;
        if ($userId <= 0) {
            echo json_encode(['ok' => true]);
            return;
        }

        $this->ensureLeaveViewsTable($pdo);
        $stmt = $pdo->prepare('INSERT INTO leave_views(tenant_id, user_id, last_seen_at) VALUES(?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE last_seen_at=CURRENT_TIMESTAMP');
        $stmt->execute([(int)$tenantId, (int)$userId]);

        echo json_encode(['ok' => true]);
    }

    public function leavesCreate()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $employeeId = (int)($in['employee_id'] ?? 0);
        $date = $this->normalizeDate($in['date'] ?? null);
        $leaveType = $this->resolveLeaveType($pdo, (int)$tenantId, $in['leave_type'] ?? null);
        if (!$leaveType) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid leave_type']);
            return;
        }
        $dayPart = $this->normalizeDayPart($in['day_part'] ?? null);
        $reason = trim((string)($in['reason'] ?? ''));
        $status = $this->normalizeLeaveStatus($in['status'] ?? null);

        if ($employeeId <= 0 || !$date) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id and valid date required']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $existingCheck = $pdo->prepare("SELECT status FROM leaves WHERE tenant_id=? AND employee_id=? AND date=? AND status IN ('pending', 'approved') LIMIT 1");
        $existingCheck->execute([(int)$tenantId, (int)$employeeId, $date]);
        $existingStatus = $existingCheck->fetchColumn();
        if ($existingStatus) {
            $statusMsg = $existingStatus === 'approved' ? 'approved' : 'pending';
            http_response_code(409);
            echo json_encode(['error' => "Leave already {$statusMsg} for this date"]);
            return;
        }

        $existingStmt = $pdo->prepare('SELECT id, status FROM leaves WHERE tenant_id=? AND employee_id=? AND date=? ORDER BY id DESC LIMIT 1');
        $existingStmt->execute([(int)$tenantId, (int)$employeeId, $date]);
        $existing = $existingStmt->fetch(\PDO::FETCH_ASSOC);

        if ($existing) {
            // The check above should have caught pending/approved, but double-check for safety
            $normalizedStatus = $this->normalizeLeaveStatus($existing['status'] ?? null);
            if ($normalizedStatus === 'approved' || $normalizedStatus === 'pending') {
                $statusMsg = $normalizedStatus === 'approved' ? 'approved' : 'pending';
                http_response_code(409);
                echo json_encode(['error' => "Leave already {$statusMsg} for this date"]);
                return;
            }
            $existingId = (int)$existing['id'];
            $up = $pdo->prepare('UPDATE leaves SET leave_type=?, day_part=?, reason=?, status=? WHERE tenant_id=? AND id=?');
            $up->execute([$leaveType, $dayPart, $reason !== '' ? $reason : null, $status, (int)$tenantId, $existingId]);
            $id = $existingId;
        } else {
            $ins = $pdo->prepare('INSERT INTO leaves(tenant_id, employee_id, date, leave_type, day_part, reason, status) VALUES(?, ?, ?, ?, ?, ?, ?)');
            $ins->execute([(int)$tenantId, (int)$employeeId, $date, $leaveType, $dayPart, $reason !== '' ? $reason : null, $status]);
            $id = (int)$pdo->lastInsertId();
        }

        $outStmt = $pdo->prepare('SELECT id, tenant_id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves WHERE tenant_id=? AND id=?');
        $outStmt->execute([(int)$tenantId, $id]);
        $row = $outStmt->fetch(\PDO::FETCH_ASSOC);
        if (is_array($row)) {
            $row['status'] = $this->normalizeLeaveStatus($row['status'] ?? null);
        }
        echo json_encode(['leave' => $row]);
    }

    public function leavesUpdate()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $id = (int)($in['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'id required']);
            return;
        }

        $curStmt = $pdo->prepare('SELECT id, employee_id, date, leave_type, day_part, reason, status FROM leaves WHERE tenant_id=? AND id=? LIMIT 1');
        $curStmt->execute([(int)$tenantId, $id]);
        $cur = $curStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$cur) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }

        $canManage = \App\Core\Auth::hasPermission($user, 'leaves.manage');

        $employeeId = (int)($cur['employee_id'] ?? 0);
        $newDate = $canManage && array_key_exists('date', $in) ? $this->normalizeDate($in['date'] ?? null) : (string)($cur['date'] ?? '');
        if (!$newDate) {
            http_response_code(400);
            echo json_encode(['error' => 'valid date required']);
            return;
        }

        if ($canManage && $newDate !== (string)($cur['date'] ?? '')) {
            $dup = $pdo->prepare('SELECT 1 FROM leaves WHERE tenant_id=? AND employee_id=? AND date=? AND id<>? LIMIT 1');
            $dup->execute([(int)$tenantId, $employeeId, $newDate, $id]);
            if ($dup->fetchColumn()) {
                http_response_code(409);
                echo json_encode(['error' => 'Leave already exists for this date']);
                return;
            }
        }

        $newType = $canManage && array_key_exists('leave_type', $in)
            ? $this->resolveLeaveType($pdo, (int)$tenantId, $in['leave_type'] ?? null)
            : $this->resolveLeaveType($pdo, (int)$tenantId, $cur['leave_type'] ?? null);
        if (!$newType) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid leave_type']);
            return;
        }
        $newDayPart = $canManage && array_key_exists('day_part', $in) ? $this->normalizeDayPart($in['day_part'] ?? null) : $this->normalizeDayPart($cur['day_part'] ?? null);
        $newReason = $canManage && array_key_exists('reason', $in) ? trim((string)($in['reason'] ?? '')) : (string)($cur['reason'] ?? '');
        $newStatus = array_key_exists('status', $in) ? $this->normalizeLeaveStatus($in['status'] ?? null) : (string)($cur['status'] ?? 'approved');

        if (!$canManage) {
            $currentStatus = strtolower((string)($cur['status'] ?? 'pending_manager'));
            $currentStatus = $this->normalizeLeaveStatus($currentStatus);
            if (!in_array($newStatus, ['pending', 'approved', 'rejected'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'invalid status transition']);
                return;
            }
            if ($currentStatus !== 'pending') {
                http_response_code(409);
                echo json_encode(['error' => 'already reviewed']);
                return;
            }
        }

        $up = $pdo->prepare('UPDATE leaves SET date=?, leave_type=?, day_part=?, reason=?, status=? WHERE tenant_id=? AND id=?');
        $up->execute([$newDate, $newType, $newDayPart, $newReason !== '' ? $newReason : null, $newStatus, (int)$tenantId, $id]);

        $outStmt = $pdo->prepare('SELECT id, tenant_id, employee_id, date, leave_type, day_part, reason, status, created_at FROM leaves WHERE tenant_id=? AND id=?');
        $outStmt->execute([(int)$tenantId, $id]);
        $row = $outStmt->fetch(\PDO::FETCH_ASSOC);
        if (is_array($row)) {
            $row['status'] = $this->normalizeLeaveStatus($row['status'] ?? null);
        }
        echo json_encode(['leave' => $row]);
    }

    public function leavesApply()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $canManage = \App\Core\Auth::hasPermission($user, 'leaves.manage');
        $employeeId = (int)($in['employee_id'] ?? 0);
        if (($user['role'] ?? null) === 'employee' && !$canManage) {
            $mapped = (int)($user['employee_id'] ?? 0);
            if ($mapped <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
            $employeeId = $mapped;
        }
        $start = $this->normalizeDate($in['start_date'] ?? null);
        $end = $this->normalizeDate($in['end_date'] ?? null);
        $leaveType = $this->resolveLeaveType($pdo, (int)$tenantId, $in['leave_type'] ?? null);
        if (!$leaveType) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid leave_type']);
            return;
        }
        $dayPart = $this->normalizeDayPart($in['day_part'] ?? null);
        $reason = trim((string)($in['reason'] ?? ''));
        $status = $this->normalizeLeaveStatus($in['status'] ?? null);
        if (($user['role'] ?? null) === 'employee' && !$canManage) $status = 'pending';
        if (($user['role'] ?? null) === 'employee' && !$canManage) {
            $settings = $this->getTenantLeaveSettings($pdo, (int)$tenantId);
            if ((int)($settings['auto_approve'] ?? 0) === 1) $status = 'approved';
        }

        if ($employeeId <= 0 || !$start || !$end) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id, start_date, end_date required']);
            return;
        }

        if ($start !== $end && $dayPart !== 'full') {
            http_response_code(400);
            echo json_encode(['error' => 'day_part must be full for multi-day leave']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $workingDays = $this->getEmployeeWorkingDays($pdo, (int)$tenantId, (int)$employeeId);
        $workingDaysSet = [];
        foreach ($workingDays as $d) $workingDaysSet[strtolower($d)] = true;

        $hStmt = $pdo->prepare('SELECT date FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ?');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidaySet = [];
        foreach ($hStmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $holidaySet[(string)($r['date'] ?? '')] = true;
        }

        $dates = [];
        $cursor = new \DateTimeImmutable($start, new \DateTimeZone('Asia/Dhaka'));
        $endDt = new \DateTimeImmutable($end, new \DateTimeZone('Asia/Dhaka'));
        while ($cursor <= $endDt) {
            $dateStr = $cursor->format('Y-m-d');
            $dowKey = strtolower($cursor->format('D'));
            if (!isset($holidaySet[$dateStr]) && isset($workingDaysSet[$dowKey])) {
                $dates[] = $dateStr;
            }
            $cursor = $cursor->modify('+1 day');
        }

        if (!$dates) {
            echo json_encode(['created' => 0, 'skipped' => 0, 'dates' => []]);
            return;
        }

        $skipped = 0;
        $created = 0;

        // Pre-fetch all pending/approved leave dates in the range to skip them
        $existingStmt = $pdo->prepare("SELECT date FROM leaves WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ? AND status IN ('pending', 'approved')");
        $existingStmt->execute([(int)$tenantId, (int)$employeeId, $start, $end]);
        $existingDates = [];
        foreach ($existingStmt->fetchAll(\PDO::FETCH_COLUMN) as $d) $existingDates[$d] = true;

        $ins = $pdo->prepare('INSERT INTO leaves(tenant_id, employee_id, date, leave_type, day_part, reason, status) VALUES(?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE leave_type=VALUES(leave_type), day_part=VALUES(day_part), reason=VALUES(reason), status=VALUES(status)');
        foreach ($dates as $dateStr) {
            if (isset($existingDates[$dateStr])) {
                $skipped += 1;
                continue;
            }
            try {
                $ins->execute([(int)$tenantId, (int)$employeeId, $dateStr, $leaveType, $dayPart, $reason !== '' ? $reason : null, $status]);
                $created += 1;
            } catch (\Exception $e) {
                $skipped += 1;
            }
        }

        echo json_encode(['created' => $created, 'skipped' => $skipped, 'dates' => $dates]);
    }

    public function leaveSettingsGet()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if (!\App\Core\Auth::hasPermission($user, 'leaves.manage')) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        echo json_encode(['settings' => $this->getTenantLeaveSettings($pdo, (int)$tenantId)]);
    }

    public function leaveSettingsSet()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if (!\App\Core\Auth::hasPermission($user, 'leaves.manage')) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $autoApprove = (int)($in['auto_approve'] ?? 0) ? 1 : 0;

        try {
            $stmt = $pdo->prepare('INSERT INTO tenant_leave_settings(tenant_id, auto_approve) VALUES(?, ?) ON DUPLICATE KEY UPDATE auto_approve=VALUES(auto_approve)');
            $stmt->execute([(int)$tenantId, $autoApprove]);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save settings']);
            return;
        }

        echo json_encode(['settings' => ['auto_approve' => $autoApprove]]);
    }

    public function leaveAllocationsList()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if (!\App\Core\Auth::hasPermission($user, 'leaves.manage')) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $employeeId = (int)($_GET['employee_id'] ?? 0);
        if ($employeeId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id required']);
            return;
        }

        $yearRaw = $_GET['year'] ?? date('Y');
        $year = is_numeric($yearRaw) ? (int)$yearRaw : 0;
        if ($year < 1970 || $year > 2200) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid year']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $start = sprintf('%04d-01-01', $year);
        $end = sprintf('%04d-12-31', $year);

        $workingDays = $this->getEmployeeWorkingDays($pdo, (int)$tenantId, (int)$employeeId);
        $workingDaysSet = [];
        foreach ($workingDays as $d) $workingDaysSet[strtolower($d)] = true;

        $hStmt = $pdo->prepare('SELECT date FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ?');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidaySet = [];
        foreach ($hStmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $d = (string)($r['date'] ?? '');
            if ($d !== '') $holidaySet[$d] = true;
        }

        $usedByType = [];
        $lStmt = $pdo->prepare("SELECT date, leave_type, day_part FROM leaves WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ? AND status='approved'");
        $lStmt->execute([(int)$tenantId, (int)$employeeId, $start, $end]);
        $leaves = $lStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        foreach ($leaves as $l) {
            $dateStr = (string)($l['date'] ?? '');
            if ($dateStr === '') continue;
            if (isset($holidaySet[$dateStr])) continue;
            $dowKey = strtolower((new \DateTimeImmutable($dateStr, new \DateTimeZone('Asia/Dhaka')))->format('D'));
            if (!isset($workingDaysSet[$dowKey])) continue;

            $type = strtolower(trim((string)($l['leave_type'] ?? '')));
            if ($type === '') continue;
            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $amount = $dayPart === 'full' ? 1.0 : 0.5;
            if (!isset($usedByType[$type])) $usedByType[$type] = 0.0;
            $usedByType[$type] += $amount;
        }

        $allocStmt = $pdo->prepare('SELECT leave_type, allocated_days FROM leave_allocations WHERE tenant_id=? AND employee_id=? AND year=?');
        $allocStmt->execute([(int)$tenantId, (int)$employeeId, (int)$year]);
        $allocMap = [];
        foreach ($allocStmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $t = strtolower(trim((string)($r['leave_type'] ?? '')));
            if ($t === '') continue;
            $allocMap[$t] = (float)($r['allocated_days'] ?? 0);
        }

        $types = $this->getLeaveTypes($pdo, (int)$tenantId, true);
        $typeNameByCode = [];
        $codes = [];
        foreach ($types as $t) {
            $code = strtolower(trim((string)($t['code'] ?? '')));
            if ($code === '') continue;
            $codes[$code] = true;
            $typeNameByCode[$code] = (string)($t['name'] ?? $code);
        }
        foreach (array_keys($allocMap) as $code) $codes[$code] = true;
        foreach (array_keys($usedByType) as $code) $codes[$code] = true;

        $out = [];
        foreach (array_keys($codes) as $code) {
            $allocated = (float)($allocMap[$code] ?? 0);
            $used = (float)($usedByType[$code] ?? 0);
            $remaining = $allocated - $used;
            $out[] = [
                'employee_id' => (int)$employeeId,
                'year' => (int)$year,
                'leave_type' => $code,
                'leave_type_name' => (string)($typeNameByCode[$code] ?? $code),
                'allocated_days' => $allocated,
                'used_days' => $used,
                'remaining_days' => $remaining,
            ];
        }

        usort($out, fn($a, $b) => strcmp((string)$a['leave_type'], (string)$b['leave_type']));
        echo json_encode(['allocations' => $out]);
    }

    public function leaveBalance()
    {
        \App\Core\Auth::requireRole('perm:leaves.read');
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $employeeId = 0;
        if (($user['role'] ?? null) === 'employee') {
            $employeeId = (int)($user['employee_id'] ?? 0);
            if ($employeeId <= 0) {
                http_response_code(403);
                echo json_encode(['error' => 'Employee account not linked']);
                return;
            }
        } else {
            if (!\App\Core\Auth::hasPermission($user, 'leaves.manage')) {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden']);
                return;
            }
            $employeeId = (int)($_GET['employee_id'] ?? 0);
            if ($employeeId <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'employee_id required']);
                return;
            }
        }

        $yearRaw = $_GET['year'] ?? date('Y');
        $year = is_numeric($yearRaw) ? (int)$yearRaw : 0;
        if ($year < 1970 || $year > 2200) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid year']);
            return;
        }

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        $start = sprintf('%04d-01-01', $year);
        $end = sprintf('%04d-12-31', $year);
        $asOfRaw = $_GET['as_of'] ?? null;
        if (is_string($asOfRaw) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $asOfRaw)) {
            $asOfYear = (int)substr($asOfRaw, 0, 4);
            if ($asOfYear === (int)$year) $end = $asOfRaw;
        }

        $workingDays = $this->getEmployeeWorkingDays($pdo, (int)$tenantId, (int)$employeeId);
        $workingDaysSet = [];
        foreach ($workingDays as $d) $workingDaysSet[strtolower($d)] = true;

        $hStmt = $pdo->prepare('SELECT date FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ?');
        $hStmt->execute([(int)$tenantId, $start, $end]);
        $holidaySet = [];
        foreach ($hStmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $d = (string)($r['date'] ?? '');
            if ($d !== '') $holidaySet[$d] = true;
        }

        $usedByType = [];
        $lStmt = $pdo->prepare("SELECT date, leave_type, day_part FROM leaves WHERE tenant_id=? AND employee_id=? AND date BETWEEN ? AND ? AND status='approved'");
        $lStmt->execute([(int)$tenantId, (int)$employeeId, $start, $end]);
        $leaves = $lStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        foreach ($leaves as $l) {
            $dateStr = (string)($l['date'] ?? '');
            if ($dateStr === '') continue;
            if (isset($holidaySet[$dateStr])) continue;
            $dowKey = strtolower((new \DateTimeImmutable($dateStr, new \DateTimeZone('Asia/Dhaka')))->format('D'));
            if (!isset($workingDaysSet[$dowKey])) continue;

            $type = strtolower(trim((string)($l['leave_type'] ?? '')));
            if ($type === '') continue;
            $dayPart = strtolower((string)($l['day_part'] ?? 'full'));
            $amount = $dayPart === 'full' ? 1.0 : 0.5;
            if (!isset($usedByType[$type])) $usedByType[$type] = 0.0;
            $usedByType[$type] += $amount;
        }

        $allocStmt = $pdo->prepare('SELECT leave_type, allocated_days FROM leave_allocations WHERE tenant_id=? AND employee_id=? AND year=?');
        $allocStmt->execute([(int)$tenantId, (int)$employeeId, (int)$year]);
        $allocMap = [];
        foreach ($allocStmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $t = strtolower(trim((string)($r['leave_type'] ?? '')));
            if ($t === '') continue;
            $allocMap[$t] = (float)($r['allocated_days'] ?? 0);
        }

        $types = $this->getLeaveTypes($pdo, (int)$tenantId, true);
        $typeNameByCode = [];
        $codes = [];
        foreach ($types as $t) {
            $code = strtolower(trim((string)($t['code'] ?? '')));
            if ($code === '') continue;
            $codes[$code] = true;
            $typeNameByCode[$code] = (string)($t['name'] ?? $code);
        }
        foreach (array_keys($allocMap) as $code) $codes[$code] = true;
        foreach (array_keys($usedByType) as $code) $codes[$code] = true;

        $out = [];
        foreach (array_keys($codes) as $code) {
            $allocated = (float)($allocMap[$code] ?? 0);
            $used = (float)($usedByType[$code] ?? 0);
            $remaining = $allocated - $used;
            $out[] = [
                'employee_id' => (int)$employeeId,
                'year' => (int)$year,
                'leave_type' => $code,
                'leave_type_name' => (string)($typeNameByCode[$code] ?? $code),
                'allocated_days' => $allocated,
                'used_days' => $used,
                'remaining_days' => $remaining,
            ];
        }

        usort($out, fn($a, $b) => strcmp((string)$a['leave_type'], (string)$b['leave_type']));
        echo json_encode(['allocations' => $out]);
    }

    public function leaveAllocationsUpsert()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if (!\App\Core\Auth::hasPermission($user, 'leaves.manage')) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $employeeId = (int)($in['employee_id'] ?? 0);
        $year = is_numeric($in['year'] ?? null) ? (int)$in['year'] : 0;
        $leaveType = $this->resolveLeaveTypeAny($pdo, (int)$tenantId, $in['leave_type'] ?? null);
        $allocatedDays = is_numeric($in['allocated_days'] ?? null) ? (float)$in['allocated_days'] : null;

        if ($employeeId <= 0 || $year < 1970 || $year > 2200 || !$leaveType || $allocatedDays === null) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id, year, leave_type, allocated_days required']);
            return;
        }
        if ($allocatedDays < 0) $allocatedDays = 0.0;

        $empCheck = $pdo->prepare('SELECT 1 FROM employees WHERE tenant_id=? AND id=? LIMIT 1');
        $empCheck->execute([(int)$tenantId, (int)$employeeId]);
        if (!$empCheck->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Employee not found']);
            return;
        }

        try {
            $stmt = $pdo->prepare('INSERT INTO leave_allocations(tenant_id, employee_id, leave_type, year, allocated_days) VALUES(?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE allocated_days=VALUES(allocated_days)');
            $stmt->execute([(int)$tenantId, (int)$employeeId, $leaveType, (int)$year, $allocatedDays]);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save allocation']);
            return;
        }

        echo json_encode([
            'allocation' => [
                'employee_id' => (int)$employeeId,
                'year' => (int)$year,
                'leave_type' => $leaveType,
                'allocated_days' => $allocatedDays,
            ],
        ]);
    }

    public function leaveAllocationsDelete()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if (!\App\Core\Auth::hasPermission($user, 'leaves.manage')) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $employeeId = (int)($in['employee_id'] ?? 0);
        $year = is_numeric($in['year'] ?? null) ? (int)$in['year'] : 0;
        $leaveType = $this->resolveLeaveTypeAny($pdo, (int)$tenantId, $in['leave_type'] ?? null);

        if ($employeeId <= 0 || $year < 1970 || $year > 2200 || !$leaveType) {
            http_response_code(400);
            echo json_encode(['error' => 'employee_id, year, leave_type required']);
            return;
        }

        $stmt = $pdo->prepare('DELETE FROM leave_allocations WHERE tenant_id=? AND employee_id=? AND leave_type=? AND year=?');
        $stmt->execute([(int)$tenantId, (int)$employeeId, $leaveType, (int)$year]);
        echo json_encode(['ok' => true]);
    }

    public function leaveTypesList()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $canManage = \App\Core\Auth::hasPermission($user, 'leaves.manage');
        $includeInactive = $canManage && (($_GET['include_inactive'] ?? null) === '1');
        if ($canManage && $includeInactive) {
            try {
                $cntStmt = $pdo->prepare('SELECT COUNT(*) FROM leave_types WHERE tenant_id=?');
                $cntStmt->execute([(int)$tenantId]);
                $count = (int)$cntStmt->fetchColumn();
                if ($count <= 0) {
                    $ins = $pdo->prepare('INSERT INTO leave_types(tenant_id, code, name, is_paid, requires_document, active, sort_order) VALUES(?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), is_paid=VALUES(is_paid), requires_document=VALUES(requires_document), active=VALUES(active), sort_order=VALUES(sort_order)');
                    foreach ($this->defaultLeaveTypes() as $t) {
                        $code = strtolower(trim((string)($t['code'] ?? '')));
                        $name = trim((string)($t['name'] ?? ''));
                        if ($code === '' || $name === '') continue;
                        $ins->execute([
                            (int)$tenantId,
                            $code,
                            $name,
                            (int)($t['is_paid'] ?? 1) ? 1 : 0,
                            (int)($t['requires_document'] ?? 0) ? 1 : 0,
                            (int)($t['active'] ?? 1) ? 1 : 0,
                            is_numeric($t['sort_order'] ?? null) ? (int)$t['sort_order'] : 0,
                        ]);
                    }
                }
            } catch (\Exception $e) {
            }
        }
        $types = $this->getLeaveTypes($pdo, (int)$tenantId, (bool)$includeInactive);
        echo json_encode(['leave_types' => array_values($types)]);
    }

    public function leaveTypesUpsert()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if (!\App\Core\Auth::hasPermission($user, 'leaves.manage')) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];

        $codeRaw = is_string($in['code'] ?? null) ? strtolower(trim((string)$in['code'])) : '';
        $name = trim((string)($in['name'] ?? ''));
        $isPaid = (int)($in['is_paid'] ?? 1) ? 1 : 0;
        $requiresDocument = (int)($in['requires_document'] ?? 0) ? 1 : 0;
        $active = (int)($in['active'] ?? 1) ? 1 : 0;
        $sortOrder = is_numeric($in['sort_order'] ?? null) ? (int)$in['sort_order'] : 0;

        if ($codeRaw === '' || !preg_match('/^[a-z0-9_]{1,16}$/', $codeRaw) || $name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'code and name required']);
            return;
        }

        try {
            $stmt = $pdo->prepare('INSERT INTO leave_types(tenant_id, code, name, is_paid, requires_document, active, sort_order) VALUES(?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), is_paid=VALUES(is_paid), requires_document=VALUES(requires_document), active=VALUES(active), sort_order=VALUES(sort_order)');
            $stmt->execute([(int)$tenantId, $codeRaw, $name, $isPaid, $requiresDocument, $active, $sortOrder]);

            $out = $pdo->prepare('SELECT id, tenant_id, code, name, is_paid, requires_document, active, sort_order, created_at FROM leave_types WHERE tenant_id=? AND code=? LIMIT 1');
            $out->execute([(int)$tenantId, $codeRaw]);
            echo json_encode(['leave_type' => $out->fetch(\PDO::FETCH_ASSOC)]);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save leave type']);
        }
    }

    public function leaveTypesDeactivate()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $user = \App\Core\Auth::currentUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        if (!\App\Core\Auth::hasPermission($user, 'leaves.manage')) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $codeRaw = is_string($in['code'] ?? null) ? strtolower(trim((string)$in['code'])) : '';
        if ($codeRaw === '') {
            http_response_code(400);
            echo json_encode(['error' => 'code required']);
            return;
        }

        $stmt = $pdo->prepare('UPDATE leave_types SET active=0 WHERE tenant_id=? AND code=?');
        $stmt->execute([(int)$tenantId, $codeRaw]);
        echo json_encode(['ok' => true]);
    }

    public function holidaysList()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $month = $_GET['month'] ?? null;
        if (is_string($month) && preg_match('/^\d{4}-\d{2}$/', $month)) {
            $start = $month . '-01';
            $end = date('Y-m-t', strtotime($start));
        } else {
            $startRaw = $_GET['start'] ?? date('Y-m-d');
            $endRaw = $_GET['end'] ?? $startRaw;
            [$start, $end] = $this->normalizeRange((string)$startRaw, (string)$endRaw);
        }

        $stmt = $pdo->prepare('SELECT id, tenant_id, date, name, created_at FROM holidays WHERE tenant_id=? AND date BETWEEN ? AND ? ORDER BY date ASC, id ASC');
        $stmt->execute([(int)$tenantId, $start, $end]);
        echo json_encode(['holidays' => $stmt->fetchAll(\PDO::FETCH_ASSOC)]);
    }

    public function holidaysCreate()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $date = $this->normalizeDate($in['date'] ?? null);
        $name = trim((string)($in['name'] ?? ''));
        if (!$date || $name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'date and name required']);
            return;
        }

        $stmt = $pdo->prepare('INSERT INTO holidays(tenant_id, date, name) VALUES(?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)');
        $stmt->execute([(int)$tenantId, $date, $name]);

        $out = $pdo->prepare('SELECT id, tenant_id, date, name, created_at FROM holidays WHERE tenant_id=? AND date=? ORDER BY id DESC LIMIT 1');
        $out->execute([(int)$tenantId, $date]);
        echo json_encode(['holiday' => $out->fetch(\PDO::FETCH_ASSOC)]);
    }

    public function holidaysUpdate()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $id = (int)($in['id'] ?? 0);
        $date = array_key_exists('date', $in) ? $this->normalizeDate($in['date'] ?? null) : null;
        $name = array_key_exists('name', $in) ? trim((string)($in['name'] ?? '')) : null;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'id required']);
            return;
        }

        $curStmt = $pdo->prepare('SELECT id, date, name FROM holidays WHERE tenant_id=? AND id=? LIMIT 1');
        $curStmt->execute([(int)$tenantId, $id]);
        $cur = $curStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$cur) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            return;
        }

        $newDate = $date ?: (string)($cur['date'] ?? '');
        $newName = $name !== null ? $name : (string)($cur['name'] ?? '');
        if (!$newDate || $newName === '') {
            http_response_code(400);
            echo json_encode(['error' => 'date and name required']);
            return;
        }

        if ($newDate !== (string)($cur['date'] ?? '')) {
            $dup = $pdo->prepare('SELECT 1 FROM holidays WHERE tenant_id=? AND date=? AND id<>? LIMIT 1');
            $dup->execute([(int)$tenantId, $newDate, $id]);
            if ($dup->fetchColumn()) {
                http_response_code(409);
                echo json_encode(['error' => 'Holiday already exists for this date']);
                return;
            }
        }

        $stmt = $pdo->prepare('UPDATE holidays SET date=?, name=? WHERE tenant_id=? AND id=?');
        $stmt->execute([$newDate, $newName, (int)$tenantId, $id]);

        $out = $pdo->prepare('SELECT id, tenant_id, date, name, created_at FROM holidays WHERE tenant_id=? AND id=?');
        $out->execute([(int)$tenantId, $id]);
        echo json_encode(['holiday' => $out->fetch(\PDO::FETCH_ASSOC)]);
    }

    public function holidaysDelete()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $id = (int)($in['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'id required']);
            return;
        }

        $stmt = $pdo->prepare('DELETE FROM holidays WHERE tenant_id=? AND id=?');
        $stmt->execute([(int)$tenantId, $id]);
        echo json_encode(['ok' => true]);
    }

    public function leavesDelete()
    {
        header('Content-Type: application/json');
        $pdo = \App\Core\Database::get();
        if (!$pdo) {
            http_response_code(500);
            echo json_encode(['error' => 'DB error']);
            return;
        }

        $tenantId = $this->resolveTenantId($pdo);
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['error' => 'tenant not resolved']);
            return;
        }

        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) $in = [];
        $id = (int)($in['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'id required']);
            return;
        }

        $del = $pdo->prepare('DELETE FROM leaves WHERE tenant_id=? AND id=?');
        $del->execute([(int)$tenantId, $id]);
        echo json_encode(['ok' => true]);
    }
}
