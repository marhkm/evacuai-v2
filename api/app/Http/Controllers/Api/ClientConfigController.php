<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Public settings the app needs at runtime, so one APK works against any server (students' PCs included).
 * The Reverb key is public by design (like a Pusher app key); the secret never leaves the server.
 * The app connects to the same host it uses for the API.
 */
class ClientConfigController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'reverb' => [
                'key' => config('reverb.apps.apps.0.key'),
                'port' => (int) config('evacuai.reverb_public_port'),
                'scheme' => config('evacuai.reverb_public_scheme'),
            ],
        ]);
    }
}
