<?php

use App\Models\Alert;
use App\Models\User;
use App\Support\DrillStats;
use Database\Seeders\CampusSeeder;
use Database\Seeders\DemoDrillSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

it('creates one verified demo account per role, idempotently', function () {
    $this->seed(DemoSeeder::class);
    $this->seed(DemoSeeder::class);

    expect(User::count())->toBe(5)
        ->and(User::pluck('role')->map->value->sort()->values()->all())
        ->toBe(['admin', 'faculty', 'safety_officer', 'staff', 'student'])
        ->and(User::whereNull('email_verified_at')->count())->toBe(0)
        ->and(Hash::check(DemoSeeder::PASSWORD, User::where('email', 'admin@evacuai.test')->value('password')))->toBeTrue();
});

it('refuses to create demo accounts in production', function () {
    app()->detectEnvironment(fn () => 'production');
    $this->artisan('db:seed', ['--class' => DemoSeeder::class, '--force' => true])->assertSuccessful();
    expect(User::count())->toBe(0);
});

it('adds one finished sample drill with check-ins, movement, an SOS and feedback', function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    $this->seed(DemoSeeder::class);
    $this->seed(DemoSeeder::class); // runs once

    $drill = Alert::where('external_id', DemoDrillSeeder::EXTERNAL_ID)->sole();
    expect($drill->status)->toBe('resolved')->and($drill->is_drill)->toBeTrue()
        ->and(DrillStats::for($drill))->toMatchArray(['safe' => 9, 'needs_help' => 1, 'unknown' => 5, 'sos' => 1]) // + student, faculty, staff
        ->and(DB::table('location_events')->where('alert_id', $drill->id)->count())->toBeGreaterThan(12)
        ->and(DB::table('feedback')->count())->toBe(3)
        ->and(DB::table('users')->where('email', 'like', 'sample%')->whereNotNull('password')->count())->toBe(0); // nobody can sign in as them
});
