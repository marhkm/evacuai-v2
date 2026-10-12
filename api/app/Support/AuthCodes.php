<?php

namespace App\Support;

use App\Models\User;
use App\Notifications\AuthCodeNotification;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

/**
 * 6-digit one-time codes for email verification and password reset (manuscript use cases).
 * Stored hashed in the cache: 15 minutes, 5 attempts, one live code per user and purpose.
 */
class AuthCodes
{
    public const TTL_MINUTES = 15;

    public const MAX_ATTEMPTS = 5;

    public static function send(User $user, string $purpose): void
    {
        $code = str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
        Cache::put(self::key($user, $purpose), ['hash' => Hash::make($code), 'attempts' => 0], now()->addMinutes(self::TTL_MINUTES));
        $user->notify(new AuthCodeNotification($code, $purpose));
    }

    /** True once for a correct code; the code is consumed on success and burned after too many misses. */
    public static function consume(User $user, string $purpose, string $code): bool
    {
        $key = self::key($user, $purpose);
        $entry = Cache::get($key);
        if (! $entry) {
            return false;
        }
        if (Hash::check($code, $entry['hash'])) {
            Cache::forget($key);

            return true;
        }
        $entry['attempts']++;
        $entry['attempts'] >= self::MAX_ATTEMPTS
            ? Cache::forget($key)
            : Cache::put($key, $entry, now()->addMinutes(self::TTL_MINUTES));

        return false;
    }

    private static function key(User $user, string $purpose): string
    {
        return "auth-code:{$purpose}:{$user->id}";
    }
}
