<?php

use App\Enums\Role;
use App\Jobs\SendSosReplyPush;
use App\Models\SosAlert;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    $this->officer = officerUser();
    $this->student = officerUser(Role::Student);
    $this->sos = SosAlert::create(['user_id' => $this->student->id, 'building_id' => 'DEMO', 'level' => 1, 'status' => 'pending']);
    Sanctum::actingAs($this->officer);
    $this->postJson('/api/officer/seen/sos')->assertNoContent(); // the new SOS itself is not what these tests count
    $this->travel(1)->minutes();
});

function studentSays(SosAlert $sos, string $body = 'Still here'): void
{
    $sos->messages()->create(['sender_id' => $sos->user_id, 'body' => $body]);
}

function sosUnseen($test, int $id): int
{
    return collect($test->getJson('/api/officer/sos')->assertOk()->json('sos'))->firstWhere('id', $id)['unseen'];
}

it('counts student messages this officer has not seen, per SOS and on the badge', function () {
    studentSays($this->sos);
    studentSays($this->sos);

    expect(sosUnseen($this, $this->sos->id))->toBe(2)
        ->and($this->getJson('/api/officer/overview')->json('unseen.sos'))->toBe(2);
});

it('clears the count when the officer opens the SOS, and keeps it per officer', function () {
    studentSays($this->sos);
    $this->getJson("/api/officer/sos/{$this->sos->id}")->assertOk();

    expect(sosUnseen($this, $this->sos->id))->toBe(0)
        ->and($this->getJson('/api/officer/overview')->json('unseen.sos'))->toBe(0);

    studentSays($this->sos, 'Smoke is getting worse');
    expect(sosUnseen($this, $this->sos->id))->toBe(1);

    Sanctum::actingAs(officerUser());
    $this->postJson('/api/officer/seen/sos')->assertNoContent();
    expect(sosUnseen($this, $this->sos->id))->toBe(2);
    expect($this->sos->messages()->count())->toBe(2); // old messages stay
});

it('clears the count when the officer replies', function () {
    studentSays($this->sos);
    $this->postJson("/api/officer/sos/{$this->sos->id}/messages", ['body' => 'Coming'])->assertCreated();

    expect(sosUnseen($this, $this->sos->id))->toBe(0);
});

it('never counts resolved or cancelled SOS', function () {
    studentSays($this->sos);
    $other = SosAlert::create(['user_id' => officerUser(Role::Student)->id, 'status' => 'pending']);
    studentSays($other);
    $this->postJson("/api/officer/sos/{$this->sos->id}/resolve")->assertOk();
    $other->update(['status' => 'cancelled']);

    expect(sosUnseen($this, $this->sos->id))->toBe(0)
        ->and(sosUnseen($this, $other->id))->toBe(0)
        ->and($this->getJson('/api/officer/overview')->json('unseen.sos'))->toBe(0);
});

it('pushes an officer reply to the student', function () {
    Bus::fake([SendSosReplyPush::class]);
    $this->postJson("/api/officer/sos/{$this->sos->id}/messages", ['body' => 'Stay where you are, we are on the way.'])->assertCreated();

    Bus::assertDispatched(SendSosReplyPush::class, fn (SendSosReplyPush $job) => $job->sos->is($this->sos)
        && $job->body === 'Stay where you are, we are on the way.');
});

it('pushes a Responder-mode reply too, but not the student\'s own messages', function () {
    Bus::fake([SendSosReplyPush::class]);
    $this->postJson("/api/sos/{$this->sos->id}/messages", ['body' => 'On my way'])->assertCreated();
    Bus::assertDispatchedTimes(SendSosReplyPush::class, 1);

    Sanctum::actingAs($this->student);
    $this->postJson("/api/sos/{$this->sos->id}/messages", ['body' => 'Thanks'])->assertCreated();
    Bus::assertDispatchedTimes(SendSosReplyPush::class, 1);
});

it('sends the push to the student\'s devices only, and not once the SOS is resolved', function () {
    foreach ([[$this->student, 'student'], [$this->officer, 'officer']] as [$u, $t]) {
        DB::table('device_tokens')->insert(['user_id' => $u->id, 'token' => "ExponentPushToken[{$t}]", 'platform' => 'android', 'created_at' => now(), 'updated_at' => now()]);
    }
    Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok']]])]);

    (new SendSosReplyPush($this->sos, str_repeat('a', 100)))->handle();
    Http::assertSent(fn (Request $r) => collect($r->data())->pluck('to')->all() === ['ExponentPushToken[student]']
        && $r->data()[0]['title'] === 'Safety officer replied' && mb_strlen($r->data()[0]['body']) === 80
        && $r->data()[0]['data'] === ['sos_id' => $this->sos->id]);

    $this->sos->update(['status' => 'resolved']);
    (new SendSosReplyPush($this->sos, 'Late reply'))->handle();
    Http::assertSentCount(1);
});
