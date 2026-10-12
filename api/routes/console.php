<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Artisan::command('evacuai:purge-personal-data', function () {
    $days = config('evacuai.retention_days');
    $before = now()->subDays($days);
    $logs = DB::table('user_activity_logs')->where('created_at', '<', $before)
        ->where(fn ($q) => $q->whereNotNull('ip_address')->orWhereNotNull('device_info'))
        ->update(['ip_address' => null, 'device_info' => null]);
    $locations = DB::table('location_events')->where('created_at', '<', $before)->delete();
    $this->info("Older than {$days} days: cleared IP/device on {$logs} activity rows, deleted {$locations} location events.");
})->purpose('Data Privacy Act retention: clear IP/device and delete location events past the retention period');

Schedule::command('evacuai:purge-personal-data')->dailyAt('02:00');
