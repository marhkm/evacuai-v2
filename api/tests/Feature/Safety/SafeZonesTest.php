<?php

use App\Enums\Role;
use App\Filament\Pages\SafeZones as SafeZonesPage;
use App\Models\Alert;
use App\Support\SafeZones;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Livewire\Livewire;

uses(RefreshDatabase::class);

const FIELD = 'BE/1/AP_Field';
const OUTSIDE = 'A1/1/AP_Outside';

beforeEach(function () {
    $this->seed(CampusSeeder::class); // the real campus: two safe zones
    $this->alert = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Drill', 'is_drill' => true, 'issued_at' => now()]);
});

function capacity(string $node, ?int $n): void
{
    DB::table('assembly_points')->where('node_id', $node)->update(['capacity' => $n]);
}

function safeAt(int $alertId, string $node, int $people): void
{
    for ($i = 0; $i < $people; $i++) {
        DB::table('evacuation_logs')->insert(['user_id' => officerUser(Role::Student)->id, 'alert_id' => $alertId, 'status' => 'safe', 'assembly_node_id' => $node, 'checked_in_at' => now()]);
    }
}

it('names the Field "Open ground" and counts people against capacity', function () {
    capacity(FIELD, 2);
    safeAt($this->alert->id, FIELD, 2);
    safeAt($this->alert->id, OUTSIDE, 1);

    expect(SafeZones::forAlert($this->alert->id))->toBe([
        ['node_id' => FIELD, 'name' => 'Open ground', 'count' => 2, 'capacity' => 2, 'full' => true],
        ['node_id' => OUTSIDE, 'name' => 'Off-campus assembly area', 'count' => 1, 'capacity' => null, 'full' => false],
    ]);
});

it('treats capacity 0 as full and a blank capacity as no limit', function () {
    capacity(FIELD, 0);
    $zones = collect(SafeZones::forAlert($this->alert->id))->keyBy('node_id');

    expect($zones[FIELD]['full'])->toBeTrue()->and($zones[OUTSIDE]['full'])->toBeFalse();
});

it('suggests another zone with space', function () {
    capacity(FIELD, 1);
    safeAt($this->alert->id, FIELD, 1);

    expect(SafeZones::suggest($this->alert->id, FIELD)['name'] ?? null)->toBe('Off-campus assembly area');
    capacity(OUTSIDE, 0);
    expect(SafeZones::suggest($this->alert->id, FIELD))->toBeNull();
});

it('keeps an admin-set capacity when the campus is seeded again', function () {
    capacity(FIELD, 300);
    $this->seed(CampusSeeder::class);

    expect(DB::table('assembly_points')->where('node_id', FIELD)->value('capacity'))->toBe(300);
});

it('tells routing when a zone is full, without changing the map on every check-in', function () {
    capacity(FIELD, 300);
    safeAt($this->alert->id, FIELD, 1);
    Sanctum::actingAs(officerUser(Role::Student));

    $node = collect($this->getJson('/api/campus-snapshot')->assertOk()->json('nodes'))->firstWhere('id', FIELD);
    expect($node)->capacity->toBe(300)->occupancy->toBe(0); // not full: the 1 MB map must not change on every check-in

    safeAt($this->alert->id, FIELD, 299);
    $node = collect($this->getJson('/api/campus-snapshot')->assertOk()->json('nodes'))->firstWhere('id', FIELD);
    expect($node)->occupancy->toBe(300); // full: routing now avoids it
});

it('lets an admin set capacity on the Safe zones page, and logs it', function () {
    $this->actingAs(officerUser(Role::Admin), 'admin');

    Livewire::test(SafeZonesPage::class)
        ->assertSee('Open ground')
        ->set('capacities.AP_Field', '300')
        ->call('save')
        ->assertHasNoErrors();

    expect(DB::table('assembly_points')->where('node_id', FIELD)->value('capacity'))->toBe(300)
        ->and(DB::table('user_activity_logs')->where('activity_type', 'safe_zone_capacity')->exists())->toBeTrue();
});

it('keeps the Safe zones page for admins only', function () {
    $this->actingAs(officerUser(), 'admin')->get(SafeZonesPage::getUrl())->assertForbidden();
});

it('shows capacity and full on the officer safety board', function () {
    capacity(FIELD, 1);
    safeAt($this->alert->id, FIELD, 1);
    Sanctum::actingAs(officerUser());

    $this->getJson('/api/officer/safety')->assertOk()
        ->assertJsonPath('occupancy.0', ['node_id' => FIELD, 'name' => 'Open ground', 'count' => 1, 'capacity' => 1, 'full' => true]);
});
