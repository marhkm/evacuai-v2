<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\Alert;
use App\Models\SosAlert;
use App\Models\User;
use App\Notifications\SosRaised;
use App\Support\Places;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
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
        $data = $request->validate([
            'node_id' => ['nullable', 'string', Rule::exists('evac_nodes', 'id')],
            'message' => ['nullable', 'string', 'max:500'],
        ]);
        $user = $request->user();

        $open = SosAlert::where('user_id', $user->id)->whereIn('status', SosAlert::OPEN)->latest('id')->first();
        if ($open) {
            return response()->json(['sos' => self::payload($open, $user)]); // one open SOS per person; pressing again is harmless
        }

        $node = isset($data['node_id']) ? DB::table('evac_nodes')->where('id', $data['node_id'])->first() : null;
        $sos = SosAlert::create([
            'user_id' => $user->id,
            'alert_id' => Alert::current()?->id,
            'node_id' => $node?->id,
            'building_id' => $node?->building_id,
            'level' => $node?->level,
            'message' => $data['message'] ?? null,
        ]);

        User::whereIn('role', [Role::Admin, Role::SafetyOfficer])->where('is_active', true)->get()
            ->each(fn (User $officer) => $officer->notify(new SosRaised($sos)));

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

        $sos->messages()->create(['sender_id' => $user->id, 'body' => trim($data['body'])]);

        return response()->json(['sos' => self::payload($sos->fresh(), $user)], 201);
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
    private static function payload(SosAlert $sos, User $viewer): array
    {
        return [
            'id' => $sos->id,
            'status' => $sos->status,
            'message' => $sos->message,
            'place' => Places::label($sos->building_id, $sos->level, $sos->node_id),
            'responder' => $sos->responder?->name,
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
