<?php

namespace App\Jobs;

use App\Models\HazardReport;
use App\Support\ReportVerification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Asks the local vision model (Ollama, on this server: photos never leave it) whether a report's photo shows the
 * reported hazard. Advice for officers and one of the auto-verify conditions; never a decision on its own.
 */
class CheckReportPhoto implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 75; // under the queue's retry_after (90), or a second worker could start the same check

    public bool $deleteWhenMissingModels = true; // the report was deleted: nothing to check

    private const WORDS = [
        'fire' => 'fire or smoke', 'flood' => 'flooding or standing water', 'earthquake' => 'earthquake damage like cracks or fallen objects',
        'structural_damage' => 'structural damage like cracks or collapse', 'other' => 'a hazard',
    ];

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
        [$verdict, $note] = $this->ask($r);
        $r->update(['ai_verdict' => $verdict, 'ai_note' => $note]);
        if ($verdict === 'match') {
            ReportVerification::evaluate($r);
        }
    }

    /** @return array{0: string, 1: ?string} */
    private function ask(HazardReport $r): array
    {
        $base = config('services.ollama.base');
        if (! $base || ! $r->photo_path || ! Storage::disk('local')->exists($r->photo_path)) {
            return ['unavailable', null];
        }
        $what = self::WORDS[$r->hazard_type] ?? 'a hazard';
        try {
            $answer = trim((string) Http::timeout(60)->post("{$base}/api/generate", [
                'model' => config('services.ollama.vision_model'),
                'prompt' => "Does this photo show {$what}? Answer yes, no, or unclear, then one short reason.",
                'images' => [base64_encode(Storage::disk('local')->get($r->photo_path))],
                'stream' => false,
            ])->throw()->json('response'));
        } catch (Throwable $e) {
            Log::warning("Photo check for report {$r->id} failed: {$e->getMessage()}");

            return ['unavailable', null];
        }
        $first = strtolower((string) preg_replace('/[^a-z]/i', '', strtok($answer, " ,.\n") ?: ''));

        return [match ($first) {
            'yes' => 'match', 'no' => 'no_match', default => 'unclear'
        }, mb_substr($answer, 0, 200) ?: null];
    }
}
