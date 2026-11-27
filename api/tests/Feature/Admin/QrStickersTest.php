<?php

use App\Enums\Role;
use App\Filament\Pages\QrStickers;
use App\Models\User;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
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
    $this->actingAs(User::forceCreate(['name' => 'A', 'email' => 'a@example.test', 'role' => Role::SafetyOfficer, 'email_verified_at' => now()]), 'admin');
    Livewire::test(QrStickers::class)
        ->assertOk()
        ->assertSee('AB12CD34')
        ->assertSee('Demo Building · Ground · X1')
        ->assertSeeHtml('data:image/svg+xml;base64,');
});

it('loads the real campus sticker sheet for every building', function () {
    config(['evacuai.campus_dataset' => 'uclm']);
    DB::table('evac_nodes')->delete();
    $this->seed(CampusSeeder::class);
    $this->actingAs(User::forceCreate(['name' => 'A', 'email' => 'a@example.test', 'role' => Role::Admin, 'email_verified_at' => now()]), 'admin');

    // The last sticker on the full sheet must encode only its own deep link, not every payload before it.
    $last = DB::table('evac_nodes')->whereNotNull('qr_id')->orderByDesc('building_id')->orderByDesc('level')->orderByDesc('id')->first();
    $fresh = (new QRCode(new QROptions(['eccLevel' => QRCode::ECC_M, 'scale' => 6])))->render(QrStickers::payload($last->qr_id));
    $this->get(QrStickers::getUrl(['building' => 'all']))->assertOk()->assertSee($fresh, false);
    $this->get(QrStickers::getUrl())->assertOk()->assertSee(DB::table('buildings')->orderBy('id')->value('name'))->assertDontSee($last->qr_id); // defaults to the first building

    $room = DB::table('evac_nodes')->join('rooms', 'rooms.id', '=', 'evac_nodes.room_id')
        ->whereNotNull('evac_nodes.qr_id')->whereNull('evac_nodes.name')->whereNotNull('rooms.name')->value('rooms.name');
    expect($room)->not->toBeNull();
    $this->get(QrStickers::getUrl(['building' => 'all']))->assertSee($room);

    foreach (DB::table('evac_nodes')->whereNotNull('qr_id')->distinct()->pluck('building_id') as $building) {
        $qr = DB::table('evac_nodes')->where('building_id', $building)->whereNotNull('qr_id')->value('qr_id');
        $this->get(QrStickers::getUrl(['building' => $building]))->assertOk()->assertSee($qr);
        Livewire::test(QrStickers::class)->set('building', $building)->assertOk()->assertSee($qr);
    }
});

it('generates a QR that encodes the evacuai://q/ deep link', function () {
    expect(QrStickers::payload('AB12CD34'))->toBe('evacuai://q/AB12CD34');
});

it('is not available to students', function () {
    $this->actingAs(User::forceCreate(['name' => 'S', 'email' => 's@example.test', 'email_verified_at' => now()]), 'admin');
    $this->get(QrStickers::getUrl())->assertForbidden();
});
