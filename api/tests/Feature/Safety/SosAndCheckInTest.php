<?php

use App\Enums\Role;
use App\Events\SosUpdated;
use App\Filament\Pages\SafetyMonitor;
use App\Filament\Resources\SosAlerts\Pages\ListSosAlerts;
use App\Filament\Resources\SosAlerts\Pages\SosChat;
use App\Models\Alert;
use App\Models\SosAlert;
use App\Models\User;
use App\Notifications\SosRaised;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Livewire\Livewire;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Event::fake([SosUpdated::class]);
    Notification::fake();
    $this->officer = User::forceCreate(['name' => 'Officer Cruz', 'email' => 'so@example.test', 'role' => Role::SafetyOfficer, 'email_verified_at' => now()]);
    $this->student = User::forceCreate(['name' => 'Juan', 'email' => 'juan@example.test', 'phone' => '09171234567', 'email_verified_at' => now()]);
});

function activeAlert(): Alert
{
    return Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Fire drill', 'issued_at' => now()]);
}

it('sends an SOS with the location, tags the active alert and pages officers', function () {
    $alert = activeAlert();
    Sanctum::actingAs($this->student);

    $this->postJson('/api/sos', ['node_id' => 'DEMO/2/R201', 'message' => 'Trapped, door is jammed'])
        ->assertCreated()
        ->assertJsonPath('sos.status', 'pending')
        ->assertJsonPath('sos.place', 'Demo Building · Second · R201');

    $sos = SosAlert::sole();
    expect($sos->alert_id)->toBe($alert->id)->and($sos->building_id)->toBe('DEMO')->and($sos->level)->toBe(2);
    Notification::assertSentTo($this->officer, SosRaised::class);
    Notification::assertNotSentTo($this->student, SosRaised::class);
    Event::assertDispatched(SosUpdated::class, fn ($e) => $e->broadcastOn()[0]->name === "private-sos.{$sos->id}");
});

it('keeps one open SOS per person and lets them cancel only before an officer responds', function () {
    Sanctum::actingAs($this->student);
    $id = $this->postJson('/api/sos', [])->assertCreated()->json('sos.id');
    $this->postJson('/api/sos', [])->assertOk()->assertJsonPath('sos.id', $id);
    expect(SosAlert::count())->toBe(1);

    $this->postJson("/api/sos/{$id}/cancel")->assertOk()->assertJsonPath('sos.status', 'cancelled');

    $second = $this->postJson('/api/sos', [])->assertCreated()->json('sos.id');
    SosAlert::find($second)->update(['status' => 'acknowledged']);
    $this->postJson("/api/sos/{$second}/cancel")->assertUnprocessable();
});

it('runs a two-way chat between the person and the officer, and nobody else', function () {
    Sanctum::actingAs($this->student);
    $id = $this->postJson('/api/sos', ['node_id' => 'DEMO/1/R101'])->json('sos.id');
    $this->postJson("/api/sos/{$id}/messages", ['body' => 'Smoke is getting thick'])->assertCreated();

    $this->actingAs($this->officer);
    Livewire::test(SosChat::class, ['record' => $id])
        ->assertSee('Smoke is getting thick')
        ->assertSee('Demo Building · Ground · R101')
        ->set('body', 'Stay low, we are coming from Exit 1')
        ->call('send')
        ->assertHasNoErrors();
    $sos = SosAlert::find($id);
    expect($sos->status)->toBe('acknowledged')->and($sos->acknowledged_by)->toBe($this->officer->id); // replying acknowledges

    Sanctum::actingAs($this->student);
    $this->getJson('/api/sos/current')
        ->assertJsonPath('sos.status', 'acknowledged')
        ->assertJsonPath('sos.responder', 'Officer Cruz')
        ->assertJsonPath('sos.messages.0.mine', true)
        ->assertJsonPath('sos.messages.1.body', 'Stay low, we are coming from Exit 1')
        ->assertJsonPath('sos.messages.1.mine', false);

    $stranger = User::forceCreate(['name' => 'Other', 'email' => 'o@example.test', 'email_verified_at' => now()]);
    Sanctum::actingAs($stranger);
    $this->postJson("/api/sos/{$id}/messages", ['body' => 'hi'])->assertNotFound();
    $this->getJson('/api/sos/current')->assertJsonPath('sos', null);
});

it('authorizes the private SOS channel for the sender and officers only', function () {
    $sos = SosAlert::create(['user_id' => $this->student->id]);
    $stranger = User::forceCreate(['name' => 'Other', 'email' => 'o@example.test']);
    config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'k', 'broadcasting.connections.reverb.secret' => 's', 'broadcasting.connections.reverb.app_id' => '1']);
    require base_path('routes/channels.php'); // channels were registered on the boot-time (null) broadcaster
    $auth = fn (User $u) => tap($this, fn () => app('auth')->forgetGuards())->withToken($u->createToken('t')->plainTextToken)
        ->postJson('/api/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => "private-sos.{$sos->id}"]);

    $auth($this->student)->assertOk();
    $auth($this->officer)->assertOk();
    $auth($stranger)->assertForbidden();
});

it('officers resolve SOS from the desk, and closed SOS reject new messages', function () {
    $sos = SosAlert::create(['user_id' => $this->student->id]);
    $this->actingAs($this->officer);
    Livewire::test(ListSosAlerts::class)->assertCanSeeTableRecords([$sos])->callTableAction('resolve', $sos);
    expect($sos->fresh()->status)->toBe('resolved');

    Sanctum::actingAs($this->student);
    $this->postJson("/api/sos/{$sos->id}/messages", ['body' => 'thanks'])->assertUnprocessable();
});

it('checks in safe at an assembly point for the active alert, once per alert', function () {
    Sanctum::actingAs($this->student);
    $this->postJson('/api/check-in', ['status' => 'safe', 'node_id' => 'DEMO/1/AP'])->assertUnprocessable()->assertJsonValidationErrors('status'); // no alert

    $alert = activeAlert();
    $this->getJson('/api/check-in')->assertJsonPath('check_in.status', null)->assertJsonPath('check_in.alert_id', $alert->id);
    $this->postJson('/api/check-in', ['status' => 'safe', 'node_id' => 'DEMO/1/R101'])->assertJsonValidationErrors('node_id'); // not an assembly point
    $this->postJson('/api/check-in', ['status' => 'needs_help'])->assertOk()->assertJsonPath('check_in.status', 'needs_help');
    $this->postJson('/api/check-in', ['status' => 'safe', 'node_id' => 'DEMO/1/AP'])
        ->assertOk()->assertJsonPath('check_in.status', 'safe')->assertJsonPath('check_in.place', 'Demo Building · Ground · AP');

    expect(DB::table('evacuation_logs')->count())->toBe(1);
});

it('records location events only while an alert is active', function () {
    Sanctum::actingAs($this->student);
    $body = ['source' => 'qr', 'confidence' => 'exact', 'node_id' => 'DEMO/2/S2', 'building_id' => 'DEMO', 'level' => 2];
    $this->postJson('/api/location', $body)->assertNoContent();
    expect(DB::table('location_events')->count())->toBe(0);

    $alert = activeAlert();
    $this->postJson('/api/location', $body)->assertNoContent();
    $this->postJson('/api/location', ['source' => 'x', 'confidence' => 'exact'])->assertJsonValidationErrors('source');
    expect(DB::table('location_events')->where(['alert_id' => $alert->id, 'user_id' => $this->student->id])->count())->toBe(1);
});

it('shows safe, needs help and unknown people with last known location on the Safety Monitor', function () {
    $alert = activeAlert();
    $safe = User::forceCreate(['name' => 'Ana Safe', 'email' => 'a@example.test']);
    $help = User::forceCreate(['name' => 'Ben Help', 'email' => 'b@example.test']);
    DB::table('evacuation_logs')->insert([
        ['user_id' => $safe->id, 'alert_id' => $alert->id, 'status' => 'safe', 'assembly_node_id' => 'DEMO/1/AP', 'checked_in_at' => now()],
        ['user_id' => $help->id, 'alert_id' => $alert->id, 'status' => 'needs_help', 'assembly_node_id' => null, 'checked_in_at' => now()],
    ]);
    DB::table('location_events')->insert(['user_id' => $this->student->id, 'alert_id' => $alert->id, 'room_id' => 'DEMO/2/R201',
        'building_id' => 'DEMO', 'level' => 2, 'source' => 'schedule', 'confidence' => 'likely', 'created_at' => now()]);

    $this->actingAs($this->officer);
    Livewire::test(SafetyMonitor::class)
        ->assertSee('Demo Building · Ground · AP')
        ->assertCanSeeTableRecords([$help, $this->student, $safe], inOrder: true) // needs help, unknown, safe
        ->assertCanNotSeeTableRecords([$this->officer])
        ->assertSee('Demo Building · Second · R201')
        ->filterTable('status', 'unknown')
        ->assertCanSeeTableRecords([$this->student])
        ->assertCanNotSeeTableRecords([$safe, $help]);
});
