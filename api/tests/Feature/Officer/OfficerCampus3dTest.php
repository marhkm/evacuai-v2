<?php

use App\Models\Alert;
use Database\Seeders\CampusSeeder;
use Database\Seeders\DemoDrillSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    $this->officer = officerUser(); // the sample drill needs an officer to exist
    $this->seed(DemoDrillSeeder::class);
    $this->drill = Alert::where('external_id', DemoDrillSeeder::EXTERNAL_ID)->sole();
});

it('serves the same live overlay as the admin 3D page', function () {
    $web = $this->actingAs($this->officer, 'web')->getJson(route('campus3d.live', ['alert' => $this->drill->id]))->assertOk()->json();
    Sanctum::actingAs($this->officer);

    $api = $this->getJson("/api/officer/live?alert={$this->drill->id}")->assertOk()->json();
    expect($api)->toEqual($web)->and($api['alert']['id'])->toBe($this->drill->id);
});

it('serves the replay of an alert, and needs the alert', function () {
    Sanctum::actingAs($this->officer);

    $this->getJson("/api/officer/replay?alert={$this->drill->id}")->assertOk()
        ->assertJsonPath('alert.id', $this->drill->id)
        ->assertJsonStructure(['duration', 'events', 'checkins']);
    $this->getJson('/api/officer/replay')->assertUnprocessable()->assertJsonValidationErrors('alert');
});
