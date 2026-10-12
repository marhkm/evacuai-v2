<?php

namespace App\Support;

use App\Models\Alert;
use App\Models\EvacuationLog;
use App\Models\SosAlert;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/** Evacuation metrics for one alert (drill or real), shared by the dashboard and the CSV drill report. */
class DrillStats
{
    /** @return Builder<User> People expected to evacuate; officers are responders and are not counted. */
    public static function people(): Builder
    {
        return User::query()->where('users.is_active', true)->whereNotIn('users.role', ['admin', 'safety_officer']);
    }

    /**
     * @return array{people: int, safe: int, needs_help: int, unknown: int, check_in_rate: float,
     *               median_minutes: ?float, slowest_minutes: ?float, sos: int, sos_response_seconds: ?float}
     */
    public static function for(Alert $alert): array
    {
        $people = self::people()->count();
        $logs = EvacuationLog::where('alert_id', $alert->id)->whereIn('user_id', self::people()->select('users.id'))->get();
        $safe = $logs->where('status', 'safe');
        $minutes = $alert->issued_at
            ? $safe->map(fn (EvacuationLog $l) => max(0, $alert->issued_at->diffInSeconds($l->checked_in_at)) / 60)->sort()->values()
            : collect();
        $sos = SosAlert::where('alert_id', $alert->id)->get();

        return [
            'people' => $people,
            'safe' => $safe->count(),
            'needs_help' => $logs->where('status', 'needs_help')->count(),
            'unknown' => max(0, $people - $logs->count()),
            'check_in_rate' => $people ? round(100 * $logs->count() / $people, 1) : 0.0,
            'median_minutes' => $minutes->isEmpty() ? null : round((float) $minutes->median(), 1),
            'slowest_minutes' => $minutes->isEmpty() ? null : round((float) $minutes->last(), 1),
            'sos' => $sos->count(),
            'sos_response_seconds' => self::averageResponse($sos),
        ];
    }

    /** @param iterable<SosAlert> $sos Mean seconds from SOS sent to an officer acknowledging it. */
    public static function averageResponse(iterable $sos): ?float
    {
        $seconds = collect($sos)->filter(fn (SosAlert $s) => $s->acknowledged_at !== null)
            ->map(fn (SosAlert $s) => $s->created_at->diffInSeconds($s->acknowledged_at));

        return $seconds->isEmpty() ? null : round((float) $seconds->avg());
    }

    public static function duration(?float $seconds): string
    {
        return match (true) {
            $seconds === null => '—',
            $seconds < 90 => round($seconds).' s',
            default => round($seconds / 60, 1).' min',
        };
    }
}
