<?php

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;

uses(RefreshDatabase::class);

function fakeGoogle(string $email, bool $verified = true, string $id = 'g-123'): void
{
    $g = (new GoogleUser)->setRaw(['email_verified' => $verified])->map([
        'id' => $id, 'name' => 'Maria Santos', 'email' => $email,
    ]);
    $provider = Mockery::mock();
    $provider->shouldReceive('stateless')->andReturnSelf();
    $provider->shouldReceive('userFromToken')->with('google-access-token')->andReturn($g);
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);
}

it('creates a verified student account on first Google sign-in', function () {
    fakeGoogle('maria@example.test');
    $res = $this->postJson('/api/auth/google', ['access_token' => 'google-access-token', 'device_name' => 'p'])->assertOk();

    $user = User::where('email', 'maria@example.test')->firstOrFail();
    expect($res->json('token'))->toBeString()
        ->and($user->role)->toBe(Role::Student)
        ->and($user->email_verified_at)->not->toBeNull()
        ->and($user->password)->toBeNull()
        ->and(DB::table('social_accounts')->where(['provider' => 'google', 'provider_id' => 'g-123'])->value('user_id'))->toBe($user->id);
});

it('links Google to an existing email account instead of duplicating it', function () {
    $existing = User::forceCreate(['name' => 'Maria', 'email' => 'maria@example.test', 'password' => 'correct-horse-1', 'email_verified_at' => now()]);
    fakeGoogle('maria@example.test');
    $this->postJson('/api/auth/google', ['access_token' => 'google-access-token', 'device_name' => 'p'])->assertOk();
    expect(User::count())->toBe(1)
        ->and(DB::table('social_accounts')->value('user_id'))->toBe($existing->id);
});

it('refuses Google accounts whose email Google has not verified', function () {
    fakeGoogle('maria@example.test', verified: false);
    $this->postJson('/api/auth/google', ['access_token' => 'google-access-token', 'device_name' => 'p'])
        ->assertForbidden()->assertJsonPath('reason', 'email_not_verified');
    expect(User::count())->toBe(0);
});

it('applies the email domain allowlist to Google sign-in', function () {
    config(['evacuai.allowed_email_domains' => ['uclm.edu.ph']]);
    fakeGoogle('maria@gmail.com');
    $this->postJson('/api/auth/google', ['access_token' => 'google-access-token', 'device_name' => 'p'])
        ->assertUnprocessable()->assertJsonValidationErrors('email');
});

it('refuses disabled accounts', function () {
    User::forceCreate(['name' => 'M', 'email' => 'maria@example.test', 'email_verified_at' => now(), 'is_active' => false]);
    fakeGoogle('maria@example.test');
    $this->postJson('/api/auth/google', ['access_token' => 'google-access-token', 'device_name' => 'p'])
        ->assertForbidden()->assertJsonPath('reason', 'account_disabled');
});
