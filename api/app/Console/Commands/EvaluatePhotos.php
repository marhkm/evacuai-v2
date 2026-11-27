<?php

namespace App\Console\Commands;

use App\Support\ReportPhotoCheck;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * Measures the AI photo check on labelled photos: <folder>/<hazard>/*.jpg are photos of that hazard, <folder>/none/
 * holds photos of no hazard. Each hazard is asked about every photo; a photo in another folder is a "no" for it.
 */
class EvaluatePhotos extends Command
{
    protected $signature = 'evacuai:evaluate-photos {folder : one subfolder per hazard (fire, flood, earthquake, structural_damage, other) plus "none"}';

    protected $description = 'Precision, recall and F1 of the AI photo check, per hazard type';

    public function handle(): int
    {
        if (! config('services.ollama.base')) {
            $this->error('The AI is not set up (OLLAMA_URL).');

            return self::FAILURE;
        }
        $folder = rtrim((string) $this->argument('folder'), '/'.DIRECTORY_SEPARATOR);
        $photos = []; // [label, path]
        foreach (File::directories($folder) as $dir) {
            foreach (collect(File::files($dir))->sortBy(fn ($f) => $f->getFilename()) as $file) {
                if (preg_match('/\.(jpe?g|png|webp)$/i', $file->getFilename())) {
                    $photos[] = [basename($dir), $file->getPathname()];
                }
            }
        }
        usort($photos, fn ($a, $b) => [$a[0], $a[1]] <=> [$b[0], $b[1]]);
        $hazards = array_values(array_filter(array_unique(array_column($photos, 0)), fn ($h) => $h !== 'none'));

        $rows = [];
        foreach ($hazards as $hazard) {
            $n = ['tp' => 0, 'fp' => 0, 'fn' => 0, 'tn' => 0, 'none' => 0];
            foreach ($photos as [$label, $path]) {
                [$verdict] = ReportPhotoCheck::askBytes($hazard, (string) file_get_contents($path), 120);
                $n['none'] += $verdict === 'unavailable' ? 1 : 0;
                $yes = $verdict === 'match'; // "unclear" and no answer count as no: the report would not be broadcast
                $n[$label === $hazard ? ($yes ? 'tp' : 'fn') : ($yes ? 'fp' : 'tn')]++;
            }
            $precision = $n['tp'] + $n['fp'] ? $n['tp'] / ($n['tp'] + $n['fp']) : 0.0;
            $recall = $n['tp'] + $n['fn'] ? $n['tp'] / ($n['tp'] + $n['fn']) : 0.0;
            $f1 = $precision + $recall ? 2 * $precision * $recall / ($precision + $recall) : 0.0;
            $rows[] = [$hazard, (string) count($photos), (string) $n['tp'], (string) $n['fp'], (string) $n['fn'], (string) $n['tn'], (string) $n['none'],
                number_format($precision, 2), number_format($recall, 2), number_format($f1, 2)];
        }

        $this->table(['Hazard', 'Photos', 'TP', 'FP', 'FN', 'TN', 'No answer', 'Precision', 'Recall', 'F1'], $rows);
        $this->line('mAP: not applicable. The check answers yes/no per photo, with no boxes or confidence scores to rank, so F1 is the measure.');

        return self::SUCCESS;
    }
}
