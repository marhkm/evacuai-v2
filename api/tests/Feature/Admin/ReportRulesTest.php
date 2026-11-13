<?php

use App\Enums\Role;
use App\Filament\Pages\ReportRules;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Models\HazardReport;
use App\Support\ReportActions;
use App\Support\ReportVerification;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;

uses(RefreshDatabase::class);

it('lets an admin change how many reports verify a hazard, and within how many minutes', function () {
    $this->actingAs(officerUser(Role::Admin), 'admin');

    Livewire::test(ReportRules::class)
        ->assertSet('threshold', 3)->assertSet('minutes', 10)
        ->set('threshold', 4)->set('minutes', 15)->call('save')->assertHasNoErrors();

    expect(ReportVerification::threshold())->toBe(4)->and(ReportVerification::minutes())->toBe(15)
        ->and(DB::table('user_activity_logs')->where('activity_type', 'report_rules_changed')->exists())->toBeTrue();
});

it('keeps the numbers sensible', function () {
    $this->actingAs(officerUser(Role::Admin), 'admin');

    Livewire::test(ReportRules::class)->set('threshold', 1)->set('minutes', 90)->call('save')
        ->assertHasErrors(['threshold', 'minutes']);
    expect(ReportVerification::threshold())->toBe(3);
});

it('keeps Report rules for admins only', function () {
    $this->actingAs(officerUser(), 'admin')->get(ReportRules::getUrl())->assertForbidden();
});

it('shows "Often false" on Users, and Clear makes the student count again', function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    $student = officerUser(Role::Student);
    foreach ([1, 2, 3] as $i) {
        ReportActions::rejectFalse(HazardReport::create(['reported_by' => $student->id, 'building_id' => 'DEMO', 'level' => 1, 'hazard_type' => 'fire']), officerUser());
    }
    $this->actingAs(officerUser(Role::Admin), 'admin');
    $this->travel(1)->seconds();

    Livewire::test(ListUsers::class)
        ->assertSee('Often false')
        ->callTableAction('clearFalseReports', $student);

    expect(ReportVerification::flagged($student->fresh()))->toBeFalse()
        ->and(DB::table('user_activity_logs')->where('activity_type', 'false_reports_cleared')->exists())->toBeTrue();
});
