<?php

use App\Enums\Role;
use App\Models\SosAlert;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
});

it('hides officer routes from non-officers', function (Role $role, bool $active) {
    Sanctum::actingAs(officerUser($role, $active));
    $this->getJson('/api/officer/overview')->assertNotFound();
})->with([
    'student' => [Role::Student, true],
    'faculty' => [Role::Faculty, true],
    'staff' => [Role::Staff, true],
    'inactive officer' => [Role::SafetyOfficer, false],
]);

it('requires sign-in', function () {
    $this->getJson('/api/officer/overview')->assertUnauthorized();
});

it('shows the overview to officers and admins', function (Role $role) {
    $student = officerUser(Role::Student);
    SosAlert::create(['user_id' => $student->id, 'status' => 'pending']);
    Sanctum::actingAs(officerUser($role));

    $this->getJson('/api/officer/overview')->assertOk()
        ->assertJsonPath('stats.open_sos', 1)
        ->assertJsonPath('stats.pending_reports', 0)
        ->assertJsonPath('active_alert', null);
})->with([Role::SafetyOfficer, Role::Admin]);
