<?php

use App\Enums\Role;
use App\Events\SosUpdated;
use App\Models\SosAlert;
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
    $this->student = officerUser(Role::Student);
    $this->student->forceFill(['name' => 'Juan Cruz'])->save();
    $this->sos = SosAlert::create(['user_id' => $this->student->id, 'building_id' => 'DEMO', 'level' => 1, 'message' => 'Trapped near the stairs', 'status' => 'pending']);
    Sanctum::actingAs($this->officer);
});

it('lists open SOS and shows one with its messages', function () {
    SosAlert::create(['user_id' => $this->student->id, 'status' => 'resolved']);
    $this->sos->messages()->create(['sender_id' => $this->student->id, 'body' => 'Please hurry']);

    $this->getJson('/api/officer/sos?open=1')->assertOk()->assertJsonCount(1, 'sos')
        ->assertJsonPath('sos.0.person', 'Juan Cruz')->assertJsonPath('sos.0.message', 'Trapped near the stairs');
    $this->getJson('/api/officer/sos')->assertOk()->assertJsonCount(2, 'sos');
    $this->getJson("/api/officer/sos/{$this->sos->id}")->assertOk()
        ->assertJsonPath('sos.person', 'Juan Cruz')
        ->assertJsonPath('sos.messages.0.body', 'Please hurry')
        ->assertJsonPath('sos.messages.0.mine', false);
});

it('acknowledges and resolves, rejecting actions that do not fit', function () {
    $this->postJson("/api/officer/sos/{$this->sos->id}/acknowledge")->assertOk()->assertJsonPath('sos.status', 'acknowledged');
    expect($this->sos->fresh()->acknowledged_by)->toBe($this->officer->id)
        ->and(DB::table('user_activity_logs')->where('activity_type', 'sos_acknowledged')->exists())->toBeTrue();
    $this->postJson("/api/officer/sos/{$this->sos->id}/acknowledge")->assertUnprocessable();

    $this->postJson("/api/officer/sos/{$this->sos->id}/resolve")->assertOk()->assertJsonPath('sos.status', 'resolved');
    $this->postJson("/api/officer/sos/{$this->sos->id}/resolve")->assertUnprocessable();
    $this->postJson("/api/officer/sos/{$this->sos->id}/messages", ['body' => 'Hello?'])->assertUnprocessable();
});

it('chats on an open SOS and tells listeners', function () {
    Event::fake([SosUpdated::class]);

    $this->postJson("/api/officer/sos/{$this->sos->id}/messages", ['body' => 'Stay put, we are coming.'])->assertCreated()
        ->assertJsonPath('sos.messages.0.mine', true);
    expect($this->sos->messages()->sole()->sender_id)->toBe($this->officer->id);
    Event::assertDispatched(SosUpdated::class);
    $this->postJson("/api/officer/sos/{$this->sos->id}/messages", ['body' => ''])->assertUnprocessable();
});
