<?php

namespace App\Support;

use App\Models\Feedback;
use App\Models\HazardReport;
use App\Models\SosAlert;
use App\Models\User;
use Illuminate\Support\Carbon;

/** What each officer has not seen yet on the SOS, Reports and Feedback tabs (the Command Center's live badges). */
class Unseen
{
    public const TABS = ['sos', 'reports', 'feedback'];

    /** @return array{sos: int, reports: int, feedback: int} */
    public static function counts(User $officer): array
    {
        // Bindings are written without a zone and the columns hold UTC, so compare in UTC (Manila midnight is 16:00 UTC).
        $since = fn (string $tab) => (isset($officer->tabs_seen_at[$tab])
            ? Carbon::parse($officer->tabs_seen_at[$tab])
            : now(config('evacuai.timezone'))->startOfDay())->utc(); // never opened: everything from today (Manila)

        return [
            'sos' => SosAlert::where('created_at', '>', $since('sos'))->count(),
            'reports' => HazardReport::where('created_at', '>', $since('reports'))->count(),
            'feedback' => Feedback::where('created_at', '>', $since('feedback'))->count(),
        ];
    }

    public static function mark(User $officer, string $tab): void
    {
        $officer->forceFill(['tabs_seen_at' => [$tab => now()->toIso8601String()] + ($officer->tabs_seen_at ?? [])])->save();
    }
}
