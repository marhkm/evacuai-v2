<?php

namespace App\Http\Controllers\Officer;

use App\Exceptions\InvalidState;
use App\Http\Controllers\Api\SosController as UserSosController;
use App\Http\Controllers\Controller;
use App\Models\SosAlert;
use App\Models\User;
use App\Support\Activity;
use App\Support\Places;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The SOS desk: open requests, acknowledge, chat, resolve. */
class SosController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $sos = SosAlert::with(['user:id,name', 'responder:id,name'])
            ->when($request->boolean('open'), fn ($q) => $q->whereIn('status', SosAlert::OPEN))
            ->latest()->latest('id')->paginate(50);

        return response()->json(['meta' => ['current_page' => $sos->currentPage(), 'last_page' => $sos->lastPage(), 'per_page' => $sos->perPage(), 'total' => $sos->total()],
            'sos' => collect($sos->items())->map(fn (SosAlert $s) => [
                'id' => $s->id,
                'person' => $s->user?->name,
                'place' => Places::label($s->building_id, $s->level, $s->node_id, $s->room_id),
                'message' => $s->message,
                'status' => $s->status,
                'created_at' => $s->created_at->toIso8601String(),
                'acknowledged_by' => $s->responder?->name,
                'acknowledged_at' => $s->acknowledged_at?->toIso8601String(),
            ])->values()]);
    }

    public function show(Request $request, SosAlert $sos): JsonResponse
    {
        return $this->sos($sos, $request);
    }

    public function acknowledge(Request $request, SosAlert $sos): JsonResponse
    {
        $this->expect($sos->status === 'pending', 'Only new SOS requests can be acknowledged.');
        if ($owner = $sos->acknowledge()) { // another officer claimed it a moment ago
            return self::handledBy($owner);
        }

        return $this->sos($sos, $request);
    }

    public function resolve(Request $request, SosAlert $sos): JsonResponse
    {
        $this->expect($sos->isOpen(), 'This SOS is already closed.');
        $sos->resolve();

        return $this->sos($sos, $request);
    }

    public function message(Request $request, SosAlert $sos): JsonResponse
    {
        $body = $request->validate(['body' => ['required', 'string', 'max:500']])['body'];
        $this->expect($sos->isOpen(), 'This SOS is closed.');
        if ($owner = $sos->claimFor($this->officer($request))) { // replying claims an unowned case
            return self::handledBy($owner);
        }
        $sos->messages()->create(['sender_id' => $this->officer($request)->id, 'body' => trim($body)]);

        return $this->sos($sos, $request, 201);
    }

    /** Another officer takes the case, e.g. when its owner is unavailable; the chat says so. */
    public function takeOver(Request $request, SosAlert $sos): JsonResponse
    {
        $officer = $this->officer($request);
        $this->expect($sos->isOpen(), 'This SOS is closed.');
        $this->expect($sos->acknowledged_by !== $officer->id, "You're already handling this.");
        $previous = $sos->responder;

        $sos->update(['acknowledged_by' => $officer->id, 'status' => 'acknowledged', 'acknowledged_at' => $sos->acknowledged_at ?? now()]);
        $sos->messages()->create(['sender_id' => $officer->id,
            'body' => $previous ? "{$officer->name} has taken over from {$previous->name}." : "{$officer->name} has taken over."]);
        Activity::log('sos_taken_over', ['sos_id' => $sos->id, 'from' => $previous?->id, 'to' => $officer->id]);

        return $this->sos($sos, $request);
    }

    /** 409 for an officer replying to a case another officer handles. */
    public static function handledBy(User $owner): JsonResponse
    {
        return response()->json(['error' => 'handled_by', 'name' => $owner->name, 'message' => "Handled by {$owner->name}."], 409);
    }

    private function sos(SosAlert $sos, Request $request, int $status = 200): JsonResponse
    {
        $sos = $sos->fresh() ?? $sos;

        return response()->json(['sos' => ['person' => $sos->user?->name] + UserSosController::payload($sos, $this->officer($request))], $status);
    }

    private function expect(bool $ok, string $message): void
    {
        if (! $ok) {
            throw new InvalidState($message);
        }
    }

    private function officer(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
