<?php

use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
});

function actAsStudent(): void
{
    Sanctum::actingAs(User::forceCreate(['name' => 'S', 'email' => 's@example.test', 'email_verified_at' => now()]));
}

it('requires authentication', function () {
    $this->getJson('/api/campus-snapshot')->assertUnauthorized();
});

it('returns the CampusSnapshot contract with real numbers', function () {
    actAsStudent();
    $res = $this->getJson('/api/campus-snapshot')->assertOk();

    $res->assertJsonStructure([
        'name', 'hazardRoomIds',
        'buildings' => [['id', 'name', 'origin', 'rotation_deg', 'footprint', 'floors' => [['level', 'name', 'elevation_m', 'height_m']]]],
        'rooms' => [['id', 'building', 'level', 'name', 'type', 'polygon']],
        'nodes' => [['id', 'building', 'level', 'type', 'x', 'y', 'safe_for']],
        'edges' => [['id', 'from', 'to', 'type', 'distance_m', 'bidirectional', 'flags', 'status']],
        'assemblyPoints' => [['id', 'node_id', 'lat', 'lng', 'radius_m']],
        'weights' => ['congested', 'fullAssemblyPenalty_m', 'flags', 'blockFlags'],
    ]);
    expect($res->json('name'))->toBe('Demo Campus')
        ->and($res->json('nodes'))->toHaveCount(12)
        ->and($res->json('edges'))->toHaveCount(12)
        ->and($res->json('hazardRoomIds'))->toBe([]);

    $stair = collect($res->json('edges'))->firstWhere('id', 'DEMO/2/S2->DEMO/1/S1');
    expect($stair['distance_m'])->toBe(7)->and($stair['bidirectional'])->toBeTrue()->and($stair['status'])->toBe('open');
    $x1 = collect($res->json('nodes'))->firstWhere('id', 'DEMO/1/X1');
    expect($x1['x'])->toBe(0)->and($x1['safe_for'])->toBe(['earthquake', 'fire']);
    expect(collect($res->json('buildings.0.floors'))->pluck('height_m')->all())->toBe([3.5, 3.5]);
    expect($res->json('weights.blockFlags.fire'))->toBe(['smoke']);
});

it('supports ETag caching and changes the ETag when an edge status changes', function () {
    actAsStudent();
    $etag = $this->getJson('/api/campus-snapshot')->headers->get('ETag');
    expect($etag)->not->toBeEmpty();

    $this->getJson('/api/campus-snapshot', ['If-None-Match' => $etag])->assertStatus(304);

    DB::table('evac_edges')->where('id', 'DEMO/1/C1->DEMO/1/C2')->update(['status' => 'blocked']);
    $res = $this->getJson('/api/campus-snapshot', ['If-None-Match' => $etag])->assertOk();
    expect($res->headers->get('ETag'))->not->toBe($etag)
        ->and(collect($res->json('edges'))->firstWhere('id', 'DEMO/1/C1->DEMO/1/C2')['status'])->toBe('blocked');
});
