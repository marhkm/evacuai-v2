<?php

use App\Enums\Role;
use App\Filament\Pages\BuildingGps;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    $this->actingAs(User::forceCreate(['name' => 'A', 'email' => 'a@example.test', 'role' => Role::Admin, 'email_verified_at' => now()]), 'admin');
});

it('saves corners and refuses fewer than 3 or bad numbers', function () {
    Livewire::test(BuildingGps::class)
        ->set('corners.DEMO', "10.3268, 123.9498\n10.3268, 123.9502\n10.3272, 123.9502\n10.3272, 123.9498")
        ->call('save')->assertHasNoErrors();
    expect(json_decode(DB::table('buildings')->where('id', 'DEMO')->value('gps_corners'), true))->toHaveCount(4)
        ->and(DB::table('user_activity_logs')->where('activity_type', 'building_gps_changed')->exists())->toBeTrue();

    Livewire::test(BuildingGps::class)->set('corners.DEMO', "10.3268, 123.9498\n10.3268, 123.9502")->call('save')->assertHasErrors('corners.DEMO');
    Livewire::test(BuildingGps::class)->set('corners.DEMO', "10.3268, 123.9498\n10.3268, 200\n10.3272, 123.9502")->call('save')->assertHasErrors('corners.DEMO');
    Livewire::test(BuildingGps::class)->set('corners.DEMO', '')->call('save')->assertHasNoErrors(); // empty clears it
    expect(DB::table('buildings')->where('id', 'DEMO')->value('gps_corners'))->toBeNull();
});

it('keeps the corners when the campus is seeded again', function () {
    DB::table('buildings')->where('id', 'DEMO')->update(['gps_corners' => json_encode([[1, 2], [3, 4], [5, 6]])]);
    $this->seed(CampusSeeder::class);
    expect(DB::table('buildings')->where('id', 'DEMO')->value('gps_corners'))->not->toBeNull();
});
