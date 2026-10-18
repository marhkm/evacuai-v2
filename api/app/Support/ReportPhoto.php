<?php

namespace App\Support;

use App\Models\HazardReport;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Hazard report photos. Re-encoded with GD, which drops all metadata (EXIF GPS position, phone model, time), and
 * scaled to at most 1600 px. Stored on the private disk; only officers can view them (see HazardReportPhotoController).
 */
class ReportPhoto
{
    public const MAX_PX = 1600;

    public const MAX_SOURCE_PIXELS = 40_000_000; // GD needs ~4 bytes per pixel to decode; 40 MP ≈ 160 MB

    /** Streams a report's photo (officers only; the caller authorizes). 404 when there is no photo. */
    public static function response(HazardReport $report): StreamedResponse
    {
        abort_unless($report->photo_path && Storage::disk('local')->exists($report->photo_path), 404);

        return Storage::disk('local')->response($report->photo_path, "report-{$report->id}.jpg", [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, max-age=600',
        ]);
    }

    /** @return string path on the local (private) disk */
    public static function store(UploadedFile $file): string
    {
        $size = @getimagesize($file->getRealPath());
        if (! $size || $size[0] * $size[1] > self::MAX_SOURCE_PIXELS) {
            throw new RuntimeException('Unreadable or too large image.');
        }
        ini_set('memory_limit', '512M'); // this request only: decoding a 12–40 MP phone photo
        $src = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));
        if ($src === false) {
            throw new RuntimeException('Unreadable image.');
        }
        $src = self::orient($src, $file);
        [$w, $h] = [imagesx($src), imagesy($src)];
        $scale = min(1, self::MAX_PX / max($w, $h));
        $out = imagescale($src, max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale))) ?: $src;

        ob_start();
        imagejpeg($out, null, 82);
        $path = 'reports/'.now()->format('Y/m').'/'.Str::uuid().'.jpg';
        Storage::disk('local')->put($path, (string) ob_get_clean());

        return $path;
    }

    /** Phones store photos sideways plus an EXIF rotation flag; apply it before the metadata is dropped. */
    private static function orient(\GdImage $img, UploadedFile $file): \GdImage
    {
        $exif = $file->getMimeType() === 'image/jpeg' && function_exists('exif_read_data') ? @exif_read_data($file->getRealPath()) : false;
        $angle = match ((int) ($exif['Orientation'] ?? 1)) {
            3 => 180, 6 => -90, 8 => 90, default => 0,
        };

        return $angle ? (imagerotate($img, $angle, 0) ?: $img) : $img;
    }
}
