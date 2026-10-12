<?php

use App\Http\Controllers\Api\AlertController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CampusSnapshotController;
use App\Http\Controllers\Api\ClientConfigController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\HazardReportController;
use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\Api\SafetyController;
use App\Http\Controllers\Api\ScheduleController;
use App\Http\Controllers\Api\SosController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => ['status' => 'ok']);
Route::get('/client-config', ClientConfigController::class);

Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login']); // own per-email limiter
    // Separate bucket per route (the prefix), 6 requests/minute per IP; codes are also capped at 5 tries each.
    foreach (['register' => 'register', 'verify-email' => 'verifyEmail', 'resend-code' => 'resendCode',
        'forgot-password' => 'forgotPassword', 'reset-password' => 'resetPassword', 'google' => 'google'] as $uri => $action) {
        Route::post($uri, [AuthController::class, $action])->middleware("throttle:6,1,auth-{$uri}");
    }
    Route::post('logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/campus-snapshot', CampusSnapshotController::class);
    Route::get('/alerts', [AlertController::class, 'index']);
    Route::post('/hazard-reports', [HazardReportController::class, 'store'])->middleware('throttle:5,1,reports');
    Route::get('/hazard-reports/mine', [HazardReportController::class, 'mine']);
    Route::post('/devices', [DeviceController::class, 'store']);
    Route::delete('/devices', [DeviceController::class, 'destroy']);

    Route::get('/sos/current', [SosController::class, 'current']);
    Route::post('/sos', [SosController::class, 'store'])->middleware('throttle:5,1,sos');
    Route::post('/sos/{sos}/messages', [SosController::class, 'message'])->middleware('throttle:30,1,sos-chat');
    Route::post('/sos/{sos}/cancel', [SosController::class, 'cancel']);
    Route::get('/check-in', [SafetyController::class, 'status']);
    Route::post('/check-in', [SafetyController::class, 'checkIn'])->middleware('throttle:10,1,check-in');
    Route::post('/location', [SafetyController::class, 'location'])->middleware('throttle:30,1,location');

    Route::prefix('me')->group(function () {
        Route::get('/', [MeController::class, 'show']);
        Route::patch('/', [MeController::class, 'update']);
        Route::delete('/', [MeController::class, 'destroy']);
        Route::post('consent', [MeController::class, 'consent']);
        Route::put('password', [MeController::class, 'password']);
        Route::get('schedule/now', [ScheduleController::class, 'now']);
    });
});
