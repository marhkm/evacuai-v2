<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Alert;
use App\Models\EvacuationLog;
use App\Support\Activity;
use App\Support\Places;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
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

        return response()->json(['check_in' => self::payload($alert, $log)]);
    }

    public function checkIn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['safe', 'needs_help'])],
            'node_id' => ['nullable', 'string', Rule::exists('assembly_points', 'node_id')],
        ], ['node_id.exists' => 'That sticker is not at an assembly point.']);
        $alert = Alert::current();
        if (! $alert) {
            throw ValidationException::withMessages(['status' => 'There is no active alert to check in for.']);
        }

        $log = EvacuationLog::updateOrCreate(
            ['user_id' => $request->user()->id, 'alert_id' => $alert->id],
            ['status' => $data['status'], 'assembly_node_id' => $data['node_id'] ?? null, 'checked_in_at' => now()],
        );

        Activity::log('checked_in', ['alert_id' => $alert->id, 'status' => $log->status]);

        return response()->json(['check_in' => self::payload($alert, $log)]);
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
    private static function payload(?Alert $alert, ?EvacuationLog $log): ?array
    {
        return $alert ? [
            'alert_id' => $alert->id,
            'status' => $log?->status,
            'place' => $log?->assembly_node_id ? Places::label(null, null, $log->assembly_node_id) : null,
            'checked_in_at' => $log?->checked_in_at->toIso8601String(),
        ] : null;
    }
}
