<?php

use App\Enums\Role;
use App\Events\FeedbackSubmitted;
use App\Models\Feedback;
use App\Models\HazardReport;
use App\Models\SosAlert;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    $this->student = officerUser(Role::Student);
    $this->officer = officerUser();
});

function newReport(int $by): HazardReport
{
    return HazardReport::create(['reported_by' => $by, 'building_id' => 'DEMO', 'level' => 1, 'room_id' => 'DEMO/1/R101', 'hazard_type' => 'fire']);
}

function unseen($test): array
{
    return $test->getJson('/api/officer/overview')->assertOk()->json('unseen');
}

it('counts items created since the officer last opened each tab', function () {
    Sanctum::actingAs($this->officer);
    newReport($this->student->id);
    newReport($this->student->id);
    $this->postJson('/api/officer/seen/reports')->assertNoContent();
    $this->travel(1)->minutes();
    newReport($this->student->id);
    Feedback::create(['user_id' => $this->student->id, 'rating' => 4]);

    expect(unseen($this))->toBe(['sos' => 0, 'reports' => 1, 'feedback' => 1]);
});

it('counts everything from today when a tab was never opened', function () {
    Sanctum::actingAs($this->officer);
    $this->travelTo(now(config('evacuai.timezone'))->setTime(12, 0));
    $old = newReport($this->student->id);
    $old->forceFill(['created_at' => now()->subDay()])->save();
    newReport($this->student->id);

    expect(unseen($this)['reports'])->toBe(1);
});

it('counts items from just after midnight Manila time, before 8 a.m.', function () {
    Sanctum::actingAs($this->officer);
    $this->travelTo(now(config('evacuai.timezone'))->setTime(3, 0)); // 03:00 Manila is 19:00 UTC the day before
    newReport($this->student->id);

    expect(unseen($this)['reports'])->toBe(1);
});

it('keeps stamps per officer', function () {
    newReport($this->student->id);
    Sanctum::actingAs($this->officer);
    $this->postJson('/api/officer/seen/reports')->assertNoContent();
    expect(unseen($this)['reports'])->toBe(0);

    Sanctum::actingAs(officerUser());
    expect(unseen($this)['reports'])->toBe(1);
});

it('rejects unknown tabs, and students', function () {
    Sanctum::actingAs($this->officer);
    $this->postJson('/api/officer/seen/alerts')->assertNotFound();
    Sanctum::actingAs($this->student);
    $this->postJson('/api/officer/seen/reports')->assertNotFound();
});

it('reports open SOS that nobody owns', function () {
    SosAlert::create(['user_id' => $this->student->id, 'status' => 'pending']);
    SosAlert::create(['user_id' => officerUser(Role::Student)->id, 'status' => 'acknowledged', 'acknowledged_by' => $this->officer->id]);
    Sanctum::actingAs($this->officer);

    $this->getJson('/api/officer/overview')->assertOk()->assertJsonPath('stats.unowned_sos', 1);
});

it('broadcasts new feedback to officers', function () {
    Event::fake([FeedbackSubmitted::class]);
    Sanctum::actingAs($this->student);
    $this->postJson('/api/feedback', ['rating' => 5])->assertCreated();

    Event::assertDispatchedTimes(FeedbackSubmitted::class, 1);
});
