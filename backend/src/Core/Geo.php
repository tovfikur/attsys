<?php

namespace App\Core;

class Geo
{
    public static function haversineMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371000.0;
        $phi1 = deg2rad($lat1);
        $phi2 = deg2rad($lat2);
        $dPhi = deg2rad($lat2 - $lat1);
        $dLam = deg2rad($lng2 - $lng1);

        $a = sin($dPhi / 2) * sin($dPhi / 2) + cos($phi1) * cos($phi2) * sin($dLam / 2) * sin($dLam / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        return $r * $c;
    }

    public static function pointInPolygon(float $lat, float $lng, array $polygon): bool
    {
        $inside = false;
        $n = count($polygon);
        if ($n < 3) return false;

        $j = $n - 1;
        for ($i = 0; $i < $n; $i++) {
            $latI = (float)$polygon[$i]['lat'];
            $lngI = (float)$polygon[$i]['lng'];
            $latJ = (float)$polygon[$j]['lat'];
            $lngJ = (float)$polygon[$j]['lng'];

            $intersects = (($lngI > $lng) !== ($lngJ > $lng)) &&
                ($lat < ($latJ - $latI) * ($lng - $lngI) / (($lngJ - $lngI) ?: 1e-12) + $latI);
            if ($intersects) $inside = !$inside;
            $j = $i;
        }
        return $inside;
    }

    private static function metersPerDegreeLat(float $lat): float
    {
        return 111132.92 - 559.82 * cos(2 * deg2rad($lat)) + 1.175 * cos(4 * deg2rad($lat));
    }

    private static function metersPerDegreeLng(float $lat): float
    {
        return 111412.84 * cos(deg2rad($lat)) - 93.5 * cos(3 * deg2rad($lat));
    }

    private static function distancePointToSegmentMeters(float $plat, float $plng, float $alat, float $alng, float $blat, float $blng): float
    {
        $mLat = self::metersPerDegreeLat($plat);
        $mLng = self::metersPerDegreeLng($plat);

        $px = ($plng - $plng) * $mLng;
        $py = ($plat - $plat) * $mLat;

        $ax = ($alng - $plng) * $mLng;
        $ay = ($alat - $plat) * $mLat;
        $bx = ($blng - $plng) * $mLng;
        $by = ($blat - $plat) * $mLat;

        $abx = $bx - $ax;
        $aby = $by - $ay;
        $apx = $px - $ax;
        $apy = $py - $ay;

        $abLen2 = $abx * $abx + $aby * $aby;
        if ($abLen2 <= 1e-9) {
            return sqrt($apx * $apx + $apy * $apy);
        }

        $t = ($apx * $abx + $apy * $aby) / $abLen2;
        if ($t < 0) $t = 0;
        if ($t > 1) $t = 1;

        $cx = $ax + $t * $abx;
        $cy = $ay + $t * $aby;
        $dx = $px - $cx;
        $dy = $py - $cy;
        return sqrt($dx * $dx + $dy * $dy);
    }

    public static function fenceAppliesAt(array $fence, \DateTimeInterface $now): bool
    {
        if (!(int)($fence['active'] ?? 1)) return false;

        $start = $fence['time_start'] ?? null;
        $end = $fence['time_end'] ?? null;
        if (!$start || !$end) return true;

        $t = $now->format('H:i:s');
        $start = (string)$start;
        $end = (string)$end;

        if ($start === $end) return true;
        if ($start < $end) return ($t >= $start && $t <= $end);
        return ($t >= $start || $t <= $end);
    }

    public static function isInsideFence(array $fence, array $vertices, float $lat, float $lng): array
    {
        $type = strtolower((string)($fence['type'] ?? ''));
        if ($type === 'circle') {
            $cLat = $fence['center_lat'] ?? null;
            $cLng = $fence['center_lng'] ?? null;
            $radius = $fence['radius_m'] ?? null;
            if (!is_numeric($cLat) || !is_numeric($cLng) || !is_numeric($radius)) return [true, null];
            $d = self::haversineMeters((float)$cLat, (float)$cLng, $lat, $lng);
            $outside = (int)max(0, round($d - (float)$radius));
            return [$outside === 0, $outside === 0 ? 0 : $outside];
        }

        if ($type === 'polygon') {
            $poly = [];
            foreach ($vertices as $v) {
                if (!isset($v['latitude'], $v['longitude']) && isset($v['lat'], $v['lng'])) {
                    $poly[] = ['lat' => (float)$v['lat'], 'lng' => (float)$v['lng']];
                    continue;
                }
                if (isset($v['latitude'], $v['longitude'])) {
                    $poly[] = ['lat' => (float)$v['latitude'], 'lng' => (float)$v['longitude']];
                }
            }
            if (count($poly) < 3) return [true, null];
            $inside = self::pointInPolygon($lat, $lng, $poly);
            if ($inside) return [true, 0];

            $min = null;
            $n = count($poly);
            for ($i = 0; $i < $n; $i++) {
                $a = $poly[$i];
                $b = $poly[($i + 1) % $n];
                $d = self::distancePointToSegmentMeters($lat, $lng, (float)$a['lat'], (float)$a['lng'], (float)$b['lat'], (float)$b['lng']);
                if ($min === null || $d < $min) $min = $d;
            }
            $outside = $min === null ? null : (int)max(1, round($min));
            return [false, $outside];
        }

        return [true, null];
    }
}

