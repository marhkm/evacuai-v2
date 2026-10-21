<?php

use App\Http\Controllers\Command\SessionController;
use App\Http\Middleware\CommandCsp;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
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
