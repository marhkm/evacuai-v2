<?php

use App\Http\Controllers\Admin\Campus3dController;
use App\Http\Controllers\Admin\DrillReportController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Admin-panel session (officers/admins only, checked in the controller).
Route::get('/admin/reports/alerts/{alert}.csv', DrillReportController::class)->name('reports.drill');
Route::prefix('/admin/campus-3d')->name('campus3d.')->controller(Campus3dController::class)->group(function () {
    Route::get('snapshot', 'snapshot')->name('snapshot');
    Route::get('live', 'live')->name('live');
    Route::get('replay', 'replay')->name('replay');
});
