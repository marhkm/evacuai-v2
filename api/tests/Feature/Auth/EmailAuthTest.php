<?php

use App\Enums\Role;
use App\Models\User;
use App\Notifications\AuthCodeNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;

uses(RefreshDatabase::class);

beforeEach(fn () => Notification::fake());

function lastCode(User $user, string $purpose): string
{
    $code = null;
    Notification::assertSentTo($user, AuthCodeNotification::class, function ($n) use (&$code, $purpose) {
        if ($n->purpose === $purpose) {
            $code = $n->code;
        }

        return true;
    });

    return $code;
}

function verifiedUser(array $attrs = []): User
{
    return User::forceCreate(array_merge([
        'name' => 'Juan', 'email' => 'juan@example.test', 'password' => 'correct-horse-1',
        'email_verified_at' => now(),
    ], $attrs));
}

describe('register + verify', function () {
    it('registers as a student even if a role is sent, and emails a 6-digit code', function () {
        $this->postJson('/api/auth/register', [
            'name' => 'Juan', 'email' => 'juan@example.test', 'role' => 'admin',
            'password' => 'correct-horse-1', 'password_confirmation' => 'correct-horse-1',
        ])->assertCreated();

        $user = User::where('email', 'juan@example.test')->firstOrFail();
        expect($user->role)->toBe(Role::Student)
            ->and($user->email_verified_at)->toBeNull()
            ->and(lastCode($user, 'verify'))->toMatch('/^\d{6}$/');
    });

    it('verifies with the code and returns a token', function () {
        $this->postJson('/api/auth/register', [
            'name' => 'Juan', 'email' => 'juan@example.test',
            'password' => 'correct-horse-1', 'password_confirmation' => 'correct-horse-1',
        ]);
        $user = User::where('email', 'juan@example.test')->first();

        $res = $this->postJson('/api/auth/verify-email', [
            'email' => 'juan@example.test', 'code' => lastCode($user, 'verify'), 'device_name' => 'pixel',
        ])->assertOk()->assertJsonPath('user.email_verified', true);

        expect($res->json('token'))->toBeString();
        $this->withToken($res->json('token'))->getJson('/api/me')->assertOk()->assertJsonPath('user.email', 'juan@example.test');
    });

    it('rejects a wrong code and burns the code after 5 wrong tries', function () {
        $this->postJson('/api/auth/register', [
            'name' => 'Juan', 'email' => 'juan@example.test',
            'password' => 'correct-horse-1', 'password_confirmation' => 'correct-horse-1',
        ]);
        $user = User::where('email', 'juan@example.test')->first();
        $code = lastCode($user, 'verify');
        $wrong = $code === '000000' ? '111111' : '000000';

        foreach (range(1, 5) as $_) {
            $this->postJson('/api/auth/verify-email', ['email' => $user->email, 'code' => $wrong, 'device_name' => 'p'])
                ->assertUnprocessable();
        }
        $this->postJson('/api/auth/verify-email', ['email' => $user->email, 'code' => $code, 'device_name' => 'p'])
            ->assertUnprocessable();
    });

    it('enforces the email domain allowlist', function () {
        config(['evacuai.allowed_email_domains' => ['uclm.edu.ph']]);

        $this->postJson('/api/auth/register', [
            'name' => 'X', 'email' => 'x@gmail.com',
            'password' => 'correct-horse-1', 'password_confirmation' => 'correct-horse-1',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');

        $this->postJson('/api/auth/register', [
            'name' => 'Y', 'email' => 'y@uclm.edu.ph',
            'password' => 'correct-horse-1', 'password_confirmation' => 'correct-horse-1',
        ])->assertCreated();
    });

    it('resend-code answers the same for unknown emails', function () {
        $this->postJson('/api/auth/resend-code', ['email' => 'nobody@example.test'])->assertOk();
        Notification::assertNothingSent();
    });
});

describe('login', function () {
    it('returns a token for valid credentials', function () {
        verifiedUser();
        $this->postJson('/api/auth/login', ['email' => 'juan@example.test', 'password' => 'correct-horse-1', 'device_name' => 'p'])
            ->assertOk()->assertJsonStructure(['token', 'user' => ['id', 'name', 'email', 'role']]);
    });

    it('gives the same error for a wrong password and an unknown email', function () {
        verifiedUser();
        $a = $this->postJson('/api/auth/login', ['email' => 'juan@example.test', 'password' => 'nope-nope-1', 'device_name' => 'p']);
        $b = $this->postJson('/api/auth/login', ['email' => 'ghost@example.test', 'password' => 'nope-nope-1', 'device_name' => 'p']);
        $a->assertUnprocessable();
        $b->assertUnprocessable();
        expect($a->json('errors'))->toEqual($b->json('errors'));
    });

    it('refuses unverified and disabled accounts', function () {
        verifiedUser(['email_verified_at' => null]);
        $this->postJson('/api/auth/login', ['email' => 'juan@example.test', 'password' => 'correct-horse-1', 'device_name' => 'p'])
            ->assertForbidden()->assertJsonPath('reason', 'email_not_verified');

        User::where('email', 'juan@example.test')->update(['email_verified_at' => now(), 'is_active' => false]);
        $this->postJson('/api/auth/login', ['email' => 'juan@example.test', 'password' => 'correct-horse-1', 'device_name' => 'p'])
            ->assertForbidden()->assertJsonPath('reason', 'account_disabled');
    });

    it('throttles repeated failures', function () {
        verifiedUser();
        foreach (range(1, 5) as $_) {
            $this->postJson('/api/auth/login', ['email' => 'juan@example.test', 'password' => 'bad-pass-1', 'device_name' => 'p']);
        }
        $this->postJson('/api/auth/login', ['email' => 'juan@example.test', 'password' => 'correct-horse-1', 'device_name' => 'p'])
            ->assertTooManyRequests();
    });

    it('logout revokes the token', function () {
        verifiedUser();
        $token = $this->postJson('/api/auth/login', ['email' => 'juan@example.test', 'password' => 'correct-horse-1', 'device_name' => 'p'])->json('token');
        $this->withToken($token)->postJson('/api/auth/logout')->assertNoContent();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
    });
});

describe('password reset', function () {
    it('resets with an emailed code and revokes old tokens', function () {
        $user = verifiedUser();
        $old = $user->createToken('old')->plainTextToken;

        $this->postJson('/api/auth/forgot-password', ['email' => 'juan@example.test'])->assertOk();
        $this->postJson('/api/auth/reset-password', [
            'email' => 'juan@example.test', 'code' => lastCode($user, 'reset'),
            'password' => 'new-horse-22', 'password_confirmation' => 'new-horse-22',
        ])->assertOk();

        $this->postJson('/api/auth/login', ['email' => 'juan@example.test', 'password' => 'new-horse-22', 'device_name' => 'p'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($old)->getJson('/api/me')->assertUnauthorized();
    });

    it('forgot-password answers the same for unknown emails', function () {
        $this->postJson('/api/auth/forgot-password', ['email' => 'ghost@example.test'])->assertOk();
        Notification::assertNothingSent();
    });

    it('a verify code cannot reset a password', function () {
        $user = verifiedUser(['email_verified_at' => null]);
        $this->postJson('/api/auth/resend-code', ['email' => $user->email])->assertOk();
        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email, 'code' => lastCode($user, 'verify'),
            'password' => 'new-horse-22', 'password_confirmation' => 'new-horse-22',
        ])->assertUnprocessable();
    });
});
