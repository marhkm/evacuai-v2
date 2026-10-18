<?php

use App\Enums\Role;
use App\Events\AlertBroadcast;
use App\Jobs\SendAlertPush;
use App\Models\Alert;
use App\Models\HazardReport;
use App\Support\Feeds;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo', 'services.llm.gemini.key' => null, 'services.llm.groq.key' => null]);
    $this->seed(CampusSeeder::class);
    Event::fake([AlertBroadcast::class]);
    Bus::fake([SendAlertPush::class]);
    Notification::fake();
    $this->officer = officerUser();
    Sanctum::actingAs($this->officer);
});

function fireReports(int $n): void
{
    foreach (range(1, $n) as $i) {
        HazardReport::create(['reported_by' => officerUser(Role::Student)->id, 'building_id' => 'DEMO', 'level' => 1, 'room_id' => 'DEMO/1/R101', 'hazard_type' => 'fire']);
    }
}

$alert = ['hazard_type' => 'fire', 'severity_level' => 'high', 'building_id' => 'DEMO', 'message' => 'Fire on the ground floor. Use Exit 1.'];

it('broadcasts, verifies matching reports and dispatches push', function () use ($alert) {
    fireReports(3);

    $this->postJson('/api/officer/alerts', $alert)->assertCreated()
        ->assertJsonPath('alert.verified', true)->assertJsonPath('alert.status', 'active');

    $created = Alert::sole();
    expect($created->issued_by)->toBe($this->officer->id)
        ->and(HazardReport::where(['status' => 'verified', 'alert_id' => $created->id])->count())->toBe(3);
    Event::assertDispatched(AlertBroadcast::class);
    Bus::assertDispatched(SendAlertPush::class);
    expect(DB::table('user_activity_logs')->where('activity_type', 'alert_issued')->exists())->toBeTrue();
});

it('asks for confirmation below 3 reports and creates nothing', function () use ($alert) {
    fireReports(1);

    $this->postJson('/api/officer/alerts', $alert)->assertOk()
        ->assertJson(['needs_confirmation' => true, 'reporters' => 1]);
    expect(Alert::count())->toBe(0);

    $this->postJson('/api/officer/alerts', $alert + ['confirm' => true])->assertCreated();
    expect(Alert::count())->toBe(1);
});

it('does not verify reports for drills, and drills need no confirmation', function () use ($alert) {
    fireReports(1);

    $this->postJson('/api/officer/alerts', $alert + ['is_drill' => true])->assertCreated()->assertJsonPath('alert.is_drill', true);
    expect(HazardReport::sole()->status)->toBe('pending');
});

it('validates the broadcast form', function () {
    $this->postJson('/api/officer/alerts', ['hazard_type' => 'meteor', 'severity_level' => 'high', 'message' => str_repeat('x', 501)])
        ->assertUnprocessable()->assertJsonValidationErrors(['hazard_type', 'message']);
});

it('publishes and discards feed drafts', function () {
    config(['evacuai.feeds.fake' => true, 'evacuai.feeds.campus_lat' => 10.33, 'evacuai.feeds.campus_lng' => 123.95]);
    Http::preventStrayRequests();
    Feeds::poll();
    [$quake, $rain] = [Alert::where('hazard_type', 'earthquake')->firstOrFail(), Alert::where('hazard_type', 'flood')->firstOrFail()];

    $this->postJson("/api/officer/alerts/{$quake->id}/publish", ['message' => 'Earthquake felt. Go to the field.'])->assertOk()
        ->assertJsonPath('alert.status', 'active')->assertJsonPath('alert.message', 'Earthquake felt. Go to the field.');
    expect($quake->fresh()->issued_by)->toBe($this->officer->id);
    Bus::assertDispatched(SendAlertPush::class, 1);

    $this->postJson("/api/officer/alerts/{$rain->id}/discard")->assertOk()->assertJsonPath('alert.status', 'retracted');
    $this->postJson("/api/officer/alerts/{$quake->id}/publish", ['message' => 'Again'])->assertUnprocessable();
});

it('confirms, resolves and retracts, and rejects actions that do not fit the status', function () {
    $auto = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Unverified fire', 'status' => 'active', 'source' => 'reports', 'verified' => false, 'issued_at' => now()]);

    $this->postJson("/api/officer/alerts/{$auto->id}/confirm")->assertOk()->assertJsonPath('alert.verified', true);
    $this->postJson("/api/officer/alerts/{$auto->id}/resolve")->assertOk()->assertJsonPath('alert.status', 'resolved');
    $this->postJson("/api/officer/alerts/{$auto->id}/resolve")->assertUnprocessable()->assertJsonStructure(['message']);
    $this->postJson("/api/officer/alerts/{$auto->id}/retract")->assertUnprocessable();
    expect($auto->fresh()->status)->toBe('resolved');
    Bus::assertNotDispatched(SendAlertPush::class);
    expect(DB::table('user_activity_logs')->where('activity_type', 'alert_updated')->count())->toBe(2);
});

it('lists alerts with drafts filtered by status', function () {
    Alert::create(['hazard_type' => 'flood', 'severity_level' => 'high', 'message' => 'Draft rain', 'status' => 'draft', 'source' => 'feed', 'verified' => false]);
    Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Live', 'status' => 'active', 'issued_at' => now()]);

    $this->getJson('/api/officer/alerts')->assertOk()->assertJsonCount(2, 'alerts');
    $this->getJson('/api/officer/alerts?status=draft')->assertOk()->assertJsonCount(1, 'alerts')->assertJsonPath('alerts.0.message', 'Draft rain');
});

it('translates only when an LLM is configured', function () {
    $this->postJson('/api/officer/alerts/translate', ['message' => 'Fire at BE.'])->assertNotFound();

    config(['services.llm.groq.key' => 'q']);
    Http::fake(['api.groq.com/*' => Http::sequence()
        ->push(['choices' => [['message' => ['content' => '{"ceb": "Sunog sa BE.", "fil": "Sunog sa BE."}']]]])
        ->push([], 500)]);
    $this->postJson('/api/officer/alerts/translate', ['message' => 'Fire at BE.'])->assertOk()
        ->assertJson(['ceb' => 'Sunog sa BE.', 'fil' => 'Sunog sa BE.', 'provider' => 'groq']);

    $this->postJson('/api/officer/alerts/translate', ['message' => 'Fire at BE.'])->assertStatus(503)->assertJson(['message' => 'No AI provider answered']);
});

it('streams the drill report csv', function () {
    $a = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Drill', 'status' => 'active', 'is_drill' => true, 'issued_at' => now()]);

    $res = $this->get("/api/officer/alerts/{$a->id}/report.csv")->assertOk();
    expect($res->headers->get('content-type'))->toContain('text/csv')
        ->and($res->streamedContent())->toContain('Alert');
});
