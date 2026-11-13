<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** Which building a GPS fix is in, from the corners an admin entered (Admin → Building GPS). */
class BuildingLocator
{
    public const MAX_ACCURACY_M = 40; // a worse fix could just as well be the building next door

    public static function at(float $lat, float $lng, float $accuracy): ?string
    {
        if ($accuracy > self::MAX_ACCURACY_M) {
            return null;
        }
        $found = null;
        foreach (DB::table('buildings')->whereNotNull('gps_corners')->orderBy('id')->get(['id', 'gps_corners']) as $b) {
            $corners = json_decode((string) $b->gps_corners, true);
            if (! is_array($corners) || count($corners) < 3) {
                continue;
            }
            if (self::inside($lat, $lng, $corners)) {
                $found ??= $b->id;
            } elseif (self::distanceM($lat, $lng, $corners) < $accuracy) {
                return null; // the fix could just as well be in this building: officers ask instead of being misled
            }
        }

        return $found;
    }

    /** Metres from the point to the nearest edge (flat-earth: fine at building scale). @param list<array{0: float, 1: float}> $poly */
    private static function distanceM(float $lat, float $lng, array $poly): float
    {
        $kx = 111_320 * cos(deg2rad($lat));
        $ky = 110_540;
        $best = INF;
        for ($i = 0, $j = count($poly) - 1; $i < count($poly); $j = $i++) {
            $ax = ($poly[$j][1] - $lng) * $kx;
            $ay = ($poly[$j][0] - $lat) * $ky;
            $bx = ($poly[$i][1] - $lng) * $kx;
            $by = ($poly[$i][0] - $lat) * $ky;
            $len = ($bx - $ax) ** 2 + ($by - $ay) ** 2;
            $t = $len > 0 ? max(0, min(1, -($ax * ($bx - $ax) + $ay * ($by - $ay)) / $len)) : 0;
            $best = min($best, hypot($ax + $t * ($bx - $ax), $ay + $t * ($by - $ay)));
        }

        return $best;
    }

    /** Ray casting: count how many edges a line going east from the point crosses. @param list<array{0: float, 1: float}> $poly */
    private static function inside(float $lat, float $lng, array $poly): bool
    {
        $in = false;
        for ($i = 0, $j = count($poly) - 1; $i < count($poly); $j = $i++) {
            [$latI, $lngI] = $poly[$i];
            [$latJ, $lngJ] = $poly[$j];
            if (($latI > $lat) !== ($latJ > $lat) && $lng < ($lngJ - $lngI) * ($lat - $latI) / ($latJ - $latI) + $lngI) {
                $in = ! $in;
            }
        }

        return $in;
    }
}
