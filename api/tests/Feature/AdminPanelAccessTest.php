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

it('lets only admins into the panel', function () use ($make) {
    $this->actingAs($make(Role::Admin))->get('/admin')->assertOk();
});

it('keeps everyone else out, safety officers included (they use the Command Center)', function (Role $role) use ($make) {
    $this->actingAs($make($role))->get('/admin')->assertForbidden();
})->with([Role::SafetyOfficer, Role::Student, Role::Faculty, Role::Staff]);

it('keeps only the admin tools, with a way to the Command Center', function () use ($make) {
    $admin = $make(Role::Admin);
    $this->actingAs($admin)->get('/admin')->assertOk()
        ->assertSee('Command Center')->assertSee('/command', false)
        ->assertSee('Users')->assertSee('Activity log')->assertSee('Import class schedules')->assertSee('QR stickers')
        ->assertDontSee('Safety Monitor')->assertDontSee('Hazard Reports');
    foreach (['/admin/alerts', '/admin/hazard-reports', '/admin/paths', '/admin/sos-alerts', '/admin/safety-monitor', '/admin/campus-3d', '/admin/feedback'] as $gone) {
        $this->actingAs($admin)->get($gone)->assertNotFound();
    }
});

it('defaults new users to student', function () {
    $u = User::create(['name' => 'N', 'email' => 'n@example.test', 'password' => 'secret-password']);
    expect($u->fresh()->role)->toBe(Role::Student);
});

it('offers password reset on the admin login', function () {
    $this->get('/admin/password-reset/request')->assertOk();
});
