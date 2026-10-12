<?php

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

$make = fn (Role $role) => User::forceCreate([
    'name' => ucfirst($role->value), 'email' => "{$role->value}@example.test",
    'password' => 'secret-password', 'role' => $role, 'email_verified_at' => now(),
]);

it('redirects guests to the admin login', function () {
    $this->get('/admin')->assertRedirect('/admin/login');
});

it('lets admins and safety officers into the panel', function (Role $role) use ($make) {
    $this->actingAs($make($role))->get('/admin')->assertOk();
})->with([Role::Admin, Role::SafetyOfficer]);

it('keeps students, faculty and staff out of the panel', function (Role $role) use ($make) {
    $this->actingAs($make($role))->get('/admin')->assertForbidden();
})->with([Role::Student, Role::Faculty, Role::Staff]);

it('defaults new users to student', function () {
    $u = User::create(['name' => 'N', 'email' => 'n@example.test', 'password' => 'secret-password']);
    expect($u->fresh()->role)->toBe(Role::Student);
});
