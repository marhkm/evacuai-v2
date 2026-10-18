<?php

use App\Events\CampusChanged;
use App\Models\EvacEdge;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    $this->officer = officerUser();
    Sanctum::actingAs($this->officer);
});

it('lists paths filtered by building and floor', function () {
    $level2 = DB::table('evac_edges')->join('evac_nodes', 'evac_nodes.id', '=', 'evac_edges.from_node_id')
        ->where(['evac_nodes.building_id' => 'DEMO', 'evac_nodes.level' => 2])->count();

    $all = $this->getJson('/api/officer/paths')->assertOk()->json('paths');
    expect($all)->toHaveCount(EvacEdge::count());
    $this->getJson('/api/officer/paths?building=DEMO&level=2')->assertOk()
        ->assertJsonCount($level2, 'paths')
        ->assertJsonPath('paths.0.level', 2)
        ->assertJsonStructure(['paths' => [['id', 'type', 'building_id', 'level', 'from', 'to', 'place', 'status', 'updated_by', 'updated_at']]]);
});

it('sets a path status once, recording who changed it', function () {
    Event::fake([CampusChanged::class]);
    $edge = EvacEdge::where('type', 'stairs')->firstOrFail();
    $url = '/api/officer/paths/'.rawurlencode($edge->id);

    $this->patchJson($url, ['status' => 'blocked'])->assertOk()
        ->assertJsonPath('path.status', 'blocked')->assertJsonPath('path.updated_by', $this->officer->name);
    $this->patchJson($url, ['status' => 'blocked'])->assertOk();

    expect($edge->fresh()->updated_by)->toBe($this->officer->id);
    Event::assertDispatchedTimes(CampusChanged::class, 1);
    expect(DB::table('user_activity_logs')->where('activity_type', 'path_status_changed')->count())->toBe(1);
});

it('rejects an unknown status', function () {
    $edge = EvacEdge::firstOrFail();
    $this->patchJson('/api/officer/paths/'.rawurlencode($edge->id), ['status' => 'closed'])
        ->assertUnprocessable()->assertJsonValidationErrors('status');
});
