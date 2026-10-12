<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AlertResource;
use App\Models\Alert;
use Illuminate\Http\JsonResponse;

class AlertController extends Controller
{
    /** Active alerts first, then the last 30 days of history. Drafts are never shown to users. */
    public function index(): JsonResponse
    {
        $alerts = Alert::whereIn('status', ['active', 'resolved', 'retracted'])
            ->where('issued_at', '>=', now()->subDays(30))
            ->orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
            ->latest('issued_at')
            ->limit(50)
            ->get();

        return response()->json(['alerts' => AlertResource::collection($alerts)->resolve()]);
    }
}
