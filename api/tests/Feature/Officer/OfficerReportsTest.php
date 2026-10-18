<?php

use App\Enums\Role;
use App\Models\HazardReport;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo', 'services.llm.gemini.key' => null, 'services.llm.groq.key' => null]);
    $this->seed(CampusSeeder::class);
    $this->officer = officerUser();
    Sanctum::actingAs($this->officer);
});

function smokeReport(array $attrs = []): HazardReport
{
    $reporter = officerUser(Role::Student);
    $reporter->forceFill(['name' => 'Ana Reyes'])->save();

    return HazardReport::create($attrs + ['reported_by' => $reporter->id, 'building_id' => 'DEMO', 'level' => 1, 'room_id' => 'DEMO/1/R101', 'hazard_type' => 'fire', 'description' => 'Smoke from the door']);
}

it('lists reports with the same-floor reporter count and place', function () {
    smokeReport();
    smokeReport();

    $this->getJson('/api/officer/reports')->assertOk()
        ->assertJsonCount(2, 'reports')
        ->assertJsonPath('reports.0.matching', 2)
        ->assertJsonPath('reports.0.reporter', 'Ana Reyes')
        ->assertJsonPath('reports.0.photo_url', null)
        ->assertJsonStructure(['reports' => [['id', 'hazard_type', 'place', 'description', 'status', 'created_at', 'matching']]]);
    $this->getJson('/api/officer/reports?status=verified')->assertOk()->assertJsonCount(0, 'reports');
});

it('verifies, dismisses and resolves, rejecting transitions that do not fit', function () {
    [$a, $b] = [smokeReport(), smokeReport()];

    $this->postJson("/api/officer/reports/{$a->id}/verify")->assertOk()->assertJsonPath('report.status', 'verified');
    expect($a->fresh()->verified_by)->toBe($this->officer->id);
    $this->postJson("/api/officer/reports/{$a->id}/verify")->assertUnprocessable();
    $this->postJson("/api/officer/reports/{$a->id}/resolve")->assertOk()->assertJsonPath('report.status', 'resolved');
    $this->postJson("/api/officer/reports/{$b->id}/resolve")->assertUnprocessable();
    $this->postJson("/api/officer/reports/{$b->id}/dismiss")->assertOk()->assertJsonPath('report.status', 'dismissed');
    $this->postJson("/api/officer/reports/{$b->id}/dismiss")->assertUnprocessable();
});

it('streams the photo to officers only', function () {
    Storage::fake('local');
    Storage::disk('local')->put('reports/x.jpg', 'jpeg-bytes');
    $r = smokeReport(['photo_path' => 'reports/x.jpg']);

    $this->getJson('/api/officer/reports')->assertJsonPath('reports.0.photo_url', url("/api/officer/reports/{$r->id}/photo"));
    expect($this->get("/api/officer/reports/{$r->id}/photo")->assertOk()->streamedContent())->toBe('jpeg-bytes');

    Sanctum::actingAs(officerUser(Role::Student));
    $this->get("/api/officer/reports/{$r->id}/photo")->assertNotFound();
});

it('summarizes only with an LLM, without sending the reporter name', function () {
    $r = smokeReport();
    smokeReport();
    $this->postJson("/api/officer/reports/{$r->id}/summary")->assertNotFound();

    config(['services.llm.groq.key' => 'q']);
    Http::fake(['api.groq.com/*' => Http::response(['choices' => [['message' => ['content' => 'Two people report smoke at R101.']]]])]);
    $this->postJson("/api/officer/reports/{$r->id}/summary")->assertOk()
        ->assertJson(['text' => 'Two people report smoke at R101.', 'provider' => 'groq']);
    Http::assertSent(fn (Request $req) => ! str_contains($req->body(), 'Ana Reyes'));
});
