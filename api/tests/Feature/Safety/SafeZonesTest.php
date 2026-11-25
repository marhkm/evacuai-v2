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
const SPRING = 'A1/1/AP_NaturesSpring';
const OLD_GROUND = 'OLD/1/AP_OpenGround1';

beforeEach(function () {
    $this->seed(CampusSeeder::class); // the real campus: Nature's Spring and the two open grounds
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

it('names each safe zone so people know which one they are at, and counts people against capacity', function () {
    capacity(FIELD, 2);
    safeAt($this->alert->id, FIELD, 2);
    safeAt($this->alert->id, SPRING, 1);

    $zones = collect(SafeZones::forAlert($this->alert->id))->keyBy('node_id');
    expect($zones)->toHaveCount(3)
        ->and($zones[SPRING])->toBe(['node_id' => SPRING, 'name' => "Nature's Spring (off campus)", 'count' => 1, 'capacity' => null, 'full' => false])
        ->and($zones[OLD_GROUND]['name'])->toBe('Open Ground 1 · Old Building')
        ->and($zones[FIELD])->toBe(['node_id' => FIELD, 'name' => 'Open Ground 2 · Basic Ed', 'count' => 2, 'capacity' => 2, 'full' => true]);
});

it('knows where the Nature Spring site is, so phones can check people in there by GPS', function () {
    expect(DB::table('assembly_points')->where('node_id', SPRING)->first())
        ->lat->toEqual(10.326639)->lng->toEqual(123.952111);
});

it('treats capacity 0 as full and a blank capacity as no limit', function () {
    capacity(FIELD, 0);
    $zones = collect(SafeZones::forAlert($this->alert->id))->keyBy('node_id');

    expect($zones[FIELD]['full'])->toBeTrue()->and($zones[SPRING]['full'])->toBeFalse();
});

it('suggests another zone with space', function () {
    capacity(FIELD, 1);
    safeAt($this->alert->id, FIELD, 1);

    expect(SafeZones::suggest($this->alert->id, FIELD)['name'] ?? null)->not->toBeNull();
    capacity(SPRING, 0);
    capacity(OLD_GROUND, 0);
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
        ->assertSee('Open Ground 1 · Old Building')->assertSee('Open Ground 2 · Basic Ed')->assertSee('Spring (off campus)')
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

    $zones = collect($this->getJson('/api/officer/safety')->assertOk()->json('occupancy'))->keyBy('node_id');
    expect($zones[FIELD])->toBe(['node_id' => FIELD, 'name' => 'Open Ground 2 · Basic Ed', 'count' => 1, 'capacity' => 1, 'full' => true]);
});
