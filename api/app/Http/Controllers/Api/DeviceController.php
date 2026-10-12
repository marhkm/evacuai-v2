<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/** Expo push tokens. A token moves to whoever signed in last on that device. */
class DeviceController extends Controller
{
    public function store(Request $request): Response
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:255', 'regex:/^Expo(nent)?PushToken\[.+\]$/'],
            'platform' => ['required', 'in:android,ios'],
        ]);
        DB::table('device_tokens')->upsert([[
            'token' => $data['token'], 'user_id' => $request->user()->id, 'platform' => $data['platform'],
            'last_seen_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]], ['token'], ['user_id', 'platform', 'last_seen_at', 'updated_at']);

        return response()->noContent();
    }

    public function destroy(Request $request): Response
    {
        $data = $request->validate(['token' => 'required|string']);
        DB::table('device_tokens')->where(['token' => $data['token'], 'user_id' => $request->user()->id])->delete();

        return response()->noContent();
    }
}
