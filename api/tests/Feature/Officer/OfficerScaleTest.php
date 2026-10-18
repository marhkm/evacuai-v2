<?php

use App\Enums\Role;
use App\Models\Alert;
use App\Models\EvacuationLog;
use App\Models\HazardReport;
use App\Models\SosAlert;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Notification::fake();
});

/** Queries run by one request (the officer's own auth lookups included). */
function queriesFor(callable $request): int
{
    DB::flushQueryLog();
    DB::enableQueryLog();
    $request();
    $n = count(DB::getQueryLog());
    DB::disableQueryLog();

    return $n;
}

it('lists many reports with a fixed number of queries, paginated', function () {
    $rooms = DB::table('rooms')->where('building_id', 'DEMO')->pluck('id');
    foreach (range(1, 60) as $i) {
        HazardReport::create(['reported_by' => officerUser(Role::Student)->id, 'building_id' => 'DEMO', 'level' => 1,
            'room_id' => $rooms[$i % $rooms->count()], 'hazard_type' => $i % 2 ? 'fire' : 'flood']);
    }
    Sanctum::actingAs(officerUser());

    $n = queriesFor(fn () => $this->getJson('/api/officer/reports')->assertOk()
        ->assertJsonCount(50, 'reports')->assertJsonPath('meta.total', 60)->assertJsonPath('meta.last_page', 2)
        ->assertJsonPath('reports.0.matching', 30));
    expect($n)->toBeLessThan(15);
    $this->getJson('/api/officer/reports?page=2')->assertOk()->assertJsonCount(10, 'reports');
});

it('lists many SOS with a fixed number of queries, paginated', function () {
    $nodes = DB::table('evac_nodes')->where('type', 'room')->pluck('id');
    foreach (range(1, 60) as $i) {
        SosAlert::create(['user_id' => officerUser(Role::Student)->id, 'node_id' => $nodes[$i % $nodes->count()], 'building_id' => 'DEMO', 'level' => 1, 'status' => 'resolved']);
    }
    Sanctum::actingAs(officerUser());

    $n = queriesFor(fn () => $this->getJson('/api/officer/sos')->assertOk()->assertJsonCount(50, 'sos')->assertJsonPath('meta.total', 60));
    expect($n)->toBeLessThan(15);
    $this->getJson('/api/officer/sos?page=2')->assertOk()->assertJsonCount(10, 'sos');
});

it('builds the safety board for many people with a fixed number of queries', function () {
    $alert = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Fire', 'status' => 'active', 'issued_at' => now()]);
    $nodes = DB::table('evac_nodes')->pluck('id');
    $assembly = DB::table('assembly_points')->value('node_id');
    foreach (range(1, 60) as $i) {
        $u = officerUser(Role::Student);
        DB::table('location_events')->insert(['user_id' => $u->id, 'alert_id' => $alert->id, 'node_id' => $nodes[$i % $nodes->count()],
            'source' => 'manual', 'confidence' => 'exact', 'created_at' => now()]);
        if ($i % 3 === 0) {
            EvacuationLog::create(['user_id' => $u->id, 'alert_id' => $alert->id, 'status' => 'safe', 'assembly_node_id' => $assembly, 'checked_in_at' => now()]);
        }
    }
    Sanctum::actingAs(officerUser());

    $n = queriesFor(fn () => $this->getJson('/api/officer/safety')->assertOk()->assertJsonCount(60, 'people'));
    expect($n)->toBeLessThan(25);
});
