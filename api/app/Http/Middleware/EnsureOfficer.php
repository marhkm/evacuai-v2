<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Officer API: active safety officers and admins only. Everyone else gets 404, so the routes stay unannounced. */
class EnsureOfficer
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var ?User $user */
        $user = $request->user();
        abort_unless($user && $user->is_active && $user->role->canManageIncidents(), 404);

        return $next($request);
    }
}
