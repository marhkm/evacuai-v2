<?php

use App\Support\Feeds;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Storage;

Artisan::command('evacuai:purge-personal-data', function () {
    $days = config('evacuai.retention_days');
    $before = now()->subDays($days);
    $logs = DB::table('user_activity_logs')->where('created_at', '<', $before)
        ->where(fn ($q) => $q->whereNotNull('ip_address')->orWhereNotNull('device_info'))
        ->update(['ip_address' => null, 'device_info' => null]);
    $locations = DB::table('location_events')->where('created_at', '<', $before)->delete();
    // Photos may show people: removed once the report is closed and older than the retention period.
    $photos = DB::table('hazard_reports')->whereIn('status', ['resolved', 'dismissed'])->where('updated_at', '<', $before)->whereNotNull('photo_path');
    Storage::disk('local')->delete($photos->pluck('photo_path')->all());
    $photoCount = $photos->update(['photo_path' => null]);
    $this->info("Older than {$days} days: cleared IP/device on {$logs} activity rows, deleted {$locations} location events and {$photoCount} report photos.");
})->purpose('Data Privacy Act retention: clear IP/device and delete location events past the retention period');

Schedule::command('evacuai:purge-personal-data')->dailyAt('02:00');

Artisan::command('evacuai:poll-feeds', function () {
    $drafts = Feeds::poll();
    $this->info(count($drafts).' new draft alert(s).');
})->purpose('Check USGS earthquakes and Open-Meteo rainfall near campus; create draft alerts for officers to review');

Schedule::command('evacuai:poll-feeds')->everyFiveMinutes()->withoutOverlapping()->when(fn () => config('evacuai.feeds.enabled'));
