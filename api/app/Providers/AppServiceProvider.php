<?php

namespace App\Providers;

use App\Support\Activity;
use Filament\Support\Facades\FilamentTimezone;
use Illuminate\Auth\Events\Login;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        FilamentTimezone::set(config('evacuai.timezone')); // admin tables show campus time; the DB stays in UTC

        // Admin-panel sign-ins (session). App sign-ins are logged by the API, which issues tokens without this event.
        Event::listen(Login::class, fn (Login $e) => Activity::log('login', ['method' => 'admin_panel'], (int) $e->user->getAuthIdentifier()));
    }
}
