<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Asks the local vision model (Ollama, on this server: photos never leave it) whether a report's photo shows the
 * reported hazard. Used when the report is sent (short wait) and by the background job (longer wait).
 */
class ReportPhotoCheck
{
    public const SUBMIT_TIMEOUT = 20; // seconds the student waits on "Checking photo…" (PHP stops a request at 30)

    public const JOB_TIMEOUT = 60;

    public const MODEL_PX = 512; // Moondream looks at ~378 px tiles: a bigger photo only adds tiles and seconds on a CPU

    private const WORDS = [
        'fire' => 'fire or smoke', 'flood' => 'flooding or standing water', 'earthquake' => 'earthquake damage like cracks or fallen objects',
        'structural_damage' => 'structural damage like cracks or collapse', 'other' => 'a hazard',
    ];

    /** What the model is asked to see, e.g. "fire or smoke". */
    public static function words(string $hazard): string
    {
        return self::WORDS[$hazard] ?? 'a hazard';
    }

    /** Floods are verified by the report count or an officer: the model often misses standing water. */
    public static function applies(string $hazard): bool
    {
        return $hazard !== 'flood' && (bool) config('services.ollama.base');
    }

    /** @return array{0: string, 1: ?string} [match|no_match|unclear|unavailable, the model's short reason] */
    public static function ask(string $hazard, ?string $photoPath, int $timeout): array
    {
        if (! $photoPath || ! Storage::disk('local')->exists($photoPath)) {
            return ['unavailable', null];
        }

        return self::askBytes($hazard, (string) Storage::disk('local')->get($photoPath), $timeout);
    }

    /** A copy no bigger than MODEL_PX on its longest side (the stored photo stays as it is). */
    private static function small(string $bytes): string
    {
        $img = @imagecreatefromstring($bytes);
        if (! $img) {
            return $bytes;
        }
        [$w, $h] = [imagesx($img), imagesy($img)];
        if (max($w, $h) > self::MODEL_PX) {
            $scale = self::MODEL_PX / max($w, $h);
            $img = imagescale($img, max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale))) ?: $img;
        }
        ob_start();
        imagejpeg($img, null, 80);

        return (string) ob_get_clean();
    }

    /** @return array{0: string, 1: ?string} the same check for a photo's bytes (also used by evacuai:evaluate-photos) */
    public static function askBytes(string $hazard, string $bytes, int $timeout): array
    {
        $base = config('services.ollama.base');
        if (! $base) {
            return ['unavailable', null];
        }
        try {
            $answer = trim((string) Http::timeout($timeout)->post("{$base}/api/generate", [
                'model' => config('services.ollama.vision_model'),
                'prompt' => 'Does this photo show '.self::words($hazard).'? Answer yes, no, or unclear, then one short reason.',
                'images' => [base64_encode(self::small($bytes))],
                'stream' => false,
                'keep_alive' => '30m', // stay loaded between reports: reloading the model costs more than checking a photo
            ])->throw()->json('response'));
        } catch (Throwable $e) {
            Log::warning("Photo check failed: {$e->getMessage()}");

            return ['unavailable', null];
        }
        $first = strtolower((string) preg_replace('/[^a-z]/i', '', strtok($answer, " ,.\n") ?: ''));

        return [match ($first) {
            'yes' => 'match', 'no' => 'no_match', default => 'unclear'
        }, mb_substr($answer, 0, 200) ?: null];
    }
}
