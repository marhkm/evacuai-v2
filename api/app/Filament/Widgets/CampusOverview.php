<?php

namespace App\Filament\Widgets;

use App\Support\CampusStats;
use App\Support\DrillStats;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

/** Dashboard: readiness now, plus how the latest alert or drill went. */
class CampusOverview extends StatsOverviewWidget
{
    protected ?string $pollingInterval = '10s';

    protected static ?int $sort = -1;

    protected static bool $isLazy = false; // the first thing officers look at: render with the page

    protected function getStats(): array
    {
        $o = CampusStats::overview();
        $stats = [
            Stat::make('Registered people', $o['people'])->description('Students, faculty and staff'),
            Stat::make('Pending hazard reports', $o['pending_reports'])->color('warning'),
            Stat::make('Open SOS', $o['open_sos'])->color('danger'),
            Stat::make('Blocked / congested paths', "{$o['blocked_paths']} / {$o['congested_paths']}"),
            Stat::make('SOS response (30 days)', DrillStats::duration($o['sos_response_seconds']))
                ->description('Average time until an officer acknowledges'),
            Stat::make('Feedback', $o['feedback_average'] !== null ? "{$o['feedback_average']} / 5" : '—')->description("{$o['feedback_count']} responses"),
        ];

        if ($s = $o['latest']) {
            $stats[] = Stat::make('Checked in', "{$s['safe']} safe · {$s['needs_help']} need help · {$s['unknown']} unknown")
                ->description("{$s['check_in_rate']}% checked in — {$s['alert']}");
            $stats[] = Stat::make('Evacuation time (median)', DrillStats::duration($s['median_minutes'] === null ? null : $s['median_minutes'] * 60))
                ->description('Slowest: '.DrillStats::duration($s['slowest_minutes'] === null ? null : $s['slowest_minutes'] * 60).' — alert to check-in');
        }

        return $stats;
    }
}
