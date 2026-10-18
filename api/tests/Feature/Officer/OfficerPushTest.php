<?php

use App\Enums\Role;
use App\Jobs\SendAlertPush;
use App\Jobs\SendOfficerPush;
use App\Models\Alert;
use App\Models\HazardReport;
use App\Models\User;
use App\Support\ReportClusters;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Notification::fake();
    Event::fake();
});

function withDevice(User $u, string $token): User
{
    DB::table('device_tokens')->insert(['user_id' => $u->id, 'token' => $token, 'platform' => 'android', 'created_at' => now(), 'updated_at' => now()]);

    return $u;
}

it('queues an officer push for a new SOS', function () {
    Bus::fake([SendOfficerPush::class]);
    Sanctum::actingAs(officerUser(Role::Student));

    $sos = $this->postJson('/api/sos', ['node_id' => 'DEMO/1/R101', 'message' => 'Smoke everywhere, cannot see the exit'])->assertCreated()->json('sos');

    Bus::assertDispatched(SendOfficerPush::class, fn (SendOfficerPush $job) => $job->data === ['sos_id' => $sos['id']]
        && str_starts_with($job->title, 'SOS: ') && $job->body === 'Smoke everywhere, cannot see the exit');
});

it('pushes only to active officers and admins', function () {
    withDevice(officerUser(), 'ExponentPushToken[officer]');
    withDevice(officerUser(Role::Admin), 'ExponentPushToken[admin]');
    withDevice(officerUser(Role::Student), 'ExponentPushToken[student]');
    withDevice(officerUser(Role::SafetyOfficer, false), 'ExponentPushToken[inactive]');
    Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok'], ['status' => 'ok']]])]);

    (new SendOfficerPush('SOS: Demo · Ground', 'Needs help', ['sos_id' => 7]))->handle();

    Http::assertSent(function (Request $r) {
        $to = collect($r->data())->pluck('to')->sort()->values()->all();

        return $to === ['ExponentPushToken[admin]', 'ExponentPushToken[officer]'] && $r->data()[0]['data'] === ['sos_id' => 7];
    });
});

it('queues an officer push when reports raise an unverified alert', function () {
    Bus::fake([SendOfficerPush::class, SendAlertPush::class]);
    foreach (range(1, 3) as $i) {
        $report = HazardReport::create(['reported_by' => officerUser(Role::Student)->id, 'building_id' => 'DEMO', 'level' => 1, 'hazard_type' => 'fire']);
        ReportClusters::evaluate($report);
    }
    $alert = Alert::sole();

    Bus::assertDispatched(SendOfficerPush::class, fn (SendOfficerPush $job) => $job->data === ['alert_id' => $alert->id]
        && str_starts_with($job->title, 'Unverified alert: Fire'));
});
