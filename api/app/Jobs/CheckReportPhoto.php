<?php

namespace App\Jobs;

use App\Models\HazardReport;
use App\Support\ReportPhotoCheck;
use App\Support\ReportVerification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * The photo check in the background, for reports whose check did not finish while they were sent (AI busy or down).
 * Advice for officers and one of the auto-verify conditions; never a decision on its own.
 */
class CheckReportPhoto implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 75; // under the queue's retry_after (90), or a second worker could start the same check

    public bool $deleteWhenMissingModels = true; // the report was deleted: nothing to check

    /** On the "ai" queue (its own worker): a slow photo check must never hold up an alert push. */
    public function __construct(public HazardReport $report)
    {
        $this->onQueue('ai');
    }

    /** Killed, timed out or crashed: officers see "AI: not available" instead of no label at all. */
    public function failed(?Throwable $e): void
    {
        $this->report->updateQuietly(['ai_verdict' => 'unavailable']);
    }

    public function handle(): void
    {
        $r = $this->report->fresh() ?? $this->report;
        [$verdict, $note] = ReportPhotoCheck::ask($r->hazard_type, $r->photo_path, ReportPhotoCheck::JOB_TIMEOUT);
        $r->update(['ai_verdict' => $verdict, 'ai_note' => $note]);
        if ($verdict === 'match') {
            ReportVerification::evaluate($r);
        }
    }
}
