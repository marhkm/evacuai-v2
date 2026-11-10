<?php

namespace App\Http\Controllers\Api;

use App\Events\CheckInUpdated;
use App\Http\Controllers\Controller;
use App\Models\Alert;
use App\Models\EvacuationLog;
use App\Support\Activity;
use App\Support\Places;
use App\Support\SafeZones;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Check-in Safe and location events. Both belong to the current alert; nothing is stored when there is none. */
class SafetyController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $alert = Alert::current();
        $log = $alert ? EvacuationLog::where(['user_id' => $request->user()->id, 'alert_id' => $alert->id])->first() : null;

        return response()->json(['check_in' => self::payload($alert, $log, $request->user()->id)]);
    }

    /**
     * "I'm safe", at a safe zone or not. Every check-in is kept (check_ins); the current status (evacuation_logs) is only
     * replaced when the user confirmed it ("Update your status?"), otherwise 409. SOS is the only way to ask for help.
     */
    public function checkIn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::in(['safe'])],
            'node_id' => ['nullable', 'string', Rule::exists('assembly_points', 'node_id')],
            'source' => ['nullable', Rule::in(['qr', 'list', 'gps', 'none'])],
            'replace' => ['boolean'],
        ], [
            'status.in' => 'To ask for help, use the SOS button.',
            'node_id.exists' => 'That sticker is not at a safe zone.',
        ]);
        $alert = Alert::current();
        if (! $alert) {
            throw ValidationException::withMessages(['status' => 'There is no active alert to check in for.']);
        }
        $userId = $request->user()->id;
        $node = $data['node_id'] ?? null;
        $existing = null; // set when there is already a check-in and the user did not confirm replacing it
        $log = DB::transaction(function () use ($userId, $alert, $node, $data, &$existing) {
            // One check-in at a time per person (row lock): two phones tapping together cannot both skip the question.
            DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            $current = EvacuationLog::where(['user_id' => $userId, 'alert_id' => $alert->id])->first();
            if ($current && ! ($data['replace'] ?? false)) {
                return $existing = $current;
            }
            DB::table('check_ins')->insert(['user_id' => $userId, 'alert_id' => $alert->id, 'assembly_node_id' => $node,
                'source' => $data['source'] ?? ($node ? 'qr' : 'none'), 'created_at' => now()]);

            return EvacuationLog::updateOrCreate(['user_id' => $userId, 'alert_id' => $alert->id],
                ['status' => 'safe', 'assembly_node_id' => $node, 'checked_in_at' => now()]);
        });
        if ($existing) {
            return response()->json([
                'error' => 'already_checked_in',
                'place' => self::place($existing->assembly_node_id),
                'checked_in_at' => $existing->checked_in_at->toIso8601String(),
                'message' => 'You already checked in. Update your status?',
            ], 409);
        }

        Activity::log('checked_in', ['alert_id' => $alert->id, 'status' => $log->status]);
        rescue(fn () => event(new CheckInUpdated($alert->id))); // officers' live feed only; never fail the check-in
        $zones = SafeZones::forAlert($alert->id);
        $here = $node ? collect($zones)->firstWhere('node_id', $node) : null;

        return response()->json([
            'check_in' => self::payload($alert, $log, $userId),
            'zones' => $zones,
            'suggest' => $here && $here['full'] ? SafeZones::suggest($alert->id, $node) : null,
        ]);
    }

    /** Where the app thinks the user is (scan, pick, schedule, floor change). Data Privacy Act: only during an alert. */
    public function location(Request $request): Response
    {
        $data = $request->validate([
            'source' => ['required', Rule::in(['qr', 'manual', 'schedule', 'barometer', 'gps'])],
            'confidence' => ['required', Rule::in(['exact', 'likely'])],
            'node_id' => ['nullable', 'string', Rule::exists('evac_nodes', 'id')],
            'room_id' => ['nullable', 'string', Rule::exists('rooms', 'id')],
            'building_id' => ['nullable', 'string', Rule::exists('buildings', 'id')],
            'level' => ['nullable', 'integer'],
        ]);
        $alert = Alert::current();
        if ($alert) {
            DB::table('location_events')->insert($data + ['user_id' => $request->user()->id, 'alert_id' => $alert->id, 'created_at' => now()]);
        }

        return response()->noContent();
    }

    /** @return array<string, mixed>|null */
    private static function payload(?Alert $alert, ?EvacuationLog $log, int $userId): ?array
    {
        return $alert ? [
            'alert_id' => $alert->id,
            'status' => $log?->status,
            'place' => self::place($log?->assembly_node_id),
            'checked_in_at' => $log?->checked_in_at->toIso8601String(),
            'zones' => SafeZones::forAlert($alert->id),
            'history' => DB::table('check_ins')->where(['user_id' => $userId, 'alert_id' => $alert->id])
                ->orderByDesc('id')->limit(20)->get(['assembly_node_id', 'created_at'])
                ->map(fn ($c) => ['place' => self::place($c->assembly_node_id), 'at' => Carbon::parse($c->created_at)->toIso8601String()])
                ->values()->all(),
        ] : null;
    }

    private static function place(?string $node): ?string
    {
        return $node ? Places::label(null, null, $node) : null;
    }
}
