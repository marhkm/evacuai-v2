<?php

namespace App\Http\Controllers\Officer;

use App\Http\Controllers\Controller;
use App\Models\Alert;
use App\Support\Campus3dData;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class Campus3dController extends Controller
{
    public function live(Request $request): JsonResponse
    {
        return response()->json(Campus3dData::live(Campus3dData::pick($request->integer('alert') ?: null)));
    }

    public function replay(Request $request): JsonResponse
    {
        $id = $request->validate(['alert' => ['required', 'integer']])['alert'];

        return response()->json(Campus3dData::replay(Alert::whereNotNull('issued_at')->findOrFail($id)));
    }
}
