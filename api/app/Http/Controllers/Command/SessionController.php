<?php

namespace App\Http\Controllers\Command;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Command Center sign-in: a same-origin web session, for active safety officers and admins only. */
class SessionController extends Controller
{
    public function store(Request $request): Response
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string']);
        $key = 'command-login|'.Str::lower($data['email']).'|'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            abort(429, 'Too many attempts. Try again in a minute.');
        }

        $user = User::where('email', $data['email'])->first();
        $ok = $user && $user->password && Hash::check($data['password'], $user->password)
            && $user->is_active && $user->role->canManageIncidents();
        if (! $ok) {
            RateLimiter::hit($key, 60);
            throw ValidationException::withMessages(['email' => "Those details don't match an officer account."]);
        }
        RateLimiter::clear($key);

        Auth::guard('web')->login($user); // the Login event logs it (method "command")
        $request->session()->regenerate();

        return response()->noContent();
    }

    public function destroy(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }
}
