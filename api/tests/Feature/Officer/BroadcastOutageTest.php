<?php

use App\Enums\Role;
use App\Models\Alert;
use App\Models\EvacuationLog;
use App\Models\HazardReport;
use Database\Seeders\CampusSeeder;
use Illuminate\Broadcasting\BroadcastManager;
use Illuminate\Contracts\Broadcasting\Factory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Notification::fake();
    // Reverb unreachable: nothing listens on port 1.
    config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'k', 'broadcasting.connections.reverb.secret' => 's',
        'broadcasting.connections.reverb.app_id' => '1', 'broadcasting.connections.reverb.options.host' => '127.0.0.1',
        'broadcasting.connections.reverb.options.port' => 1, 'broadcasting.connections.reverb.options.scheme' => 'http']);
    app()->forgetInstance(BroadcastManager::class);
    app()->forgetInstance(Factory::class);
    Sanctum::actingAs($this->student = officerUser(Role::Student));
});

it('still checks students in when the realtime server is down', function () {
    Alert::withoutEvents(fn () => Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Fire', 'status' => 'active', 'issued_at' => now()]));

    $this->postJson('/api/check-in', ['status' => 'safe'])->assertOk();
    expect(EvacuationLog::where('user_id', $this->student->id)->exists())->toBeTrue();
});

it('still accepts hazard reports when the realtime server is down', function () {
    $this->postJson('/api/hazard-reports', ['hazard_type' => 'fire', 'building_id' => 'DEMO', 'level' => 1])->assertCreated();
    expect(HazardReport::count())->toBe(1);
});
