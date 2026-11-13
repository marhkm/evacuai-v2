<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Officer\SosController as OfficerSosController;
use App\Jobs\SendOfficerPush;
use App\Models\Alert;
use App\Models\SosAlert;
use App\Models\User;
use App\Notifications\SosRaised;
use App\Support\BuildingLocator;
use App\Support\ClassNow;
use App\Support\Places;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SosController extends Controller
{
    /** The user's open SOS, or one closed in the last 30 minutes (so they see "resolved"). */
    public function current(Request $request): JsonResponse
    {
        $sos = SosAlert::where('user_id', $request->user()->id)
            ->where(fn ($q) => $q->whereIn('status', SosAlert::OPEN)->orWhere('updated_at', '>=', now()->subMinutes(30)))
            ->latest('id')->first();

        return response()->json(['sos' => $sos ? self::payload($sos, $request->user()) : null]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(self::PLACE_RULES + ['message' => ['nullable', 'string', 'max:500']]);
        $user = $request->user();

        $open = SosAlert::where('user_id', $user->id)->whereIn('status', SosAlert::OPEN)->latest('id')->first();
        if ($open) {
            return response()->json(['sos' => self::payload($open, $user)]); // one open SOS per person; pressing again is harmless
        }

        // Sent at once, even without a place. Where: a scan or pick the student just made, else their class now, else the
        // phone's last known place (approximate). With none of those the app adds the building from GPS (location()).
        $place = self::place($data);
        if (! in_array($place['location_source'], ['qr', 'manual'], true) && ($class = ClassNow::for($user->id))) {
            $place = self::place(['room_id' => $class->room_id, 'location_source' => 'schedule']);
        }
        $sos = SosAlert::create(['user_id' => $user->id, 'alert_id' => Alert::current()?->id, 'message' => $data['message'] ?? null] + $place);

        User::whereIn('role', [Role::Admin, Role::SafetyOfficer])->where('is_active', true)->get()
            ->each(fn (User $officer) => $officer->notify(new SosRaised($sos)));
        SendOfficerPush::forSos($sos);

        return response()->json(['sos' => self::payload($sos, $user)], 201);
    }

    public function message(Request $request, SosAlert $sos): JsonResponse
    {
        $user = $request->user();
        abort_unless($sos->user_id === $user->id || $user->role->canManageIncidents(), 404);
        $data = $request->validate(['body' => ['required', 'string', 'max:500']]);
        if (! $sos->isOpen()) {
            throw ValidationException::withMessages(['body' => 'This SOS is closed.']);
        }
        // An officer here (e.g. from Responder mode) follows the desk's rule: one officer handles each case.
        if ($sos->user_id !== $user->id && ($owner = $sos->claimFor($user))) {
            return OfficerSosController::handledBy($owner);
        }

        $sos->messages()->create(['sender_id' => $user->id, 'body' => trim($data['body'])]);

        return response()->json(['sos' => self::payload($sos->fresh(), $user)], 201);
    }

    /** The sender corrects or confirms where they are (a pick or a scan after sending, or "Yes" to the schedule place). */
    public function location(Request $request, SosAlert $sos): JsonResponse
    {
        abort_unless($sos->user_id === $request->user()->id, 404);
        $data = $request->validate(self::PLACE_RULES);
        if (! $sos->isOpen()) {
            throw ValidationException::withMessages(['node_id' => 'This SOS is closed.']);
        }
        if (isset($data['lat'], $data['lng']) && empty($data['node_id']) && empty($data['room_id'])) {
            // GPS names the building only, and never replaces a better place. The coordinates are not kept.
            $building = BuildingLocator::at((float) $data['lat'], (float) $data['lng'], (float) ($data['accuracy'] ?? 999));
            if ($building && in_array($sos->location_source, [null, 'estimate'], true)) {
                $sos->update(['node_id' => null, 'room_id' => null, 'building_id' => $building, 'level' => null, 'location_source' => 'gps']);
            }

            return response()->json(['sos' => self::payload($sos->fresh(), $request->user())]);
        }
        $sos->update(self::place($data)); // the save broadcasts SosUpdated: officers see the new place live

        return response()->json(['sos' => self::payload($sos->fresh(), $request->user())]);
    }

    private const PLACE_RULES = [
        'node_id' => ['nullable', 'string', 'exists:evac_nodes,id'],
        'room_id' => ['nullable', 'string', 'exists:rooms,id'],
        'location_source' => ['nullable', 'in:qr,manual,schedule,estimate'], // schedule/estimate: a guess the student confirms
        'building_id' => ['nullable', 'string', 'exists:buildings,id'], // an estimate with no room (e.g. after a floor change)
        'level' => ['nullable', 'integer'],
        'lat' => ['nullable', 'numeric', 'between:-90,90'], // GPS, used once to find the building, never stored
        'lng' => ['nullable', 'numeric', 'between:-180,180'],
        'accuracy' => ['nullable', 'numeric', 'min:0'],
    ];

    /**
     * SOS place columns from a node, or from a room (some rooms have no map point).
     *
     * @param  array<string, mixed>  $data
     * @return array{node_id: ?string, room_id: ?string, building_id: ?string, level: ?int, location_source: ?string}
     */
    private static function place(array $data): array
    {
        $node = isset($data['node_id']) ? DB::table('evac_nodes')->where('id', $data['node_id'])->first() : null;
        $room = ! $node && isset($data['room_id']) ? DB::table('rooms')->where('id', $data['room_id'])->first() : null;
        $estimate = ! $node && ! $room && isset($data['building_id']) && ($data['location_source'] ?? null) === 'estimate';

        return [
            'node_id' => $node?->id,
            'room_id' => $node->room_id ?? $room?->id,
            'building_id' => $node->building_id ?? $room->building_id ?? ($estimate ? $data['building_id'] : null),
            'level' => $node->level ?? $room->level ?? ($estimate ? ($data['level'] ?? null) : null),
            'location_source' => $node || $room || $estimate ? ($data['location_source'] ?? null) : null,
        ];
    }

    public function cancel(Request $request, SosAlert $sos): JsonResponse
    {
        abort_unless($sos->user_id === $request->user()->id, 404);
        if ($sos->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'An officer is already responding. Use the chat to tell them you are safe.']);
        }
        $sos->update(['status' => 'cancelled']);

        return response()->json(['sos' => self::payload($sos, $request->user())]);
    }

    /** @return array<string, mixed> */
    public static function payload(SosAlert $sos, User $viewer): array
    {
        return [
            'id' => $sos->id,
            'status' => $sos->status,
            'message' => $sos->message,
            'place' => Places::label($sos->building_id, $sos->level, $sos->node_id, $sos->room_id),
            'location_source' => $sos->location_source,
            'node_id' => $sos->node_id, // so the app can confirm the same place ("Yes")
            'room_id' => $sos->room_id,
            'responder' => $sos->responder?->name,
            // The sender always may; an officer only when nobody else handles the case.
            'can_reply' => $sos->isOpen() && ($sos->user_id === $viewer->id || $sos->acknowledged_by === null || $sos->acknowledged_by === $viewer->id),
            'created_at' => $sos->created_at->toIso8601String(),
            'messages' => $sos->messages()->with('sender:id,name')->get()->map(fn ($m) => [
                'id' => $m->id,
                'body' => $m->body,
                'mine' => $m->sender_id === $viewer->id,
                'sender' => $m->sender->name,
                'created_at' => $m->created_at->toIso8601String(),
            ])->all(),
        ];
    }
}
