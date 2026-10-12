<?php

use App\Enums\Role;
use App\Events\AlertBroadcast;
use App\Jobs\SendAlertPush;
use App\Models\Alert;
use App\Models\User;
use App\Notifications\UnverifiedAlertRaised;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Event::fake([AlertBroadcast::class]);
    Bus::fake([SendAlertPush::class]);
    Notification::fake();
});

function reporter(int $n, array $attrs = []): User
{
    return User::forceCreate(array_merge(['name' => "R{$n}", 'email' => "r{$n}@example.test", 'email_verified_at' => now()], $attrs));
}

function submitReport(User $u, array $over = []): TestResponse
{
    Sanctum::actingAs($u);

    return test()->postJson('/api/hazard-reports', array_merge([
        'hazard_type' => 'fire', 'building_id' => 'DEMO', 'level' => 1, 'room_id' => 'DEMO/1/R101', 'description' => 'Smoke from the room',
    ], $over));
}

it('stores a report from the signed-in user', function () {
    submitReport(reporter(1))->assertCreated()->assertJsonPath('report.status', 'pending');
    expect(DB::table('hazard_reports')->count())->toBe(1);
});

it('validates the location against the campus', function () {
    $u = reporter(1);
    submitReport($u, ['room_id' => 'DEMO/2/R201'])->assertUnprocessable()->assertJsonValidationErrors('room_id'); // room is on level 2
    submitReport($u, ['building_id' => 'NOPE'])->assertUnprocessable()->assertJsonValidationErrors('building_id');
    submitReport($u, ['hazard_type' => 'aliens'])->assertUnprocessable()->assertJsonValidationErrors('hazard_type');
    submitReport($u, ['level' => 9, 'room_id' => null])->assertUnprocessable()->assertJsonValidationErrors('level');
});

it('auto-broadcasts an UNVERIFIED alert when 3 distinct users report the same hazard on a floor', function () {
    $admin = reporter(9, ['role' => Role::Admin]);
    submitReport(reporter(1));
    submitReport(reporter(2));
    expect(Alert::count())->toBe(0);

    submitReport(reporter(3))->assertCreated();

    $alert = Alert::sole();
    expect($alert->verified)->toBeFalse()
        ->and($alert->source)->toBe('reports')
        ->and($alert->status)->toBe('active')
        ->and($alert->hazard_type)->toBe('fire')
        ->and($alert->message)->toContain('Unverified')
        ->and(DB::table('hazard_reports')->whereNull('alert_id')->count())->toBe(0);
    Event::assertDispatched(AlertBroadcast::class);
    Bus::assertDispatched(SendAlertPush::class);
    Notification::assertSentTo($admin, UnverifiedAlertRaised::class);
});

it('does not count the same user twice, unverified accounts, or old reports', function () {
    $u = reporter(1);
    submitReport($u);
    submitReport($u);
    submitReport(reporter(2, ['email_verified_at' => null]));
    $this->travel(11)->minutes();
    submitReport(reporter(3));
    submitReport(reporter(4));
    expect(Alert::count())->toBe(0);
});

it('does not stack a second auto alert for the same incident', function () {
    foreach ([1, 2, 3, 4, 5] as $n) {
        submitReport(reporter($n));
    }
    expect(Alert::count())->toBe(1);
});

it('rate-limits reports per user', function () {
    $u = reporter(1);
    foreach (range(1, 5) as $_) {
        submitReport($u)->assertCreated();
    }
    submitReport($u)->assertTooManyRequests();
});

it('lists my own reports only', function () {
    submitReport(reporter(1));
    submitReport(reporter(2));
    Sanctum::actingAs(User::where('email', 'r1@example.test')->first());
    $this->getJson('/api/hazard-reports/mine')->assertOk()->assertJsonCount(1, 'reports');
});
