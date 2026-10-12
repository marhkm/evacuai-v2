<?php

use App\Enums\Role;
use App\Events\AlertBroadcast;
use App\Events\CampusChanged;
use App\Events\SosUpdated;
use App\Jobs\SendAlertPush;
use App\Models\Alert;
use App\Models\EvacEdge;
use App\Models\SosAlert;
use App\Models\User;
use App\Notifications\SosRaised;
use App\Support\DrillStats;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Event::fake([AlertBroadcast::class, CampusChanged::class, SosUpdated::class]);
    Bus::fake([SendAlertPush::class]);
    Notification::fake();
    $this->officer = User::forceCreate(['name' => 'Officer', 'email' => 'so@example.test', 'role' => Role::SafetyOfficer, 'email_verified_at' => now()]);
});

it('runs a drill: broadcast, movement, check-ins, one SOS, then resolves it', function () {
    $this->artisan('evacuai:simulate', ['scenario' => 'drill', '--people' => 6, '--seconds' => 20])->assertSuccessful();

    $alert = Alert::sole();
    expect($alert->is_drill)->toBeTrue()->and($alert->status)->toBe('resolved')
        ->and(DrillStats::for($alert))->toMatchArray(['people' => 6, 'safe' => 4, 'needs_help' => 1, 'unknown' => 1, 'sos' => 1])
        ->and(DB::table('location_events')->where('alert_id', $alert->id)->count())->toBe(12);
    Event::assertDispatched(AlertBroadcast::class);
    Notification::assertSentTo($this->officer, SosRaised::class);
})->group('slow');

it('makes three people report one hazard, which broadcasts an unverified alert', function () {
    $this->artisan('evacuai:simulate', ['scenario' => 'reports', '--hazard' => 'flood'])->assertSuccessful();
    expect(Alert::sole())->verified->toBeFalse()->hazard_type->toBe('flood')->source->toBe('reports');
})->group('slow');

it('sends an SOS, blocks and reopens a stair, and creates feed drafts', function () {
    $this->artisan('evacuai:simulate', ['scenario' => 'sos'])->assertSuccessful();
    expect(SosAlert::whereIn('status', SosAlert::OPEN)->count())->toBe(1);
    Notification::assertSentTo($this->officer, SosRaised::class);

    $this->artisan('evacuai:simulate', ['scenario' => 'block'])->assertSuccessful();
    expect(EvacEdge::where('status', 'blocked')->where('type', 'stairs')->count())->toBe(1);
    $this->artisan('evacuai:simulate', ['scenario' => 'reopen'])->assertSuccessful();
    expect(EvacEdge::where('status', 'blocked')->count())->toBe(0);

    $this->artisan('evacuai:simulate', ['scenario' => 'feed'])->assertSuccessful();
    expect(Alert::where('status', 'draft')->count())->toBe(2);

    $this->artisan('evacuai:simulate', ['scenario' => 'nope'])->assertFailed();
});

it('refuses to run in production', function () {
    app()->detectEnvironment(fn () => 'production');
    $this->artisan('evacuai:simulate', ['scenario' => 'sos'])->assertFailed();
    expect(SosAlert::count())->toBe(0);
});
