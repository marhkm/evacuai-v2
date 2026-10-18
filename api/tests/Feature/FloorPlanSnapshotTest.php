<?php

use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'uclm']);
    $this->seed(CampusSeeder::class);
});

it('stores the poster floor plans for Annex 1 only', function () {
    $a1 = DB::table('floors')->where(['building_id' => 'A1', 'level' => 1])->value('plan');
    expect(json_decode((string) $a1, true)['walls'])->not->toBeEmpty()
        ->and(DB::table('floors')->where(['building_id' => 'BE', 'level' => 1])->value('plan'))->toBeNull()
        ->and(DB::table('floors')->where('building_id', 'A1')->pluck('level')->all())->toBe([1, 2, 3, 4, 6, 7]);
});

it('serves floor plans in the campus snapshot, within the size budget', function () {
    Sanctum::actingAs(User::forceCreate(['name' => 'S', 'email' => 's@example.test', 'email_verified_at' => now()]));

    $res = $this->getJson('/api/campus-snapshot')->assertOk();
    $buildings = collect($res->json('buildings'))->keyBy('id');

    expect($buildings['A1']['floors'][0]['plan']['walls'])->not->toBeEmpty()
        ->and($buildings['A1']['floors'][0]['plan']['labels'])->not->toBeEmpty()
        ->and($buildings['BE']['floors'][0])->not->toHaveKey('plan')
        ->and(strlen($res->getContent()))->toBeLessThan(1_500_000);
});
