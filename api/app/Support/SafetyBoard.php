<?php

namespace App\Support;

use App\Models\Alert;
use App\Models\SosAlert;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/** Who is safe, who needs help, who has not checked in, for one alert. Shared by the officer API and the admin panel. */
class SafetyBoard
{
    /** @return list<array{id: int, label: string, active: bool}> recent alerts to choose from */
    public static function alerts(): array
    {
        return Alert::whereIn('status', ['active', 'resolved'])->latest('issued_at')->limit(20)->get()
            ->map(fn (Alert $a) => ['id' => $a->id, 'label' => CampusStats::label($a), 'active' => $a->status === 'active'])
            ->values()->all();
    }

    /** @return array{total: int, safe: int, needs_help: int, unknown: int, sos: int} */
    public static function counts(int $alertId): array
    {
        $byStatus = DB::table('evacuation_logs')->where('alert_id', $alertId)
            ->whereIn('user_id', DrillStats::people()->select('users.id'))
            ->groupBy('status')->selectRaw('status, count(*) as n')->pluck('n', 'status');
        $total = DrillStats::people()->count();

        return [
            'total' => $total,
            'safe' => (int) ($byStatus['safe'] ?? 0),
            'needs_help' => (int) ($byStatus['needs_help'] ?? 0),
            'unknown' => $total - (int) $byStatus->sum(),
            'sos' => SosAlert::whereIn('status', SosAlert::OPEN)->count(),
        ];
    }

    /** @return list<array{name: string, count: int}> */
    public static function occupancy(int $alertId): array
    {
        $counts = DB::table('evacuation_logs')->where(['alert_id' => $alertId, 'status' => 'safe'])
            ->whereNotNull('assembly_node_id')->groupBy('assembly_node_id')->selectRaw('assembly_node_id, count(*) as n')->pluck('n', 'assembly_node_id');

        return DB::table('assembly_points')->orderBy('id')->pluck('node_id')
            ->map(fn (string $node) => ['name' => Places::label(null, null, $node) ?? $node, 'count' => (int) ($counts[$node] ?? 0)])
            ->values()->all();
    }

    /**
     * People with their check-in for the alert, last shared location and open SOS count (unsorted).
     *
     * @return Builder<User>
     */
    public static function query(int $alertId): Builder
    {
        $last = fn (string $column) => DB::table('location_events')->select($column)
            ->whereColumn('location_events.user_id', 'users.id')->where('location_events.alert_id', $alertId)
            ->orderByDesc('location_events.id')->limit(1);

        return DrillStats::people()
            ->leftJoin('evacuation_logs as el', fn ($join) => $join->on('el.user_id', '=', 'users.id')->where('el.alert_id', $alertId))
            ->select('users.*', 'el.status as check_status', 'el.assembly_node_id', 'el.checked_in_at')
            ->addSelect([
                'last_node' => $last('node_id'), 'last_room' => $last('room_id'), 'last_building' => $last('building_id'),
                'last_level' => $last('level'), 'last_source' => $last('source'), 'last_seen_at' => $last('created_at'),
                'open_sos' => SosAlert::selectRaw('count(*)')->whereColumn('sos_alerts.user_id', 'users.id')->whereIn('status', SosAlert::OPEN),
            ]);
    }

    /**
     * SOS and Needs help first, then Unknown, then Safe; by name within each group.
     *
     * @param  Builder<User>  $query
     * @return Builder<User>
     */
    public static function sort(Builder $query): Builder
    {
        return $query
            ->orderByRaw("CASE WHEN EXISTS (SELECT 1 FROM sos_alerts s WHERE s.user_id = users.id AND s.status IN ('pending', 'acknowledged')) OR el.status = 'needs_help' THEN 0 WHEN el.status IS NULL THEN 1 ELSE 2 END")
            ->orderBy('users.name');
    }

    public static function status(User $person): string
    {
        return $person->getAttribute('open_sos') ? 'SOS' : ($person->getAttribute('check_status') ?? 'unknown');
    }

    public static function place(User $person): ?string
    {
        return $person->getAttribute('assembly_node_id')
            ? Places::label(null, null, $person->getAttribute('assembly_node_id'))
            : Places::label($person->getAttribute('last_building'), $person->getAttribute('last_level'), $person->getAttribute('last_node'), $person->getAttribute('last_room'));
    }
}
