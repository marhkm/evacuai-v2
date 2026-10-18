<?php

namespace App\Http\Controllers\Officer;

use App\Http\Controllers\Controller;
use App\Http\Resources\AlertResource;
use App\Models\Alert;
use App\Models\User;
use App\Support\SafetyBoard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Safety board for one alert (the active one by default). */
class SafetyController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $alert = $request->query('alert') ? Alert::findOrFail((int) $request->query('alert')) : Alert::current();
        if (! $alert) {
            return response()->json(['alert' => null, 'alerts' => SafetyBoard::alerts(), 'counts' => null, 'occupancy' => [], 'people' => []]);
        }
        $people = SafetyBoard::sort(SafetyBoard::query($alert->id))->get()->map(fn (User $p) => [
            'id' => $p->id,
            'name' => $p->name,
            'role' => $p->role->value,
            'status' => SafetyBoard::status($p),
            'place' => SafetyBoard::place($p),
            'source' => $p->getAttribute('assembly_node_id') ? 'check-in' : $p->getAttribute('last_source'),
            'updated_at' => $p->getAttribute('checked_in_at') ?? $p->getAttribute('last_seen_at'),
            'phone' => $p->phone,
        ]);

        return response()->json([
            'alert' => (new AlertResource($alert))->resolve(),
            'alerts' => SafetyBoard::alerts(),
            'counts' => SafetyBoard::counts($alert->id),
            'occupancy' => SafetyBoard::occupancy($alert->id),
            'people' => $people->values(),
        ]);
    }
}
