<?php

namespace App\Http\Controllers\Officer;

use App\Http\Controllers\Controller;
use App\Http\Resources\AlertResource;
use App\Models\Alert;
use App\Support\CampusStats;
use App\Support\Unseen;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OverviewController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $active = Alert::current();

        return response()->json([
            'stats' => CampusStats::overview(),
            'active_alert' => $active ? (new AlertResource($active))->resolve() : null,
            'unseen' => Unseen::counts($request->user()),
        ]);
    }
}
