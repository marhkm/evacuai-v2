<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MeController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => ['status' => 'ok']);

Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login']); // own per-email limiter
    // Separate bucket per route (the prefix), 6 requests/minute per IP; codes are also capped at 5 tries each.
    foreach (['register' => 'register', 'verify-email' => 'verifyEmail', 'resend-code' => 'resendCode',
        'forgot-password' => 'forgotPassword', 'reset-password' => 'resetPassword', 'google' => 'google'] as $uri => $action) {
        Route::post($uri, [AuthController::class, $action])->middleware("throttle:6,1,auth-{$uri}");
    }
    Route::post('logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
});

Route::middleware('auth:sanctum')->prefix('me')->group(function () {
    Route::get('/', [MeController::class, 'show']);
    Route::patch('/', [MeController::class, 'update']);
    Route::delete('/', [MeController::class, 'destroy']);
    Route::post('consent', [MeController::class, 'consent']);
    Route::put('password', [MeController::class, 'password']);
});
