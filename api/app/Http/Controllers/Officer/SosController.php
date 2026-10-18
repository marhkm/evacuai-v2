<?php

namespace App\Http\Controllers\Officer;

use App\Exceptions\InvalidState;
use App\Http\Controllers\Api\SosController as UserSosController;
use App\Http\Controllers\Controller;
use App\Models\SosAlert;
use App\Models\User;
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
                'place' => Places::label($s->building_id, $s->level, $s->node_id),
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
        $sos->acknowledge();

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
        $sos->messages()->create(['sender_id' => $this->officer($request)->id, 'body' => trim($body)]);

        return $this->sos($sos, $request, 201);
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
