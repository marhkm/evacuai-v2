<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Content Security Policy for the Command Center: own scripts only, sockets to Reverb, no third-party content. */
class CommandCsp
{
    public const POLICY = "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; "
        ."style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $response->headers->set('Content-Security-Policy', self::POLICY);
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        return $response;
    }
}
