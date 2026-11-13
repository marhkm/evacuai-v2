<?php

namespace App\Support;

use App\Events\CampusChanged;
use App\Events\ReportSubmitted;
use App\Models\Alert;
use App\Models\HazardReport;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * When reports are independent evidence, and when they verify themselves. Independent: different students, different
 * photos (not a duplicate of an earlier one), nobody flagged for false reports. Auto-verify also needs the local AI to
 * agree on at least one photo; the AI alone never decides. Officers can always verify or reject.
 */
class ReportVerification
{
    public const FLAG_AFTER = 3; // false reports...

    public const FLAG_DAYS = 30; // ...within this many days

    /** Independent reports needed (admin's Report rules page, else config). */
    public static function threshold(): int
    {
        return (int) (self::setting('report_cluster_threshold') ?? config('evacuai.report_cluster_threshold'));
    }

    /** Minutes the reports must fall within. */
    public static function minutes(): int
    {
        return (int) (self::setting('report_cluster_minutes') ?? config('evacuai.report_cluster_minutes'));
    }

    /** @return Collection<int, int> students with 3+ reports rejected as false in 30 days (after an admin's last clear) */
    public static function flaggedIds(): Collection
    {
        return DB::table('hazard_reports as r')->join('users as u', 'u.id', '=', 'r.reported_by')
            ->where('r.dismiss_reason', 'false')->where('r.updated_at', '>=', now()->subDays(self::FLAG_DAYS))
            ->where(fn ($q) => $q->whereNull('u.false_reports_cleared_at')->orWhereColumn('r.updated_at', '>', 'u.false_reports_cleared_at'))
            ->groupBy('r.reported_by')->havingRaw('count(*) >= ?', [self::FLAG_AFTER])
            ->pluck('r.reported_by')->map(fn ($id) => (int) $id);
    }

    public static function flagged(User|int $user): bool
    {
        return self::flaggedIds()->contains($user instanceof User ? $user->id : $user);
    }

    /**
     * Only independent evidence: no re-sent photos, no flagged reporters (on a query joined with `users`).
     *
     * @param  Builder<HazardReport>  $query
     * @return Builder<HazardReport>
     */
    public static function independentOnly(Builder $query): Builder
    {
        return $query->whereNull('hazard_reports.duplicate_of')->whereNotIn('hazard_reports.reported_by', self::flaggedIds());
    }

    /**
     * Verifies the report's cluster (same hazard, building and floor, within the window), only during an officer's
     * alert, when enough different students who were last seen on that floor sent different photos, and the AI says
     * yes to at least two of them (and more yes than no). A group an officer already cleared stays cleared.
     */
    public static function evaluate(HazardReport $report): bool
    {
        if (! Alert::where('status', 'active')->where('verified', true)->exists()) {
            return false; // outside an incident, students alone never put a hazard on the maps
        }
        $since = now()->subMinutes(self::minutes());
        if (self::sameHazard(HazardReport::query(), $report)->where(['status' => 'dismissed', 'auto_verified' => true])->where('created_at', '>=', $since)->exists()) {
            return false; // an officer rejected this group: only an officer verifies it now
        }
        $reports = self::independentOnly(self::sameHazard(HazardReport::query(), $report)
            ->join('users', 'users.id', '=', 'hazard_reports.reported_by')
            ->whereIn('hazard_reports.status', ['pending', 'verified'])
            ->where('hazard_reports.reporter_place', 'match')
            ->where('hazard_reports.created_at', '>=', $since)
            ->whereNotNull('users.email_verified_at')->where('users.is_active', true))
            ->get(['hazard_reports.id', 'hazard_reports.reported_by', 'hazard_reports.status', 'hazard_reports.ai_verdict']);

        $pending = $reports->where('status', 'pending')->pluck('id');
        $yes = $reports->where('ai_verdict', 'match')->count();
        if ($pending->isEmpty() || $reports->unique('reported_by')->count() < self::threshold() || $yes < 2 || $yes <= $reports->where('ai_verdict', 'no_match')->count()) {
            return false;
        }

        HazardReport::whereIn('id', $pending)->update(['status' => 'verified', 'auto_verified' => true, 'updated_at' => now()]);
        Activity::log('reports_auto_verified', ['report_ids' => $pending->all(), 'hazard' => $report->hazard_type]);
        rescue(fn () => event(new CampusChanged)); // the mass update skips model events: maps and routes refresh now
        rescue(fn () => event(new ReportSubmitted($report->fresh() ?? $report))); // officers' lists and badges update

        return true;
    }

    /**
     * An officer dismissed or rejected one auto-verified report: the rest of its group comes off the maps too, as a
     * plain dismiss, so it never counts against the other students.
     */
    public static function clearGroup(HazardReport $report, int $officerId): void
    {
        if (! $report->auto_verified) {
            return;
        }
        self::sameHazard(HazardReport::query(), $report)->whereKeyNot($report->id)
            ->where(['status' => 'verified', 'auto_verified' => true])
            ->update(['status' => 'dismissed', 'dismiss_reason' => 'other', 'verified_by' => $officerId, 'updated_at' => now()]);
    }

    /**
     * @param  Builder<HazardReport>  $query
     * @return Builder<HazardReport>
     */
    private static function sameHazard(Builder $query, HazardReport $report): Builder
    {
        return $query->where(['hazard_reports.hazard_type' => $report->hazard_type, 'hazard_reports.building_id' => $report->building_id, 'hazard_reports.level' => $report->level]);
    }

    private static function setting(string $key): mixed
    {
        $value = DB::table('system_configurations')->where('key', $key)->value('value');

        return $value === null ? null : json_decode((string) $value);
    }
}
