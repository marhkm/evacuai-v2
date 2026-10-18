<?php

use App\Enums\Role;
use App\Events\CheckInUpdated;
use App\Events\ReportSubmitted;
use App\Events\SosUpdated;
use App\Models\Alert;
use App\Models\SosAlert;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Notification::fake();
});

it('lets only active officers and admins listen on the officers channel', function () {
    config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'k', 'broadcasting.connections.reverb.secret' => 's', 'broadcasting.connections.reverb.app_id' => '1']);
    require base_path('routes/channels.php'); // channels were registered on the boot-time (null) broadcaster
    $auth = fn (User $u) => tap($this, fn () => app('auth')->forgetGuards())->withToken($u->createToken('t')->plainTextToken)
        ->postJson('/api/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'private-officers']);

    $auth(officerUser())->assertOk();
    $auth(officerUser(Role::Admin))->assertOk();
    $auth(officerUser(Role::Student))->assertForbidden();
    $auth(officerUser(Role::SafetyOfficer, false))->assertForbidden();
});

it('sends SOS updates to the officers channel too', function () {
    $sos = SosAlert::create(['user_id' => officerUser(Role::Student)->id]);
    $channels = array_map(fn ($c) => $c->name, (new SosUpdated($sos))->broadcastOn());

    expect($channels)->toBe(['private-sos.'.$sos->id, 'private-officers']);
});

it('announces new reports to officers without the reporter', function () {
    Event::fake([ReportSubmitted::class]);
    $student = officerUser(Role::Student);
    Sanctum::actingAs($student);

    $this->postJson('/api/hazard-reports', ['hazard_type' => 'fire', 'building_id' => 'DEMO', 'level' => 1, 'description' => 'Smoke'])->assertCreated();

    Event::assertDispatched(ReportSubmitted::class, function (ReportSubmitted $e) use ($student) {
        $payload = $e->broadcastWith();

        return $e->broadcastAs() === 'report.submitted' && $payload['hazard_type'] === 'fire' && $payload['matching'] === 1
            && ! array_key_exists('reporter', $payload) && ! str_contains(json_encode($payload), $student->name)
            && $e->broadcastOn()[0]->name === 'private-officers';
    });
});

it('announces check-ins to officers', function () {
    Event::fake([CheckInUpdated::class]);
    $alert = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Fire', 'status' => 'active', 'issued_at' => now()]);
    Sanctum::actingAs(officerUser(Role::Student));

    $this->postJson('/api/check-in', ['status' => 'safe'])->assertOk();

    Event::assertDispatched(CheckInUpdated::class, fn (CheckInUpdated $e) => $e->broadcastWith() === ['alert_id' => $alert->id]
        && $e->broadcastAs() === 'checkin.updated');
});
