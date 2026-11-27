<?php

namespace App\Support;

use App\Models\Feedback;
use App\Models\HazardReport;
use App\Models\SosAlert;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

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
            // New open SOS, plus the sender's chat messages on open SOS this officer has not seen.
            'sos' => SosAlert::whereIn('status', SosAlert::OPEN)->where('created_at', '>', $since('sos'))->count()
                + array_sum(self::sosMessages($officer)),
            'reports' => HazardReport::where('created_at', '>', $since('reports'))->count(),
            'feedback' => Feedback::where('created_at', '>', $since('feedback'))->count(),
        ];
    }

    public static function mark(User $officer, string $tab): void
    {
        $officer->forceFill(['tabs_seen_at' => [$tab => now()->toIso8601String()] + ($officer->tabs_seen_at ?? [])])->save();
    }

    /**
     * Per open SOS, the sender's messages newer than the last one this officer saw (closed SOS never count).
     *
     * @return array<int, int> SOS id => count
     */
    public static function sosMessages(User $officer): array
    {
        return DB::table('sos_messages as m')
            ->join('sos_alerts as s', fn ($j) => $j->on('s.id', '=', 'm.sos_alert_id')->on('m.sender_id', '=', 's.user_id'))
            ->leftJoin('sos_seen as v', fn ($j) => $j->on('v.sos_alert_id', '=', 's.id')->where('v.user_id', $officer->id))
            ->whereIn('s.status', SosAlert::OPEN)
            ->whereRaw('m.id > coalesce(v.message_id, 0)')
            ->groupBy('s.id')->selectRaw('s.id, count(*) as n')
            ->pluck('n', 'id')->map(fn ($n) => (int) $n)->all();
    }

    /** The officer has seen the SOS chat up to its latest message. */
    public static function markSos(User $officer, SosAlert $sos): void
    {
        DB::table('sos_seen')->upsert([[
            'user_id' => $officer->id, 'sos_alert_id' => $sos->id, 'message_id' => (int) $sos->messages()->max('id'),
        ]], ['user_id', 'sos_alert_id'], ['message_id']);
    }
}
