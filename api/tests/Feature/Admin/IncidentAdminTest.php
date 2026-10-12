<?php

use App\Enums\Role;
use App\Events\AlertBroadcast;
use App\Filament\Resources\Alerts\Pages\CreateAlert;
use App\Filament\Resources\Alerts\Pages\ListAlerts;
use App\Filament\Resources\HazardReports\Pages\ListHazardReports;
use App\Jobs\SendAlertPush;
use App\Models\Alert;
use App\Models\HazardReport;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Event;
use Livewire\Livewire;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Event::fake([AlertBroadcast::class]);
    Bus::fake([SendAlertPush::class]);
    $this->officer = User::forceCreate(['name' => 'Officer', 'email' => 'so@example.test', 'role' => Role::SafetyOfficer, 'email_verified_at' => now()]);
    $this->actingAs($this->officer);
});

function pendingReports(int $n, string $hazard = 'fire'): void
{
    foreach (range(1, $n) as $i) {
        $u = User::forceCreate(['name' => "R{$i}", 'email' => "r{$i}{$hazard}@example.test", 'email_verified_at' => now()]);
        HazardReport::create(['reported_by' => $u->id, 'building_id' => 'DEMO', 'level' => 1, 'room_id' => 'DEMO/1/R101', 'hazard_type' => $hazard]);
    }
}

it('broadcasts a verified alert when 3+ people reported it, and verifies those reports', function () {
    pendingReports(3);
    Livewire::test(CreateAlert::class)
        ->fillForm(['hazard_type' => 'fire', 'severity_level' => 'critical', 'building_id' => 'DEMO', 'message' => 'Fire on the ground floor. Evacuate via Exit 1.'])
        ->call('create')
        ->assertHasNoFormErrors();

    $alert = Alert::sole();
    expect($alert->verified)->toBeTrue()->and($alert->issued_by)->toBe($this->officer->id)->and($alert->status)->toBe('active')
        ->and(HazardReport::where('status', 'verified')->where('alert_id', $alert->id)->count())->toBe(3);
    Event::assertDispatched(AlertBroadcast::class);
    Bus::assertDispatched(SendAlertPush::class);
});

it('requires the officer to confirm direct verification when fewer than 3 people reported it', function () {
    pendingReports(1);
    Livewire::test(CreateAlert::class)
        ->fillForm(['hazard_type' => 'fire', 'severity_level' => 'high', 'building_id' => 'DEMO', 'message' => 'Fire reported.'])
        ->call('create')
        ->assertHasFormErrors(['confirmed_direct']);
    expect(Alert::count())->toBe(0);

    Livewire::test(CreateAlert::class)
        ->fillForm(['hazard_type' => 'fire', 'severity_level' => 'high', 'building_id' => 'DEMO', 'message' => 'Fire reported.', 'confirmed_direct' => true])
        ->call('create')
        ->assertHasNoFormErrors();
    expect(Alert::count())->toBe(1);
});

it('lets drills go out without report verification', function () {
    Livewire::test(CreateAlert::class)
        ->fillForm(['hazard_type' => 'earthquake', 'severity_level' => 'medium', 'building_id' => null, 'message' => 'Earthquake drill.', 'is_drill' => true])
        ->call('create')
        ->assertHasNoFormErrors();
    expect(Alert::sole()->is_drill)->toBeTrue();
});

it('confirms, resolves and retracts alerts with a live update but no new push', function () {
    $alert = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Unverified fire', 'verified' => false, 'source' => 'reports', 'issued_at' => now()]);

    Livewire::test(ListAlerts::class)->callTableAction('confirm', $alert);
    expect($alert->fresh()->verified)->toBeTrue();

    Livewire::test(ListAlerts::class)->callTableAction('resolve', $alert);
    expect($alert->fresh()->status)->toBe('resolved')->and($alert->fresh()->resolved_at)->not->toBeNull();

    $other = Alert::create(['hazard_type' => 'flood', 'severity_level' => 'low', 'message' => 'False alarm', 'issued_at' => now()]);
    Livewire::test(ListAlerts::class)->callTableAction('retract', $other);
    expect($other->fresh()->status)->toBe('retracted');

    Event::assertDispatchedTimes(AlertBroadcast::class, 3);
    Bus::assertNotDispatched(SendAlertPush::class);
});

it('verifies and dismisses hazard reports', function () {
    pendingReports(2);
    [$a, $b] = HazardReport::orderBy('id')->get()->all();

    Livewire::test(ListHazardReports::class)
        ->assertCanSeeTableRecords([$a, $b])
        ->callTableAction('verify', $a)
        ->callTableAction('dismiss', $b);

    expect($a->fresh()->status)->toBe('verified')->and($a->fresh()->verified_by)->toBe($this->officer->id)
        ->and($b->fresh()->status)->toBe('dismissed');
});
