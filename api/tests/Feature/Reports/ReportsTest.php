<?php

use App\Enums\Role;
use App\Events\AlertBroadcast;
use App\Events\SosUpdated;
use App\Filament\Resources\ActivityLogs\ActivityLogResource;
use App\Filament\Resources\Feedback\Pages\ListFeedback;
use App\Filament\Widgets\CampusOverview;
use App\Models\Alert;
use App\Models\Feedback;
use App\Models\SosAlert;
use App\Models\User;
use App\Support\DrillReport;
use App\Support\DrillStats;
use Database\Seeders\CampusSeeder;
use Filament\Auth\Pages\Login;
use Filament\Pages\Dashboard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Livewire\Livewire;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Event::fake([AlertBroadcast::class, SosUpdated::class]);
    $this->admin = User::forceCreate(['name' => 'Admin', 'email' => 'admin@example.test', 'role' => Role::Admin, 'email_verified_at' => now()]);
    $this->officer = User::forceCreate(['name' => 'Officer', 'email' => 'so@example.test', 'role' => Role::SafetyOfficer, 'email_verified_at' => now()]);
});

/** Drill issued at 08:00; Ana safe after 3 min, Ben after 7 min, Cy needs help, Di never checks in; one SOS acknowledged after 40 s. */
function drill(): Alert
{
    $alert = Alert::create(['hazard_type' => 'earthquake', 'severity_level' => 'high', 'message' => 'Drill', 'is_drill' => true, 'issued_at' => now()->setTime(8, 0)]);
    $t = fn (int $min) => $alert->issued_at->copy()->addMinutes($min);
    foreach ([['=Ana', 'safe', 3], ['Ben', 'safe', 7], ['Cy', 'needs_help', 5], ['Di', null, null]] as [$name, $status, $min]) {
        $u = User::forceCreate(['name' => $name, 'email' => strtolower(trim($name, '=')).'@example.test', 'department' => 'CCS']);
        if ($status) {
            DB::table('evacuation_logs')->insert(['user_id' => $u->id, 'alert_id' => $alert->id, 'status' => $status,
                'assembly_node_id' => $status === 'safe' ? 'DEMO/1/AP' : null, 'checked_in_at' => $t($min)]);
        }
    }
    $sos = SosAlert::create(['user_id' => User::where('name', 'Cy')->value('id'), 'alert_id' => $alert->id]);
    $sos->forceFill(['created_at' => $t(5), 'acknowledged_at' => $t(5)->addSeconds(40), 'status' => 'acknowledged'])->save();

    return $alert;
}

it('computes drill metrics: check-in rate, median and slowest evacuation time, SOS response', function () {
    $s = DrillStats::for(drill());

    expect($s)->toMatchArray([
        'people' => 4, 'safe' => 2, 'needs_help' => 1, 'unknown' => 1, 'check_in_rate' => 75.0,
        'median_minutes' => 5.0, 'slowest_minutes' => 7.0, 'sos' => 1, 'sos_response_seconds' => 40.0,
    ]); // officers are not counted as people
});

it('shows the overview on the dashboard', function () {
    drill();
    $this->actingAs($this->officer);
    Livewire::test(CampusOverview::class)
        ->assertSee('2 safe · 1 need help · 1 unknown')
        ->assertSee('75% checked in')
        ->assertSee('5 min')
        ->assertSee('40 s');
    $this->get(Dashboard::getUrl())->assertOk();
});

it('exports a CSV drill report for officers only, safe against spreadsheet formulas', function () {
    $alert = drill();
    $url = route('reports.drill', $alert);

    $this->get($url)->assertForbidden();
    $this->actingAs(User::where('name', 'Ben')->first())->get($url)->assertForbidden();

    $csv = $this->actingAs($this->officer)->get($url)->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8')->streamedContent();
    expect($csv)->toStartWith("\u{FEFF}\"EvacuAI drill report\"") // BOM: Excel reads it as UTF-8
        ->toContain('"Check-in rate (%)",75')
        ->toContain('"Median evacuation time (min)",5')
        ->toContain("'=Ana,student,CCS,safe,\"Demo Building · Ground · AP\"")
        ->toContain('Di,student,CCS,unknown')
        ->not->toContain('Officer');
    expect(DrillReport::cell('-5'))->toBe('-5')->and(DrillReport::cell('@SUM(A1)'))->toBe("'@SUM(A1)");
});

it('accepts feedback from the app and lists it for officers with the average', function () {
    Sanctum::actingAs(User::forceCreate(['name' => 'Juan', 'email' => 'j@example.test']));
    $this->postJson('/api/feedback', ['rating' => 6])->assertJsonValidationErrors('rating');
    $this->postJson('/api/feedback', ['rating' => 4, 'comments' => 'Route was clear'])->assertCreated();
    Feedback::create(['user_id' => $this->officer->id, 'rating' => 5]);

    $this->actingAs($this->officer);
    Livewire::test(ListFeedback::class)->assertSee('Route was clear')->assertSee('Average rating 4.5 / 5 from 2 responses');
});

it('records an audit trail and shows it to admins only', function () {
    $user = User::forceCreate(['name' => 'Juan', 'email' => 'j@example.test', 'password' => 'secret-pass', 'email_verified_at' => now()]);
    $this->postJson('/api/auth/login', ['email' => 'j@example.test', 'password' => 'secret-pass', 'device_name' => 'test'])->assertOk();
    $this->actingAs($this->admin);
    $user->forceFill(['role' => Role::SafetyOfficer])->save();

    expect(DB::table('user_activity_logs')->pluck('activity_type')->all())->toContain('login', 'role_changed');
    $login = DB::table('user_activity_logs')->where('activity_type', 'login')->first();
    expect($login->user_id)->toBe($user->id)->and($login->ip_address)->toBe('127.0.0.1');

    $this->get(ActivityLogResource::getUrl())->assertOk()->assertSee('Role changed')->assertSee('to: safety_officer');

    auth()->logout();
    Livewire::test(Login::class)->fillForm(['email' => 'j@example.test', 'password' => 'secret-pass'])->call('authenticate');
    expect(DB::table('user_activity_logs')->where('activity_type', 'login')->whereJsonContains('details->method', 'admin_panel')->exists())->toBeTrue();
    $this->actingAs($this->officer)->get(ActivityLogResource::getUrl())->assertForbidden();
});

it('purges IP addresses and location events after the retention period', function () {
    $user = User::forceCreate(['name' => 'Juan', 'email' => 'j@example.test']);
    DB::table('user_activity_logs')->insert([
        ['activity_type' => 'login', 'ip_address' => '10.0.0.1', 'device_info' => 'old', 'created_at' => now()->subDays(31)],
        ['activity_type' => 'login', 'ip_address' => '10.0.0.2', 'device_info' => 'new', 'created_at' => now()->subDays(2)],
    ]);
    DB::table('location_events')->insert([
        ['user_id' => $user->id, 'source' => 'qr', 'confidence' => 'exact', 'created_at' => now()->subDays(31)],
        ['user_id' => $user->id, 'source' => 'qr', 'confidence' => 'exact', 'created_at' => now()->subDays(2)],
    ]);

    $this->artisan('evacuai:purge-personal-data')->assertSuccessful();

    expect(DB::table('user_activity_logs')->whereNotNull('ip_address')->pluck('ip_address')->all())->toBe(['10.0.0.2'])
        ->and(DB::table('user_activity_logs')->count())->toBe(2)
        ->and(DB::table('location_events')->count())->toBe(1);
});
