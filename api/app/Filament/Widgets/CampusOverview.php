<?php

namespace App\Filament\Widgets;

use App\Models\Alert;
use App\Models\EvacEdge;
use App\Models\HazardReport;
use App\Models\SosAlert;
use App\Support\DrillStats;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;
use Illuminate\Support\Facades\DB;

/** Dashboard: readiness now, plus how the latest alert or drill went. */
class CampusOverview extends StatsOverviewWidget
{
    protected ?string $pollingInterval = '10s';

    protected static ?int $sort = -1;

    protected static bool $isLazy = false; // the first thing officers look at: render with the page

    protected function getStats(): array
    {
        $alert = Alert::current() ?? Alert::whereIn('status', ['resolved'])->latest('issued_at')->first();
        $paths = EvacEdge::selectRaw('status, count(*) as n')->whereIn('status', ['blocked', 'congested'])->groupBy('status')->pluck('n', 'status');
        $feedback = DB::table('feedback')->selectRaw('avg(rating) as avg, count(*) as n')->first();
        $sos30 = SosAlert::where('created_at', '>=', now()->subDays(30))->get();

        $stats = [
            Stat::make('Registered people', DrillStats::people()->count())->description('Students, faculty and staff'),
            Stat::make('Pending hazard reports', HazardReport::where('status', 'pending')->count())->color('warning'),
            Stat::make('Open SOS', SosAlert::whereIn('status', SosAlert::OPEN)->count())->color('danger'),
            Stat::make('Blocked / congested paths', ((int) ($paths['blocked'] ?? 0)).' / '.((int) ($paths['congested'] ?? 0))),
            Stat::make('SOS response (30 days)', DrillStats::duration(DrillStats::averageResponse($sos30)))
                ->description('Average time until an officer acknowledges'),
            Stat::make('Feedback', $feedback?->n ? round((float) $feedback->avg, 1).' / 5' : '—')->description(($feedback->n ?? 0).' responses'),
        ];

        if ($alert) {
            $s = DrillStats::for($alert);
            $label = ($alert->is_drill ? 'Drill' : 'Alert').' · '.str($alert->hazard_type)->replace('_', ' ')->title()
                .' · '.$alert->issued_at?->timezone(config('evacuai.timezone'))->format('M j, g:i A').($alert->status === 'active' ? ' (active)' : '');
            $stats[] = Stat::make('Checked in', "{$s['safe']} safe · {$s['needs_help']} need help · {$s['unknown']} unknown")
                ->description("{$s['check_in_rate']}% checked in — {$label}");
            $stats[] = Stat::make('Evacuation time (median)', DrillStats::duration($s['median_minutes'] === null ? null : $s['median_minutes'] * 60))
                ->description('Slowest: '.DrillStats::duration($s['slowest_minutes'] === null ? null : $s['slowest_minutes'] * 60).' — alert to check-in');
        }

        return $stats;
    }
}
