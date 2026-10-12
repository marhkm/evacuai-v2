<?php

use App\Enums\Role;
use App\Filament\Pages\Campus3d;
use App\Models\Alert;
use App\Models\EvacEdge;
use App\Models\SosAlert;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Event::fake();
    $this->officer = User::forceCreate(['name' => 'Officer', 'email' => 'so@example.test', 'role' => Role::SafetyOfficer, 'email_verified_at' => now()]);
});

/** Drill at 08:00: Ana seen in R201 then checks in safe at +4 min; Ben last seen in R201 (via its node), Cy in R101; Ben sends SOS. */
function drillWithPeople(): Alert
{
    $alert = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Drill', 'is_drill' => true, 'issued_at' => now()->setTime(8, 0)]);
    $at = fn (int $s) => $alert->issued_at->copy()->addSeconds($s);
    [$ana, $ben, $cy] = collect(['Ana', 'Ben', 'Cy'])->map(fn ($n) => User::forceCreate(['name' => $n, 'email' => strtolower($n).'@example.test']))->all();
    DB::table('location_events')->insert([
        ['user_id' => $ana->id, 'alert_id' => $alert->id, 'room_id' => 'DEMO/2/R201', 'node_id' => null, 'source' => 'schedule', 'confidence' => 'likely', 'created_at' => $at(30)],
        ['user_id' => $ben->id, 'alert_id' => $alert->id, 'room_id' => null, 'node_id' => 'DEMO/2/R201', 'source' => 'qr', 'confidence' => 'exact', 'created_at' => $at(60)],
        ['user_id' => $cy->id, 'alert_id' => $alert->id, 'room_id' => 'DEMO/1/R101', 'node_id' => null, 'source' => 'manual', 'confidence' => 'exact', 'created_at' => $at(90)],
    ]);
    DB::table('evacuation_logs')->insert(['user_id' => $ana->id, 'alert_id' => $alert->id, 'status' => 'safe', 'assembly_node_id' => 'DEMO/1/AP', 'checked_in_at' => $at(240)]);
    SosAlert::create(['user_id' => $ben->id, 'alert_id' => $alert->id, 'node_id' => 'DEMO/2/S2', 'building_id' => 'DEMO', 'level' => 2]);

    return $alert;
}

it('is for officers only', function () {
    $student = User::forceCreate(['name' => 'S', 'email' => 's@example.test']);
    $this->get(route('campus3d.live'))->assertForbidden();
    $this->actingAs($student)->get(route('campus3d.snapshot'))->assertForbidden();
    $this->actingAs($this->officer)->get(Campus3d::getUrl())->assertOk()->assertSee('js/campus-3d.js');
});

it('serves the live overlay: blocked paths, people still inside per room, SOS and check-in pins', function () {
    drillWithPeople();
    EvacEdge::findOrFail('DEMO/1/C1->DEMO/1/C2')->update(['status' => 'blocked']);

    $this->actingAs($this->officer)->getJson(route('campus3d.live'))
        ->assertOk()
        ->assertJsonPath('alert.active', true)
        ->assertJsonPath('edges', ['DEMO/1/C1->DEMO/1/C2' => 'blocked'])
        ->assertJsonCount(2, 'roomCounts')
        ->assertJsonPath('roomCounts.DEMO/1/R101', 1)
        ->assertJsonPath('roomCounts.DEMO/2/R201', 1) // Ben only: Ana checked in safe, so she is not counted
        ->assertJsonPath('pins.0.kind', 'sos')
        ->assertJsonPath('pins.0.nodeId', 'DEMO/2/S2')
        ->assertJsonPath('pins.1', ['id' => 'checkin-DEMO/1/AP', 'nodeId' => 'DEMO/1/AP', 'kind' => 'checkin', 'label' => '1 checked in safe']);
});

it('serves an anonymous drill replay timeline', function () {
    $alert = drillWithPeople();

    $json = $this->actingAs($this->officer)->getJson(route('campus3d.replay', ['alert' => $alert->id]))->assertOk()->json();

    expect($json['duration'])->toBe(240)
        ->and($json['events'])->toBe([['t' => 30, 'p' => 1, 'room' => 'DEMO/2/R201'], ['t' => 60, 'p' => 2, 'room' => 'DEMO/2/R201'], ['t' => 90, 'p' => 3, 'room' => 'DEMO/1/R101']])
        ->and($json['checkins'])->toBe([['t' => 240, 'p' => 1, 'node' => 'DEMO/1/AP']])
        ->and(json_encode($json))->not->toContain('Ana');
});
