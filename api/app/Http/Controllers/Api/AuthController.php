<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Rules\AllowedEmailDomain;
use App\Support\Activity;
use App\Support\AuthCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\GoogleProvider;
use Throwable;

/** Token auth for the mobile app (Sanctum). The admin web uses Filament's own session login. */
class AuthController extends Controller
{
    private const GENERIC_SENT = ['message' => 'If the account exists, a code has been sent.'];

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:100', 'unique:users,email', new AllowedEmailDomain],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);
        // Role is never taken from the request: every self-registered account is a student.
        $user = User::create($data);
        Activity::log('registered', [], $user->id);
        AuthCodes::send($user, 'verify');

        return response()->json(['message' => 'Account created. Enter the code sent to your email.'], 201);
    }

    public function verifyEmail(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email', 'code' => 'required|digits:6', 'device_name' => 'required|string|max:100']);
        $user = User::where('email', $data['email'])->first();
        if (! $user || ! AuthCodes::consume($user, 'verify', $data['code'])) {
            throw ValidationException::withMessages(['code' => 'The code is invalid or has expired.']);
        }
        $user->forceFill(['email_verified_at' => $user->email_verified_at ?? now()])->save();

        return $this->tokenResponse($user, $data['device_name'], 'email_code');
    }

    public function resendCode(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email']);
        $user = User::where('email', $data['email'])->first();
        if ($user && ! $user->email_verified_at) {
            AuthCodes::send($user, 'verify');
        }

        return response()->json(self::GENERIC_SENT);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string', 'device_name' => 'required|string|max:100']);
        $key = 'login|'.Str::lower($data['email']).'|'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json(['message' => 'Too many attempts. Try again in a minute.'], 429);
        }

        $user = User::where('email', $data['email'])->first();
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($key, 60);
            throw ValidationException::withMessages(['email' => 'These credentials do not match our records.']);
        }
        RateLimiter::clear($key);

        return $this->guard($user) ?? $this->tokenResponse($user, $data['device_name'], 'password');
    }

    public function google(Request $request): JsonResponse
    {
        $data = $request->validate(['access_token' => 'required|string', 'device_name' => 'required|string|max:100']);
        try {
            /** @var GoogleProvider $google */
            $google = Socialite::driver('google');
            $g = $google->stateless()->userFromToken($data['access_token']);
        } catch (Throwable) {
            return response()->json(['reason' => 'google_token_invalid', 'message' => 'Google sign-in failed.'], 401);
        }
        if (! ($g->user['email_verified'] ?? false)) {
            return response()->json(['reason' => 'email_not_verified', 'message' => 'Your Google email is not verified.'], 403);
        }
        Validator::make(['email' => $g->getEmail()], ['email' => ['required', 'email', new AllowedEmailDomain]])->validate();

        $user = $this->socialUser('google', (string) $g->getId(), (string) $g->getEmail(), $g->getName() ?: (string) $g->getEmail());

        return $this->guard($user) ?? $this->tokenResponse($user, $data['device_name'], 'google');
    }

    /**
     * Microsoft 365 sign-in (web build: browser OAuth access token for Microsoft Graph). Only accounts that belong to the
     * configured Entra tenant are accepted, identified by userPrincipalName (its domain is verified by the tenant;
     * the "mail" attribute is not, so it is never trusted). Guest accounts (#EXT#) are refused.
     */
    public function microsoft(Request $request): JsonResponse
    {
        $data = $request->validate(['access_token' => 'required|string', 'device_name' => 'required|string|max:100']);
        $tenant = config('services.microsoft.tenant_id');
        if (! $tenant) {
            return response()->json(['reason' => 'microsoft_disabled', 'message' => 'Microsoft sign-in is not set up on this server.'], 404);
        }
        $graph = Http::withToken($data['access_token'])->acceptJson()->timeout(15);
        try {
            $me = $graph->get('https://graph.microsoft.com/v1.0/me', ['$select' => 'id,displayName,userPrincipalName'])->throw()->json();
            $org = (string) $graph->get('https://graph.microsoft.com/v1.0/organization', ['$select' => 'id'])->throw()->json('value.0.id');
        } catch (Throwable) {
            return response()->json(['reason' => 'microsoft_token_invalid', 'message' => 'Microsoft sign-in failed.'], 401);
        }
        $email = Str::lower((string) ($me['userPrincipalName'] ?? ''));
        if (! hash_equals(Str::lower($tenant), Str::lower($org)) || str_contains($email, '#ext#')) {
            return response()->json(['reason' => 'wrong_tenant', 'message' => 'Use your school Microsoft 365 account.'], 403);
        }
        Validator::make(['email' => $email], ['email' => ['required', 'email', new AllowedEmailDomain]])->validate();

        $user = $this->socialUser('microsoft', (string) $me['id'], $email, ($me['displayName'] ?? '') ?: $email);

        return $this->guard($user) ?? $this->tokenResponse($user, $data['device_name'], 'microsoft');
    }

    /** One user per email: links the provider identity on first use; the provider has verified the address. */
    private function socialUser(string $provider, string $providerId, string $email, string $name): User
    {
        return DB::transaction(function () use ($provider, $providerId, $email, $name) {
            $linked = DB::table('social_accounts')->where(['provider' => $provider, 'provider_id' => $providerId])->value('user_id');
            $user = $linked ? User::find($linked) : User::where('email', $email)->first();
            if (! $user) {
                $user = User::forceCreate(['name' => $name, 'email' => $email, 'email_verified_at' => now()]);
            }
            if (! $linked) {
                DB::table('social_accounts')->insert([
                    'user_id' => $user->id, 'provider' => $provider, 'provider_id' => $providerId,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            if (! $user->email_verified_at) {
                $user->forceFill(['email_verified_at' => now()])->save();
            }

            return $user;
        });
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email']);
        if ($user = User::where('email', $data['email'])->first()) {
            AuthCodes::send($user, 'reset');
        }

        return response()->json(self::GENERIC_SENT);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email', 'code' => 'required|digits:6',
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);
        $user = User::where('email', $data['email'])->first();
        if (! $user || ! AuthCodes::consume($user, 'reset', $data['code'])) {
            throw ValidationException::withMessages(['code' => 'The code is invalid or has expired.']);
        }
        $user->forceFill([
            'password' => $data['password'],
            'email_verified_at' => $user->email_verified_at ?? now(), // the code proved mailbox ownership
        ])->save();
        $user->tokens()->delete();

        return response()->json(['message' => 'Password updated. Sign in with your new password.']);
    }

    public function logout(Request $request): Response
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    private function guard(User $user): ?JsonResponse
    {
        if (! $user->email_verified_at) {
            return response()->json(['reason' => 'email_not_verified', 'message' => 'Verify your email first.'], 403);
        }
        if (! $user->is_active) {
            return response()->json(['reason' => 'account_disabled', 'message' => 'This account is disabled.'], 403);
        }

        return null;
    }

    private function tokenResponse(User $user, string $device, string $method): JsonResponse
    {
        Activity::log('login', ['method' => $method], $user->id);

        return response()->json(['token' => $user->createToken($device)->plainTextToken, 'user' => new UserResource($user)]);
    }
}
