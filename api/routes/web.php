<?php

use App\Http\Controllers\Admin\DrillReportController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Admin-panel session (officers/admins only, checked in the controller).
Route::get('/admin/reports/alerts/{alert}.csv', DrillReportController::class)->name('reports.drill');
