<?php

namespace App\Support;

use App\Http\Controllers\Api\CampusSnapshotController;
use App\Models\Alert;
use App\Models\SosAlert;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Live overlay and drill replay for the 3D campus view (admin page and Command Center). */
class Campus3dData
{
    /**
     * Blocked paths, hazard rooms, people still inside per room (last known, not yet checked in safe), SOS and check-in pins.
     *
     * @return array<string, mixed>
     */
    public static function live(?Alert $alert): array
    {
        $snap = app(CampusSnapshotController::class)->build();

        $roomCounts = [];
        $checkins = collect();
        if ($alert) {
            $safe = DB::table('evacuation_logs')->where(['alert_id' => $alert->id, 'status' => 'safe'])->pluck('user_id');
            $last = DB::table('location_events as le')->where('le.alert_id', $alert->id)->whereNotIn('le.user_id', $safe)
                ->leftJoin('evac_nodes as n', 'n.id', '=', 'le.node_id')
                ->selectRaw('DISTINCT ON (le.user_id) le.user_id, COALESCE(le.room_id, n.room_id) as room')
                ->orderBy('le.user_id')->orderByDesc('le.id')->get();
            $roomCounts = $last->whereNotNull('room')->countBy('room')->all();
            $checkins = DB::table('evacuation_logs')->where(['alert_id' => $alert->id, 'status' => 'safe'])->whereNotNull('assembly_node_id')
                ->groupBy('assembly_node_id')->selectRaw('assembly_node_id as node, count(*) as n')->get();
        }

        $pins = SosAlert::whereIn('status', SosAlert::OPEN)->whereNotNull('node_id')->with('user:id,name')->get()
            ->map(fn (SosAlert $s) => ['id' => "sos-{$s->id}", 'nodeId' => $s->node_id, 'kind' => 'sos', 'label' => "SOS: {$s->user->name} ({$s->status})"])
            ->concat($checkins->map(fn ($c) => ['id' => "checkin-{$c->node}", 'nodeId' => $c->node, 'kind' => 'checkin', 'label' => "{$c->n} checked in safe"]));

        return [
            'alert' => $alert ? ['id' => $alert->id, 'label' => self::label($alert), 'active' => $alert->status === 'active'] : null,
            'edges' => (object) collect($snap['edges'])->where('status', '!=', 'open')->pluck('status', 'id')->all(), // {} when all open
            'hazardRoomIds' => $snap['hazardRoomIds'],
            'roomCounts' => (object) $roomCounts,
            'pins' => $pins->values(),
        ];
    }

    /**
     * Location events and safe check-ins of one alert as seconds after it was issued, for the replay slider.
     * People are numbered, not named: the replay shows movement, not identities.
     *
     * @return array<string, mixed>
     */
    public static function replay(Alert $alert): array
    {
        $issued = $alert->issued_at;
        abort_if($issued === null, 404);

        $people = [];
        $person = function (int $userId) use (&$people): int {
            return $people[$userId] ??= count($people) + 1;
        };
        $since = fn (string $at) => max(0, (int) $issued->diffInSeconds(Carbon::parse($at)));

        $events = DB::table('location_events as le')->where('le.alert_id', $alert->id)
            ->leftJoin('evac_nodes as n', 'n.id', '=', 'le.node_id')
            ->orderBy('le.id')->get(['le.user_id', 'le.created_at', DB::raw('COALESCE(le.room_id, n.room_id) as room')])
            ->map(fn ($e) => ['t' => $since($e->created_at), 'p' => $person($e->user_id), 'room' => $e->room]);
        $checkins = DB::table('evacuation_logs')->where(['alert_id' => $alert->id, 'status' => 'safe'])->orderBy('checked_in_at')
            ->get(['user_id', 'checked_in_at', 'assembly_node_id'])
            ->map(fn ($c) => ['t' => $since($c->checked_in_at), 'p' => $person($c->user_id), 'node' => $c->assembly_node_id]);

        return [
            'alert' => ['id' => $alert->id, 'label' => self::label($alert)],
            'duration' => max([60, ...$events->pluck('t'), ...$checkins->pluck('t')]),
            'events' => $events,
            'checkins' => $checkins,
        ];
    }

    /** The alert asked for (issued ones only), or the active alert. */
    public static function pick(?int $alertId): ?Alert
    {
        return $alertId ? Alert::whereKey($alertId)->whereNotNull('issued_at')->first() : Alert::current();
    }

    public static function label(Alert $a): string
    {
        return ($a->is_drill ? '[Drill] ' : '').str($a->hazard_type)->replace('_', ' ')->title().' · '
            .$a->issued_at?->timezone(config('evacuai.timezone'))->format('M j, g:i A');
    }
}
