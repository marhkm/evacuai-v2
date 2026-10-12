<?php

use App\Enums\Role;
use App\Filament\Resources\Users\Pages\CreateUser;
use App\Filament\Resources\Users\Pages\EditUser;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Livewire\Livewire;

uses(RefreshDatabase::class);

function person(Role $role, string $email): User
{
    return User::forceCreate(['name' => ucfirst($role->value), 'email' => $email, 'password' => 'correct-horse-1', 'role' => $role, 'email_verified_at' => now()]);
}

it('lets an admin promote a student and records it in the activity log', function () {
    $admin = person(Role::Admin, 'admin@example.test');
    $student = person(Role::Student, 'stu@example.test');
    $this->actingAs($admin);

    Livewire::test(EditUser::class, ['record' => $student->getRouteKey()])
        ->fillForm(['role' => Role::SafetyOfficer->value])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($student->fresh()->role)->toBe(Role::SafetyOfficer);
    $log = DB::table('user_activity_logs')->where('activity_type', 'role_changed')->first();
    expect($log->user_id)->toBe($admin->id)
        ->and(json_decode($log->details, true))->toMatchArray(['target_user_id' => $student->id, 'from' => 'student', 'to' => 'safety_officer']);
});

it('lets an admin create a user with a role', function () {
    $this->actingAs(person(Role::Admin, 'admin@example.test'));
    Livewire::test(CreateUser::class)
        ->fillForm(['name' => 'New Officer', 'email' => 'officer@example.test', 'role' => Role::SafetyOfficer->value, 'is_active' => true])
        ->call('create')
        ->assertHasNoFormErrors();
    expect(User::where('email', 'officer@example.test')->first()->role)->toBe(Role::SafetyOfficer);
});

it('does not let an admin demote or disable their own account', function () {
    $admin = person(Role::Admin, 'admin@example.test');
    $this->actingAs($admin);
    Livewire::test(EditUser::class, ['record' => $admin->getRouteKey()])
        ->fillForm(['role' => Role::Student->value, 'is_active' => false])
        ->call('save');
    expect($admin->fresh()->role)->toBe(Role::Admin)->and($admin->fresh()->is_active)->toBeTrue();
});

it('keeps the password when the field is left blank', function () {
    $this->actingAs(person(Role::Admin, 'admin@example.test'));
    $student = person(Role::Student, 'stu@example.test');
    Livewire::test(EditUser::class, ['record' => $student->getRouteKey()])
        ->fillForm(['name' => 'Renamed', 'password' => ''])
        ->call('save')
        ->assertHasNoFormErrors();
    expect(Hash::check('correct-horse-1', $student->fresh()->password))->toBeTrue();
});

it('gives safety officers a read-only user list', function () {
    $officer = person(Role::SafetyOfficer, 'so@example.test');
    $student = person(Role::Student, 'stu@example.test');
    $this->actingAs($officer);

    Livewire::test(ListUsers::class)->assertOk()->assertCanSeeTableRecords([$student]);
    $this->get(EditUser::getUrl(['record' => $student]))->assertForbidden();
    $this->get(CreateUser::getUrl())->assertForbidden();
});
