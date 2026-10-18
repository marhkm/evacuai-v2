<?php

namespace App\Http\Controllers\Officer;

use App\Http\Controllers\Controller;
use App\Http\Resources\AlertResource;
use App\Models\Alert;
use App\Support\CampusStats;
use Illuminate\Http\JsonResponse;

class OverviewController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $active = Alert::current();

        return response()->json([
            'stats' => CampusStats::overview(),
            'active_alert' => $active ? (new AlertResource($active))->resolve() : null,
        ]);
    }
}
