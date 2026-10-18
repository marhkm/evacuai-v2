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
        ->assertJsonPath('counts.safe', $s['safe'])
        ->assertJsonPath('counts.needs_help', $s['needs_help'])
        ->assertJsonPath('counts.unknown', $s['unknown']);
    expect($res->json('people'))->toHaveCount($s['people'])
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
