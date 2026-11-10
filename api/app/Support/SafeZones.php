<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * The safe zones (assembly points) with how many people checked in safe there for an alert, against the capacity an
 * admin set. Feeds the app's Check-in list, the officers' Safety board and routing (a full zone is avoided).
 */
class SafeZones
{
    /** @return list<array{node_id: string, name: string, count: int, capacity: ?int, full: bool}> */
    public static function forAlert(?int $alertId): array
    {
        $counts = $alertId === null ? collect() : DB::table('evacuation_logs')
            ->where(['alert_id' => $alertId, 'status' => 'safe'])->whereNotNull('assembly_node_id')
            ->groupBy('assembly_node_id')->selectRaw('assembly_node_id, count(*) as n')->pluck('n', 'assembly_node_id');

        return DB::table('assembly_points as ap')->join('evac_nodes as n', 'n.id', '=', 'ap.node_id')
            ->orderBy('ap.id')->get(['ap.node_id', 'ap.capacity', 'n.name'])
            ->map(function ($z) use ($counts) {
                $count = (int) ($counts[$z->node_id] ?? 0);
                $capacity = $z->capacity === null ? null : (int) $z->capacity;

                return ['node_id' => $z->node_id, 'name' => $z->name ?? Places::humanize($z->node_id), 'count' => $count,
                    'capacity' => $capacity, 'full' => $capacity !== null && $count >= $capacity];
            })->values()->all();
    }

    /** @return array{node_id: string, name: string, count: int, capacity: ?int, full: bool}|null another zone with space */
    public static function suggest(?int $alertId, string $except): ?array
    {
        foreach (self::forAlert($alertId) as $zone) {
            if ($zone['node_id'] !== $except && ! $zone['full']) {
                return $zone;
            }
        }

        return null;
    }
}
