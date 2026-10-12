<?php

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function signedIn(array $attrs = []): User
{
    $user = User::forceCreate(array_merge([
        'name' => 'Juan', 'email' => 'juan@example.test', 'password' => 'correct-horse-1', 'email_verified_at' => now(),
    ], $attrs));
    Sanctum::actingAs($user);

    return $user;
}

it('requires a token', function () {
    $this->getJson('/api/me')->assertUnauthorized();
});

it('updates profile fields but never the role', function () {
    $user = signedIn();
    $this->patchJson('/api/me', ['name' => 'Juan D.', 'department' => 'CCS', 'phone' => '09171234567', 'role' => 'admin'])
        ->assertOk()->assertJsonPath('user.phone', '09171234567');
    expect($user->fresh()->role)->toBe(Role::Student)->and($user->fresh()->department)->toBe('CCS');
});

it('validates Philippine mobile numbers', function () {
    signedIn();
    $this->patchJson('/api/me', ['phone' => '12345'])->assertUnprocessable()->assertJsonValidationErrors('phone');
});

it('records consent', function () {
    $user = signedIn();
    $this->postJson('/api/me/consent')->assertOk()->assertJsonPath('user.consented', true);
    expect($user->fresh()->consented_at)->not->toBeNull();
});

it('changes the password only with the current one', function () {
    $user = signedIn();
    $this->putJson('/api/me/password', ['current_password' => 'wrong-one-1', 'password' => 'new-horse-22', 'password_confirmation' => 'new-horse-22'])
        ->assertUnprocessable()->assertJsonValidationErrors('current_password');
    $this->putJson('/api/me/password', ['current_password' => 'correct-horse-1', 'password' => 'new-horse-22', 'password_confirmation' => 'new-horse-22'])
        ->assertOk();
    expect(Hash::check('new-horse-22', $user->fresh()->password))->toBeTrue();
});

it('lets a Google-only user set a first password without a current one', function () {
    $user = signedIn(['password' => null]);
    $this->putJson('/api/me/password', ['password' => 'new-horse-22', 'password_confirmation' => 'new-horse-22'])->assertOk();
    expect(Hash::check('new-horse-22', $user->fresh()->password))->toBeTrue();
});

it('deletes the account after confirming the password', function () {
    $user = signedIn();
    $this->deleteJson('/api/me', ['password' => 'wrong-one-1'])->assertUnprocessable();
    $this->deleteJson('/api/me', ['password' => 'correct-horse-1'])->assertNoContent();
    expect(User::find($user->id))->toBeNull();
});
