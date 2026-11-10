<?php

use App\Http\Middleware\EnsureOfficer;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    // Private channels (SOS chat) are authorized with the app's Sanctum token at POST /api/broadcasting/auth.
    ->withBroadcasting(__DIR__.'/../routes/channels.php', ['prefix' => 'api', 'middleware' => ['api', 'auth:sanctum']])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias(['officer' => EnsureOfficer::class]);
        $middleware->statefulApi(); // the Command Center (same origin) authenticates with the web session cookie
        // Behind the HTTPS proxy (Caddy, docker compose --profile https): trust its X-Forwarded-* so links and cookies
        // say https. Unset on a student's PC, where nothing sits in front.
        if ($proxies = env('TRUSTED_PROXIES')) {
            $middleware->trustProxies(at: $proxies === '*' ? '*' : explode(',', $proxies));
        }
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
