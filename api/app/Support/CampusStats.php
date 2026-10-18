<?php

namespace App\Support;

use App\Models\Alert;
use App\Models\EvacEdge;
use App\Models\HazardReport;
use App\Models\SosAlert;
use Illuminate\Support\Facades\DB;

/** Readiness numbers for officers (dashboard widget and Command Center), plus how the latest alert or drill went. */
class CampusStats
{
    /**
     * @return array{people: int, pending_reports: int, open_sos: int, blocked_paths: int, congested_paths: int,
     *     sos_response_seconds: ?float, feedback_average: ?float, feedback_count: int, latest: ?array<string, mixed>}
     */
    public static function overview(): array
    {
        $paths = EvacEdge::selectRaw('status, count(*) as n')->whereIn('status', ['blocked', 'congested'])->groupBy('status')->pluck('n', 'status');
        $feedback = DB::table('feedback')->selectRaw('avg(rating) as avg, count(*) as n')->first();
        $alert = Alert::current() ?? Alert::where('status', 'resolved')->latest('issued_at')->first();

        return [
            'people' => DrillStats::people()->count(),
            'pending_reports' => HazardReport::where('status', 'pending')->count(),
            'open_sos' => SosAlert::whereIn('status', SosAlert::OPEN)->count(),
            'blocked_paths' => (int) ($paths['blocked'] ?? 0),
            'congested_paths' => (int) ($paths['congested'] ?? 0),
            'sos_response_seconds' => DrillStats::averageResponse(SosAlert::where('created_at', '>=', now()->subDays(30))->get()),
            'feedback_average' => $feedback?->n ? round((float) $feedback->avg, 1) : null,
            'feedback_count' => (int) ($feedback->n ?? 0),
            'latest' => $alert ? ['alert' => self::label($alert), 'alert_id' => $alert->id] + DrillStats::for($alert) : null,
        ];
    }

    public static function label(Alert $alert): string
    {
        return ($alert->is_drill ? 'Drill' : 'Alert').' · '.str($alert->hazard_type)->replace('_', ' ')->title()
            .' · '.$alert->issued_at?->timezone(config('evacuai.timezone'))->format('M j, g:i A').($alert->status === 'active' ? ' (active)' : '');
    }
}
