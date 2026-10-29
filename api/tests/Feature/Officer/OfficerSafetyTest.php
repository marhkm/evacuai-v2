<?php

use App\Enums\Role;
use App\Models\Alert;
use App\Models\SosAlert;
use App\Support\DrillStats;
use Database\Seeders\CampusSeeder;
use Database\Seeders\DemoDrillSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Sanctum::actingAs(officerUser());
});

it('matches the drill statistics for the sample drill', function () {
    $this->seed(DemoDrillSeeder::class);
    $drill = Alert::where('external_id', DemoDrillSeeder::EXTERNAL_ID)->sole();
    $s = DrillStats::for($drill);

    $res = $this->getJson("/api/officer/safety?alert={$drill->id}")->assertOk()
        ->assertJsonPath('alert.id', $drill->id)
        ->assertJsonPath('counts.total', $s['people']);
    $statuses = collect($res->json('people'))->countBy('status');
    expect($res->json('counts'))->toBe(['total' => $s['people'], 'safe' => $statuses['safe'] ?? 0, 'unknown' => $statuses['unknown'] ?? 0, 'sos' => $statuses['SOS'] ?? 0])
        ->and($res->json('people'))->toHaveCount($s['people'])
        ->and($res->json('alerts'))->not->toBeEmpty()
        ->and($res->json('occupancy'))->toBeArray();
});

it('puts people with an open SOS first, marked SOS', function () {
    $alert = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Fire', 'status' => 'active', 'issued_at' => now()]);
    $calm = officerUser(Role::Student);
    $calm->forceFill(['name' => 'Aaron Calm'])->save();
    $trapped = officerUser(Role::Student);
    $trapped->forceFill(['name' => 'Zed Trapped', 'phone' => '09171234567'])->save();
    SosAlert::create(['user_id' => $trapped->id, 'alert_id' => $alert->id, 'status' => 'pending']);

    $this->getJson('/api/officer/safety')->assertOk() // defaults to the active alert
        ->assertJsonPath('alert.id', $alert->id)
        ->assertJsonPath('people.0.name', 'Zed Trapped')
        ->assertJsonPath('people.0.status', 'SOS')
        ->assertJsonPath('people.0.phone', '09171234567')
        ->assertJsonPath('people.1.status', 'unknown');
});

it('lists feedback with the average rating', function () {
    $u = officerUser(Role::Student);
    DB::table('feedback')->insert([
        ['user_id' => $u->id, 'rating' => 5, 'comments' => 'Clear', 'created_at' => now(), 'updated_at' => now()],
        ['user_id' => $u->id, 'rating' => 2, 'comments' => null, 'created_at' => now(), 'updated_at' => now()],
    ]);

    $this->getJson('/api/officer/feedback')->assertOk()
        ->assertJson(['average' => 3.5, 'count' => 2])->assertJsonCount(2, 'items');
});

it('counts needing help as SOS, and the counters match the list', function () {
    $alert = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Fire', 'status' => 'active', 'issued_at' => now()]);
    [$sos, $help, $both, $safe, $unknown] = [officerUser(Role::Student), officerUser(Role::Student), officerUser(Role::Student), officerUser(Role::Student), officerUser(Role::Student)];
    SosAlert::create(['user_id' => $sos->id, 'alert_id' => $alert->id, 'status' => 'pending']);
    SosAlert::create(['user_id' => $both->id, 'alert_id' => $alert->id, 'status' => 'acknowledged']);
    SosAlert::create(['user_id' => officerUser()->id, 'status' => 'pending']); // an officer is not on the board
    foreach ([[$help, 'needs_help'], [$both, 'needs_help'], [$safe, 'safe']] as [$person, $status]) {
        DB::table('evacuation_logs')->insert(['user_id' => $person->id, 'alert_id' => $alert->id, 'status' => $status, 'checked_in_at' => now()]);
    }

    $res = $this->getJson('/api/officer/safety')->assertOk();

    expect($res->json('counts'))->toBe(['total' => 5, 'safe' => 1, 'unknown' => 1, 'sos' => 3])
        ->and(collect($res->json('people'))->countBy('status')->all())->toEqualCanonicalizing(['SOS' => 3, 'safe' => 1, 'unknown' => 1]);
});
