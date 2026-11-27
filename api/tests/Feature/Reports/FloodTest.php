<?php

use App\Enums\Role;
use App\Models\Alert;
use App\Models\HazardReport;
use App\Support\ReportVerification;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo', 'services.ollama.base' => null]);
    $this->seed(CampusSeeder::class);
    Storage::fake('local');
    Queue::fake();
});

function floodReport(int $seed, array $over = []): TestResponse
{
    Sanctum::actingAs(officerUser(Role::Student));

    return test()->post('/api/hazard-reports', array_merge(['hazard_type' => 'flood', 'building_id' => 'DEMO', 'level' => 1], photoFields($seed), $over), ['Accept' => 'application/json']);
}

it('reports a flood at an outdoor area (a safe zone), and only at real outdoor areas', function () {
    floodReport(1, ['node_id' => 'DEMO/1/AP'])->assertCreated();
    expect(HazardReport::sole()->node_id)->toBe('DEMO/1/AP');

    floodReport(2, ['node_id' => 'DEMO/1/C1'])->assertUnprocessable()->assertJsonValidationErrors('node_id'); // a corridor point
});

it('sends verified flood places to phones: the outdoor area, the flooded floor and its rooms', function () {
    $u = officerUser(Role::Student);
    HazardReport::create(['reported_by' => $u->id, 'hazard_type' => 'flood', 'building_id' => 'DEMO', 'level' => 1, 'node_id' => 'DEMO/1/AP', 'status' => 'verified']);
    HazardReport::create(['reported_by' => $u->id, 'hazard_type' => 'flood', 'building_id' => 'DEMO', 'level' => 2, 'status' => 'verified']);
    HazardReport::create(['reported_by' => $u->id, 'hazard_type' => 'flood', 'building_id' => 'DEMO', 'level' => 1, 'status' => 'pending']); // not yet

    Sanctum::actingAs($u);
    $snap = $this->getJson('/api/campus-snapshot')->assertOk();
    expect($snap->json('hazardNodeIds'))->toBe(['DEMO/1/AP'])
        ->and($snap->json('floodedFloors'))->toBe([['building' => 'DEMO', 'level' => 2]])
        ->and($snap->json('hazardRoomIds'))->toContain('DEMO/2/R201');
});

it('verifies floods by the report count, without the AI', function () {
    Event::fake();
    Alert::withoutEvents(fn () => Alert::create(['hazard_type' => 'flood', 'severity_level' => 'high', 'message' => 'Flood', 'status' => 'active', 'issued_at' => now()]));
    foreach ([1, 2, 3] as $i) {
        floodReport($i)->assertCreated();
    }
    HazardReport::query()->update(['reporter_place' => 'match']); // AI verdict stays empty: floods are not sent to the AI

    expect(ReportVerification::evaluate(HazardReport::latest('id')->first()))->toBeTrue()
        ->and(HazardReport::pluck('status')->unique()->all())->toBe(['verified']);
});

it('verifies floods by the report count even before any officer alert (the water is the evidence)', function () {
    Event::fake();
    foreach ([11, 12, 13] as $i) {
        floodReport($i)->assertCreated();
    }
    HazardReport::query()->update(['reporter_place' => 'match']);

    expect(ReportVerification::evaluate(HazardReport::latest('id')->first()))->toBeTrue();
});

it('still needs an officer alert for other hazards verified by the AI', function () {
    Event::fake();
    foreach ([21, 22, 23] as $i) {
        floodReport($i, ['hazard_type' => 'fire'])->assertCreated();
    }
    HazardReport::query()->update(['reporter_place' => 'match', 'ai_verdict' => 'match']);

    expect(ReportVerification::evaluate(HazardReport::latest('id')->first()))->toBeFalse();
});
