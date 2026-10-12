<?php

use App\Enums\Role;
use App\Filament\Pages\QrStickers;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    DB::table('evac_nodes')->where('id', 'DEMO/1/X1')->update(['qr_id' => 'AB12CD34']);
});

it('renders a printable sticker per QR node with a readable label', function () {
    $this->actingAs(User::forceCreate(['name' => 'A', 'email' => 'a@example.test', 'role' => Role::SafetyOfficer, 'email_verified_at' => now()]));
    Livewire::test(QrStickers::class)
        ->assertOk()
        ->assertSee('AB12CD34')
        ->assertSee('Demo Building · Ground · X1')
        ->assertSeeHtml('data:image/svg+xml;base64,');
});

it('generates a QR that encodes the evacuai://q/ deep link', function () {
    expect(QrStickers::payload('AB12CD34'))->toBe('evacuai://q/AB12CD34');
});

it('is not available to students', function () {
    $this->actingAs(User::forceCreate(['name' => 'S', 'email' => 's@example.test', 'email_verified_at' => now()]));
    $this->get(QrStickers::getUrl())->assertForbidden();
});
