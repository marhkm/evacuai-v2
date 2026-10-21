<?php

use App\Http\Controllers\Admin\Campus3dController;
use App\Http\Controllers\Admin\DrillReportController;
use App\Http\Controllers\Admin\HazardReportPhotoController;
use App\Http\Controllers\Command\SessionController;
use App\Http\Middleware\CommandCsp;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Admin-panel session (officers/admins only, checked in the controller).
Route::get('/admin/reports/alerts/{alert}.csv', DrillReportController::class)->name('reports.drill');
Route::get('/admin/hazard-reports/{report}/photo', HazardReportPhotoController::class)->name('reports.photo');
Route::prefix('/admin/campus-3d')->name('campus3d.')->controller(Campus3dController::class)->group(function () {
    Route::get('snapshot', 'snapshot')->name('snapshot');
    Route::get('live', 'live')->name('live');
    Route::get('replay', 'replay')->name('replay');
});

// Command Center (officer web app): session sign-in, then the single-page app for every /command URL.
Route::post('/command/session', [SessionController::class, 'store'])->name('command.session');
Route::delete('/command/session', [SessionController::class, 'destroy']);
Route::get('/command/{any?}', function () {
    $index = public_path('command/index.html');

    return is_file($index)
        ? response((string) file_get_contents($index), 200, ['Content-Type' => 'text/html; charset=UTF-8', 'Cache-Control' => 'no-cache'])
        : response('Command Center not built: run npm run build -w command', 503);
})->where('any', '.*')->middleware(CommandCsp::class);
