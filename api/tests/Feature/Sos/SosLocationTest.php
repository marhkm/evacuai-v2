<?php

use App\Enums\Role;
use App\Models\SosAlert;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Notification::fake();
    Event::fake();
    // A square of about 44 m around (10.3270, 123.9500).
    DB::table('buildings')->where('id', 'DEMO')->update(['gps_corners' => json_encode([[10.3268, 123.9498], [10.3268, 123.9502], [10.3272, 123.9502], [10.3272, 123.9498]])]);
    $this->student = User::forceCreate(['name' => 'Stu', 'email' => 'stu@example.test', 'role' => Role::Student, 'email_verified_at' => now()]);
    Sanctum::actingAs($this->student);
    $this->travelTo(Carbon::parse('2026-10-14 08:45', 'Asia/Manila')); // Wednesday
});

function inClass(User $u): void
{
    DB::table('schedules')->insert(['user_id' => $u->id, 'subject' => 'IT 101', 'room_id' => 'DEMO/2/R201', 'days' => 'MWF', 'time_start' => '08:00', 'time_end' => '09:30']);
}

it('uses the class in session when the student sends no exact place', function () {
    inClass($this->student);
    $this->postJson('/api/sos', ['building_id' => 'DEMO', 'level' => 1, 'location_source' => 'estimate'])->assertCreated()
        ->assertJsonPath('sos.location_source', 'schedule')->assertJsonPath('sos.room_id', 'DEMO/2/R201');
});

it('keeps a scanned or picked place over the class', function () {
    inClass($this->student);
    $this->postJson('/api/sos', ['room_id' => 'DEMO/1/R101', 'location_source' => 'manual'])->assertCreated()
        ->assertJsonPath('sos.location_source', 'manual')->assertJsonPath('sos.room_id', 'DEMO/1/R101');
});

it('sends an approximate last known place, even building and floor only', function () {
    $this->postJson('/api/sos', ['building_id' => 'DEMO', 'level' => 2, 'location_source' => 'estimate'])->assertCreated()
        ->assertJsonPath('sos.location_source', 'estimate');
    expect(SosAlert::first())->building_id->toBe('DEMO')->level->toBe(2);
});

it('sets the building from GPS when there is no class', function () {
    $id = $this->postJson('/api/sos', [])->assertCreated()->json('sos.id');

    $this->patchJson("/api/sos/{$id}/location", ['lat' => 10.3270, 'lng' => 123.9500, 'accuracy' => 15])->assertOk()
        ->assertJsonPath('sos.location_source', 'gps');
    expect(SosAlert::find($id))->building_id->toBe('DEMO')->level->toBeNull()
        ->and(Schema::hasColumn('sos_alerts', 'lat') || Schema::hasColumn('sos_alerts', 'latitude'))->toBeFalse();
});

it('ignores GPS worse than 40 m, outside every building, or when a better place is known', function () {
    $id = $this->postJson('/api/sos', [])->json('sos.id');
    $this->patchJson("/api/sos/{$id}/location", ['lat' => 10.3270, 'lng' => 123.9500, 'accuracy' => 60])->assertOk();
    $this->patchJson("/api/sos/{$id}/location", ['lat' => 10.3300, 'lng' => 123.9500, 'accuracy' => 10])->assertOk();
    expect(SosAlert::find($id))->building_id->toBeNull()->location_source->toBeNull();

    $this->patchJson("/api/sos/{$id}/location", ['room_id' => 'DEMO/1/R101', 'location_source' => 'qr'])->assertOk();
    $this->patchJson("/api/sos/{$id}/location", ['lat' => 10.3270, 'lng' => 123.9500, 'accuracy' => 10])->assertOk()
        ->assertJsonPath('sos.location_source', 'qr')->assertJsonPath('sos.room_id', 'DEMO/1/R101');
});

it('sends the SOS with no location at all', function () {
    $this->postJson('/api/sos', [])->assertCreated()->assertJsonPath('sos.place', null);
});

it('does not guess between two buildings when the GPS circle reaches both', function () {
    // A second building 11 m north of DEMO's north edge (10.3272).
    DB::table('buildings')->insert(['id' => 'NEXT', 'name' => 'Next door', 'footprint' => json_encode([]), 'rotation_deg' => 0,
        'gps_corners' => json_encode([[10.3273, 123.9498], [10.3273, 123.9502], [10.3277, 123.9502], [10.3277, 123.9498]]), 'created_at' => now(), 'updated_at' => now()]);
    $id = $this->postJson('/api/sos', [])->json('sos.id');

    // 3 m inside DEMO's north edge, accuracy 35 m: the circle reaches NEXT too.
    $this->patchJson("/api/sos/{$id}/location", ['lat' => 10.32717, 'lng' => 123.9500, 'accuracy' => 35])->assertOk();
    expect(SosAlert::find($id)->building_id)->toBeNull();

    // The same spot with a sharp fix: DEMO.
    $this->patchJson("/api/sos/{$id}/location", ['lat' => 10.32717, 'lng' => 123.9500, 'accuracy' => 5])->assertOk();
    expect(SosAlert::find($id)->building_id)->toBe('DEMO');
});
