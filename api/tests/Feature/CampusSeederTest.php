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
