<?php

namespace App\Support;

use App\Enums\Role;
use App\Jobs\SendOfficerPush;
use App\Models\Alert;
use App\Models\HazardReport;
use App\Models\User;
use App\Notifications\UnverifiedAlertRaised;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Manuscript rule, hardened: an incident counts as confirmed by reports when enough DISTINCT, verified, active
 * users report the same hazard on the same building floor within a short window.
 */
class ReportClusters
{
    /**
     * reporterCount() for every hazard/building/floor at once, keyed "hazard|building|level" (one query for a list).
     *
     * @return array<string, int>
     */
    public static function reporterCounts(): array
    {
        return HazardReport::query()
            ->join('users', 'users.id', '=', 'hazard_reports.reported_by')
            ->whereIn('hazard_reports.status', ['pending', 'verified'])
            ->where('hazard_reports.created_at', '>=', now()->subMinutes(config('evacuai.report_cluster_minutes')))
            ->whereNotNull('users.email_verified_at')
            ->where('users.is_active', true)
            ->groupBy('hazard_reports.hazard_type', 'hazard_reports.building_id', 'hazard_reports.level')
            ->selectRaw('hazard_reports.hazard_type, hazard_reports.building_id, hazard_reports.level, count(distinct hazard_reports.reported_by) as n')
            ->toBase()->get()
            ->mapWithKeys(fn ($r) => ["{$r->hazard_type}|{$r->building_id}|{$r->level}" => (int) $r->n])->all();
    }

    /** Distinct qualifying reporters for this hazard/building/floor in the current window. */
    public static function reporterCount(string $hazard, string $buildingId, int $level): int
    {
        return HazardReport::query()
            ->join('users', 'users.id', '=', 'hazard_reports.reported_by')
            ->where('hazard_reports.hazard_type', $hazard)
            ->where('hazard_reports.building_id', $buildingId)
            ->where('hazard_reports.level', $level)
            ->whereIn('hazard_reports.status', ['pending', 'verified'])
            ->where('hazard_reports.created_at', '>=', now()->subMinutes(config('evacuai.report_cluster_minutes')))
            ->whereNotNull('users.email_verified_at')
            ->where('users.is_active', true)
            ->distinct()
            ->count('hazard_reports.reported_by');
    }

    /**
     * Recent qualifying reports for an admin alert (any floor; campus-wide when $buildingId is null).
     *
     * @return Builder<HazardReport>
     */
    public static function recentReports(string $hazard, ?string $buildingId): Builder
    {
        return HazardReport::query()
            ->join('users', 'users.id', '=', 'hazard_reports.reported_by')
            ->where('hazard_reports.hazard_type', $hazard)
            ->when($buildingId, fn ($q) => $q->where('hazard_reports.building_id', $buildingId))
            ->whereIn('hazard_reports.status', ['pending', 'verified'])
            ->where('hazard_reports.created_at', '>=', now()->subMinutes(config('evacuai.report_cluster_minutes')))
            ->whereNotNull('users.email_verified_at')
            ->where('users.is_active', true)
            ->select('hazard_reports.*');
    }

    public static function recentReporterCount(?string $hazard, ?string $buildingId): int
    {
        return $hazard ? self::recentReports($hazard, $buildingId)->distinct()->count('hazard_reports.reported_by') : 0;
    }

    /** Called after each new report: auto-broadcasts one UNVERIFIED alert per incident and pages admins. */
    public static function evaluate(HazardReport $report): ?Alert
    {
        $since = now()->subMinutes(config('evacuai.report_cluster_minutes'));
        $count = self::reporterCount($report->hazard_type, $report->building_id, $report->level);
        if ($count < config('evacuai.report_cluster_threshold')) {
            return null;
        }

        $cluster = HazardReport::where([
            'hazard_type' => $report->hazard_type, 'building_id' => $report->building_id, 'level' => $report->level,
        ])->where('created_at', '>=', $since)->whereNull('alert_id');

        $existing = Alert::where(['source' => 'reports', 'hazard_type' => $report->hazard_type, 'building_id' => $report->building_id, 'status' => 'active'])
            ->where('issued_at', '>=', $since)->first();
        if ($existing) {
            $cluster->update(['alert_id' => $existing->id]);

            return null;
        }

        $building = DB::table('buildings')->where('id', $report->building_id)->value('name');
        $floor = DB::table('floors')->where(['building_id' => $report->building_id, 'level' => $report->level])->value('name') ?? "level {$report->level}";
        $hazard = str_replace('_', ' ', $report->hazard_type);

        $alert = Alert::create([
            'building_id' => $report->building_id,
            'hazard_type' => $report->hazard_type,
            'severity_level' => 'high',
            'message' => "Unverified: {$hazard} reported by {$count} people at {$building}, {$floor}. Move away from the area and follow safety officers.",
            'status' => 'active',
            'source' => 'reports',
            'verified' => false,
            'issued_at' => now(),
        ]);
        $cluster->update(['alert_id' => $alert->id]);

        AlertDispatcher::dispatch($alert);
        Notification::send(
            User::whereIn('role', [Role::Admin, Role::SafetyOfficer])->where('is_active', true)->get(),
            new UnverifiedAlertRaised($alert),
        );
        SendOfficerPush::forUnverifiedAlert($alert);

        return $alert;
    }
}
