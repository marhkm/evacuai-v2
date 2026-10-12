<?php

use App\Events\AlertBroadcast;
use App\Jobs\SendAlertPush;
use App\Jobs\SendAlertSms;
use App\Models\Alert;
use App\Models\User;
use App\Support\AlertDispatcher;
use Database\Seeders\CampusSeeder;
use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
});

function makeAlert(array $over = []): Alert
{
    return Alert::create(array_merge([
        'hazard_type' => 'earthquake', 'severity_level' => 'high', 'message' => 'Drop, cover, hold on.', 'status' => 'active', 'issued_at' => now(),
    ], $over));
}

it('broadcasts on the public alerts channel with the alert payload', function () {
    $event = new AlertBroadcast(makeAlert());
    expect($event->broadcastOn())->toEqual([new Channel('alerts')])
        ->and($event->broadcastAs())->toBe('alert.updated')
        ->and($event->broadcastWith()['alert'])->toMatchArray(['hazard_type' => 'earthquake', 'verified' => true, 'is_drill' => false]);
});

it('dispatching an alert queues push, and SMS only when Semaphore is configured', function () {
    Bus::fake();
    AlertDispatcher::dispatch(makeAlert());
    Bus::assertDispatched(SendAlertPush::class);
    Bus::assertNotDispatched(SendAlertSms::class);

    config(['services.semaphore.key' => 'k']);
    AlertDispatcher::dispatch(makeAlert());
    Bus::assertDispatched(SendAlertSms::class);
});

it('sends Expo pushes in batches of 100 and logs delivery per user', function () {
    Http::fake(['exp.host/*' => Http::response(['data' => array_fill(0, 100, ['status' => 'ok'])])]);
    foreach (range(1, 150) as $i) {
        $u = User::forceCreate(['name' => "U{$i}", 'email' => "u{$i}@example.test", 'email_verified_at' => now()]);
        DB::table('device_tokens')->insert(['user_id' => $u->id, 'token' => "ExponentPushToken[{$i}]", 'platform' => 'android', 'created_at' => now(), 'updated_at' => now()]);
    }
    $alert = makeAlert(['is_drill' => true]);

    (new SendAlertPush($alert))->handle();

    Http::assertSentCount(2);
    Http::assertSent(fn ($req) => $req[0]['title'] === '[DRILL] EARTHQUAKE ALERT' && $req[0]['channelId'] === 'emergency' && $req[0]['priority'] === 'high');
    expect(DB::table('alert_notifications')->where(['alert_id' => $alert->id, 'channel' => 'push'])->count())->toBe(150);
});

it('marks push delivery failed when Expo rejects a token', function () {
    Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'error', 'message' => 'DeviceNotRegistered', 'details' => ['error' => 'DeviceNotRegistered']]]])]);
    $u = User::forceCreate(['name' => 'U', 'email' => 'u@example.test', 'email_verified_at' => now()]);
    DB::table('device_tokens')->insert(['user_id' => $u->id, 'token' => 'ExponentPushToken[x]', 'platform' => 'android', 'created_at' => now(), 'updated_at' => now()]);

    (new SendAlertPush($alert = makeAlert()))->handle();

    expect(DB::table('alert_notifications')->where('alert_id', $alert->id)->value('delivery_status'))->toBe('failed')
        ->and(DB::table('device_tokens')->count())->toBe(0); // dead token removed
});

it('sends SMS through Semaphore to users with a phone number', function () {
    config(['services.semaphore.key' => 'test-key', 'services.semaphore.sender' => 'EvacuAI']);
    Http::fake(['api.semaphore.co/*' => Http::response([['status' => 'Queued']])]);
    User::forceCreate(['name' => 'A', 'email' => 'a@example.test', 'phone' => '09171234567', 'email_verified_at' => now()]);
    User::forceCreate(['name' => 'B', 'email' => 'b@example.test', 'email_verified_at' => now()]);

    (new SendAlertSms($alert = makeAlert()))->handle();

    Http::assertSent(fn ($req) => $req['number'] === '09171234567' && str_contains($req['message'], 'EARTHQUAKE'));
    expect(DB::table('alert_notifications')->where(['alert_id' => $alert->id, 'channel' => 'sms'])->count())->toBe(1);
});

it('lists active alerts first, then recent history', function () {
    Sanctum::actingAs(User::forceCreate(['name' => 'S', 'email' => 's@example.test', 'email_verified_at' => now()]));
    makeAlert(['status' => 'resolved', 'issued_at' => now()->subHour()]);
    makeAlert(['hazard_type' => 'fire']);
    makeAlert(['status' => 'draft']);

    $res = $this->getJson('/api/alerts')->assertOk();
    expect($res->json('alerts'))->toHaveCount(2)
        ->and($res->json('alerts.0.hazard_type'))->toBe('fire')
        ->and($res->json('alerts.0.status'))->toBe('active');
});

it('registers and removes an Expo push token for the signed-in user', function () {
    $u = User::forceCreate(['name' => 'S', 'email' => 's@example.test', 'email_verified_at' => now()]);
    Sanctum::actingAs($u);
    $this->postJson('/api/devices', ['token' => 'ExponentPushToken[abc]', 'platform' => 'android'])->assertNoContent();
    $this->postJson('/api/devices', ['token' => 'ExponentPushToken[abc]', 'platform' => 'android'])->assertNoContent(); // idempotent
    expect(DB::table('device_tokens')->where('user_id', $u->id)->count())->toBe(1);
    $this->postJson('/api/devices', ['token' => 'not-a-token', 'platform' => 'android'])->assertUnprocessable();
    $this->deleteJson('/api/devices', ['token' => 'ExponentPushToken[abc]'])->assertNoContent();
    expect(DB::table('device_tokens')->count())->toBe(0);
});

it('exposes the realtime client config without secrets', function () {
    config(['reverb.apps.apps.0.key' => 'pub-key', 'reverb.apps.apps.0.secret' => 'top-secret']);
    $res = $this->getJson('/api/client-config')->assertOk();
    expect($res->json('reverb.key'))->toBe('pub-key')
        ->and($res->content())->not->toContain('top-secret');
});

it('puts rooms with verified hazards into the campus snapshot', function () {
    $u = User::forceCreate(['name' => 'S', 'email' => 's@example.test', 'email_verified_at' => now()]);
    DB::table('hazard_reports')->insert([
        ['reported_by' => $u->id, 'building_id' => 'DEMO', 'level' => 1, 'room_id' => 'DEMO/1/R101', 'hazard_type' => 'fire', 'status' => 'verified', 'created_at' => now(), 'updated_at' => now()],
        ['reported_by' => $u->id, 'building_id' => 'DEMO', 'level' => 2, 'room_id' => 'DEMO/2/R201', 'hazard_type' => 'fire', 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()],
    ]);
    Sanctum::actingAs($u);
    expect($this->getJson('/api/campus-snapshot')->json('hazardRoomIds'))->toBe(['DEMO/1/R101']);
});
