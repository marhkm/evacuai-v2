<?php

use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(fn () => config(['evacuai.campus_dataset' => 'demo']));

it('imports the campus snapshot', function () {
    $this->seed(CampusSeeder::class);

    expect(DB::table('evac_nodes')->count())->toBe(12)
        ->and(DB::table('evac_edges')->count())->toBe(12)
        ->and(DB::table('floors')->where('building_id', 'DEMO')->count())->toBe(2)
        ->and((float) DB::table('evac_edges')->where('id', 'DEMO/2/S2->DEMO/1/S1')->value('distance_m'))->toBe(7.0)
        ->and(json_decode(DB::table('evac_nodes')->where('id', 'DEMO/1/X1')->value('safe_for')))->toBe(['earthquake', 'fire'])
        ->and(DB::table('assembly_points')->where('id', 'AP')->value('node_id'))->toBe('DEMO/1/AP');
});

it('re-seeds idempotently and keeps live edge status', function () {
    $this->seed(CampusSeeder::class);
    DB::table('evac_edges')->where('id', 'DEMO/1/C1->DEMO/1/C2')->update(['status' => 'blocked']);

    $this->seed(CampusSeeder::class);

    expect(DB::table('evac_edges')->count())->toBe(12)
        ->and(DB::table('evac_edges')->where('id', 'DEMO/1/C1->DEMO/1/C2')->value('status'))->toBe('blocked');
});

it('removes safe zones, points and paths that left the campus data', function () {
    $this->seed(CampusSeeder::class);
    DB::table('evac_nodes')->insert(['id' => 'DEMO/1/OLD_AP', 'building_id' => 'DEMO', 'level' => 1, 'type' => 'assembly_point', 'x' => 1, 'y' => 1, 'safe_for' => '["fire"]']);
    DB::table('evac_edges')->insert(['id' => 'DEMO/1/X1->DEMO/1/OLD_AP', 'from_node_id' => 'DEMO/1/X1', 'to_node_id' => 'DEMO/1/OLD_AP', 'type' => 'outdoor', 'distance_m' => 5, 'bidirectional' => false, 'flags' => '[]']);
    DB::table('assembly_points')->insert(['id' => 'OLD_AP', 'node_id' => 'DEMO/1/OLD_AP', 'radius_m' => 25]);

    $this->seed(CampusSeeder::class); // the next deploy: the old safe zone is gone from the data

    expect(DB::table('evac_nodes')->where('id', 'DEMO/1/OLD_AP')->exists())->toBeFalse()
        ->and(DB::table('evac_edges')->where('id', 'DEMO/1/X1->DEMO/1/OLD_AP')->exists())->toBeFalse()
        ->and(DB::table('assembly_points')->where('id', 'OLD_AP')->exists())->toBeFalse()
        ->and(DB::table('evac_nodes')->count())->toBe(12);
});
