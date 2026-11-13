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

    /** @return array{path: string, hash: string} path on the local (private) disk, and the photo's dHash */
    public static function store(UploadedFile $file): array
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

        return ['path' => $path, 'hash' => self::dhash($out)];
    }

    /**
     * 64-bit difference hash (16 hex): the photo shrunk to 9×8 grey pixels, one bit per "brighter than the next one to
     * the right". Survives re-compression, resizing and small edits, so a re-sent photo lands within a few bits.
     */
    public static function dhash(\GdImage $img): string
    {
        $small = imagecreatetruecolor(9, 8);
        imagecopyresampled($small, $img, 0, 0, 0, 0, 9, 8, imagesx($img), imagesy($img));
        $grey = function (int $x, int $y) use ($small): int {
            $c = imagecolorat($small, $x, $y);

            return (($c >> 16) & 0xFF) * 299 + (($c >> 8) & 0xFF) * 587 + ($c & 0xFF) * 114;
        };
        $hex = '';
        for ($y = 0; $y < 8; $y++) {
            $byte = 0;
            for ($x = 0; $x < 8; $x++) {
                $byte = ($byte << 1) | ($grey($x, $y) > $grey($x + 1, $y) ? 1 : 0);
            }
            $hex .= sprintf('%02x', $byte);
        }

        return $hex;
    }

    /** How many of the 64 bits differ (0 = the same picture). Compared per byte: no 64-bit overflow. */
    public static function distance(string $a, string $b): int
    {
        $bits = 0;
        foreach (str_split($a, 2) as $i => $byte) {
            $bits += substr_count(decbin(hexdec($byte) ^ hexdec(substr($b, $i * 2, 2))), '1');
        }

        return $bits;
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
