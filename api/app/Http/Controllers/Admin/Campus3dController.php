<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Api\CampusSnapshotController;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Campus3dData;
use Filament\Facades\Filament;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Data for the admin "Campus 3D" page (officers/admins only): snapshot, live overlay, drill replay. */
class Campus3dController extends Controller
{
    public function snapshot(Request $request, CampusSnapshotController $snapshots): JsonResponse
    {
        $this->authorizePanel($request);

        return response()->json($snapshots->build());
    }

    public function live(Request $request): JsonResponse
    {
        $this->authorizePanel($request);

        return response()->json(Campus3dData::live(Campus3dData::pick($request->integer('alert') ?: null)));
    }

    public function replay(Request $request): JsonResponse
    {
        $this->authorizePanel($request);
        $alert = Campus3dData::pick($request->integer('alert') ?: null);
        abort_unless($alert !== null, 404);

        return response()->json(Campus3dData::replay($alert));
    }

    private function authorizePanel(Request $request): void
    {
        /** @var ?User $user */
        $user = $request->user();
        abort_unless($user?->canAccessPanel(Filament::getPanel('admin')), 403);
    }
}
