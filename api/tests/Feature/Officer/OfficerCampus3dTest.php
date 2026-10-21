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

it('serves the live overlay of an alert for the 3D view', function () {
    Sanctum::actingAs($this->officer);

    $this->getJson("/api/officer/live?alert={$this->drill->id}")->assertOk()
        ->assertJsonPath('alert.id', $this->drill->id)
        ->assertJsonStructure(['alert' => ['id', 'label', 'active'], 'edges', 'hazardRoomIds', 'roomCounts', 'pins']);
});

it('serves the replay of an alert, and needs the alert', function () {
    Sanctum::actingAs($this->officer);

    $this->getJson("/api/officer/replay?alert={$this->drill->id}")->assertOk()
        ->assertJsonPath('alert.id', $this->drill->id)
        ->assertJsonStructure(['duration', 'events', 'checkins']);
    $this->getJson('/api/officer/replay')->assertUnprocessable()->assertJsonValidationErrors('alert');
});
