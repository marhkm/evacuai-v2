<?php

namespace App\Providers;

use App\Support\Activity;
use App\Support\PlaceDirectory;
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
        $this->app->scoped(PlaceDirectory::class); // campus names cached per request / queued job
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        FilamentTimezone::set(config('evacuai.timezone')); // admin tables show campus time; the DB stays in UTC

        // Session sign-ins (admin panel, Command Center). App sign-ins are logged by the API, which issues tokens without this event.
        Event::listen(Login::class, fn (Login $e) => Activity::log('login', ['method' => request()->is('command/*') ? 'command' : 'admin_panel'], (int) $e->user->getAuthIdentifier()));
    }
}
