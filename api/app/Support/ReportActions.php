<?php

namespace App\Support;

use App\Exceptions\InvalidState;
use App\Models\HazardReport;
use App\Models\User;

/** Officer review of hazard reports, shared by the officer API and the admin panel. */
class ReportActions
{
    public static function verify(HazardReport $report, User $by): HazardReport
    {
        self::expect($report->status === 'pending', 'Only pending reports can be verified.');
        $report->update(['status' => 'verified', 'verified_by' => $by->id]);

        return $report;
    }

    public static function dismiss(HazardReport $report, User $by): HazardReport
    {
        self::expect(in_array($report->status, ['pending', 'verified'], true), 'Only open reports can be dismissed.');
        $report->update(['status' => 'dismissed', 'verified_by' => $by->id]);

        return $report;
    }

    public static function resolve(HazardReport $report): HazardReport
    {
        self::expect($report->status === 'verified', 'Only verified reports can be resolved.');
        $report->update(['status' => 'resolved', 'resolved_at' => now()]);

        return $report;
    }

    private static function expect(bool $ok, string $message): void
    {
        if (! $ok) {
            throw new InvalidState($message);
        }
    }
}
