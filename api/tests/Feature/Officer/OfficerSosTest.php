<?php

use App\Enums\Role;
use App\Events\SosUpdated;
use App\Exceptions\InvalidState;
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

describe('one officer handles each SOS', function () {
    beforeEach(function () {
        $this->other = officerUser();
        $this->other->forceFill(['name' => 'Ana Reyes'])->save();
        $this->officer->forceFill(['name' => 'Ben Cruz'])->save();
    });

    it('makes the first officer to reply the owner', function () {
        $this->postJson("/api/officer/sos/{$this->sos->id}/messages", ['body' => 'On my way'])->assertCreated();

        expect($this->sos->fresh())->acknowledged_by->toBe($this->officer->id)->status->toBe('acknowledged');
    });

    it('stops another officer replying to a case someone else handles', function () {
        $this->postJson("/api/officer/sos/{$this->sos->id}/messages", ['body' => 'On my way'])->assertCreated();
        Sanctum::actingAs($this->other);

        $this->postJson("/api/officer/sos/{$this->sos->id}/messages", ['body' => 'Me too'])
            ->assertStatus(409)->assertJson(['error' => 'handled_by', 'name' => 'Ben Cruz', 'message' => 'Handled by Ben Cruz.']);
        expect($this->sos->messages()->count())->toBe(1);
    });

    it('lets only one officer win a pending SOS', function () {
        $a = SosAlert::find($this->sos->id);
        $b = SosAlert::find($this->sos->id); // loaded before either claim, like two requests at once

        expect($a->claimFor($this->officer))->toBeNull()
            ->and($b->claimFor($this->other)?->id)->toBe($this->officer->id)
            ->and($this->sos->fresh()->acknowledged_by)->toBe($this->officer->id);
    });

    it('does not let Acknowledge take a case another officer already claimed', function () {
        $stale = SosAlert::find($this->sos->id); // B's request loaded it while still pending
        $this->sos->claimFor($this->officer);
        $this->actingAs($this->other);

        expect($stale->acknowledge()?->id)->toBe($this->officer->id)
            ->and($this->sos->fresh()->acknowledged_by)->toBe($this->officer->id);
    });

    it('never reopens an SOS the student cancelled meanwhile', function () {
        $stale = SosAlert::find($this->sos->id); // the officer's reply loaded it while still pending
        $this->sos->update(['status' => 'cancelled']);

        expect(fn () => $stale->claimFor($this->officer))->toThrow(InvalidState::class, 'This SOS is closed.');
        expect($this->sos->fresh())->status->toBe('cancelled')->acknowledged_by->toBeNull();
    });

    it('always lets the student reply to their own SOS', function () {
        $this->sos->claimFor($this->officer);
        Sanctum::actingAs($this->student);

        $this->postJson("/api/sos/{$this->sos->id}/messages", ['body' => 'Still here'])->assertCreated();
    });

    it('applies the same rule to officers on the student route', function () {
        $this->sos->claimFor($this->officer);
        Sanctum::actingAs($this->other);

        $this->postJson("/api/sos/{$this->sos->id}/messages", ['body' => 'Hi'])->assertStatus(409)->assertJsonPath('error', 'handled_by');
    });

    it('takes over a case and tells everyone in the chat', function () {
        $this->sos->claimFor($this->officer);
        Sanctum::actingAs($this->other);

        $this->postJson("/api/officer/sos/{$this->sos->id}/take-over")->assertOk()
            ->assertJsonPath('sos.responder', 'Ana Reyes')->assertJsonPath('sos.can_reply', true);
        $last = $this->sos->messages()->latest('id')->first();
        expect($this->sos->fresh()->acknowledged_by)->toBe($this->other->id)
            ->and($last->body)->toBe('Ana Reyes has taken over from Ben Cruz.')
            ->and($last->sender_id)->toBe($this->other->id)
            ->and(DB::table('user_activity_logs')->where('activity_type', 'sos_taken_over')->exists())->toBeTrue();

        Sanctum::actingAs($this->officer);
        $this->getJson("/api/officer/sos/{$this->sos->id}")->assertJsonPath('sos.can_reply', false);
    });

    it('refuses to take over closed cases and your own', function () {
        $this->sos->claimFor($this->officer);
        $this->postJson("/api/officer/sos/{$this->sos->id}/take-over")->assertUnprocessable()->assertJsonPath('message', "You're already handling this.");

        $this->sos->update(['status' => 'resolved']);
        $count = $this->sos->messages()->count();
        Sanctum::actingAs($this->other);
        $this->postJson("/api/officer/sos/{$this->sos->id}/take-over")->assertUnprocessable()->assertJsonPath('message', 'This SOS is closed.');
        expect($this->sos->messages()->count())->toBe($count);
    });
});
