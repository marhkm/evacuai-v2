<?php

use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
