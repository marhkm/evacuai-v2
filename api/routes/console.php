<?php

use App\Models\Alert;
use App\Support\Feeds;
use Illuminate\Support\Carbon;
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
    $alerts = Feeds::poll();
    $live = count(array_filter($alerts, fn (Alert $a) => $a->status === 'active'));
    $this->info(($live ? "{$live} earthquake alert(s) broadcast, " : '').(count($alerts) - $live).' new draft alert(s).');
})->purpose('Check PHIVOLCS/USGS earthquakes, rainfall and PAGASA signals near campus; broadcast fresh quakes, draft the rest');

// Every minute: a nearby quake is pushed within about a minute of the agency listing it (docs/quake-latency.md).
Schedule::command('evacuai:poll-feeds')->everyMinute()->withoutOverlapping()->when(fn () => config('evacuai.feeds.enabled'));

Artisan::command('evacuai:quake-latency {--limit=20}', function () {
    $tz = config('evacuai.timezone');
    $at = fn ($t) => $t ? Carbon::parse($t)->timezone($tz)->format('Y-m-d H:i:s') : '-';
    $secs = fn ($from, $to) => $from && $to ? (int) Carbon::parse($from)->diffInSeconds(Carbon::parse($to)) : '-';
    $rows = Alert::where('source', 'feed')->where('hazard_type', 'earthquake')->whereNotNull('occurred_at')
        ->addSelect(['pushed_at' => DB::table('alert_notifications')->selectRaw('min(sent_at)') // when Expo accepted the first push
            ->whereColumn('alert_id', 'alerts.id')->where('channel', 'push')])
        ->latest('id')->limit((int) $this->option('limit'))->get()
        ->map(fn (Alert $a) => [$a->id, $a->external_id, $at($a->occurred_at), $at($a->created_at), $at($a->pushed_at),
            $secs($a->occurred_at, $a->created_at), $secs($a->created_at, $a->pushed_at), $secs($a->occurred_at, $a->pushed_at)]);
    $this->table(['Alert', 'Feed id', 'Quake (origin)', 'Alert created', 'Push to Expo', 'Quake → alert (s)', 'Alert → push (s)', 'Quake → push (s)'], $rows);
})->purpose('Earthquake alert latency: quake origin time → EvacuAI alert → push handed to Expo (docs/quake-latency.md)');
