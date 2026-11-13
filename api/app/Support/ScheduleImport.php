<?php

namespace App\Support;

use DateInterval;
use DateTimeInterface;
use Illuminate\Support\Facades\DB;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Options;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Reads a student's class schedule (.xlsx from the template, or .csv): subject, room_code, days, time_start, time_end.
 * All or nothing: the caller saves the rows only when there are no problems.
 */
class ScheduleImport
{
    public const HEADER = ['subject', 'room_code', 'days', 'time_start', 'time_end'];

    public const MAX_ROWS = 60;

    /** @return array{rows: list<array{subject: string, room_id: string, days: string, time_start: string, time_end: string}>, problems: list<string>} */
    public static function parse(string $path, string $extension): array
    {
        $lines = self::read($path, $extension);
        $header = array_map(fn ($h) => strtolower(trim((string) $h)), array_shift($lines) ?? []);
        if (array_diff(self::HEADER, $header)) {
            return ['rows' => [], 'problems' => ['The first row must be: '.implode(', ', self::HEADER)]];
        }
        $lines = array_filter($lines, fn ($l) => implode('', array_map(fn ($v) => is_scalar($v) ? trim((string) $v) : 'x', $l)) !== '');
        if (count($lines) > self::MAX_ROWS) {
            return ['rows' => [], 'problems' => ['Too many rows ('.self::MAX_ROWS.' at most).']];
        }

        $rooms = DB::table('rooms')->whereNotNull('code')->pluck('id', 'code')->mapWithKeys(fn ($id, $c) => [self::key($c) => $id]);
        $rows = [];
        $problems = [];
        foreach ($lines as $i => $line) {
            $r = array_combine($header, array_pad(array_slice($line, 0, count($header)), count($header), ''));
            $code = trim((string) $r['room_code']);
            $days = strtoupper(str_replace(' ', '', trim((string) $r['days'])));
            $start = self::time($r['time_start']);
            $end = self::time($r['time_end']);
            $error = match (true) {
                ! isset($rooms[self::key($code)]) => "unknown room code {$code}",
                ! ClassDays::valid($days) => "invalid days {$r['days']}",
                ! $start || ! $end || $start >= $end => 'invalid time range',
                trim((string) $r['subject']) === '' => 'missing subject',
                default => null,
            };
            if ($error) {
                $problems[] = 'Row '.($i + 2).": {$error}";

                continue;
            }
            $rows[] = ['subject' => mb_substr(trim((string) $r['subject']), 0, 100), 'room_id' => $rooms[self::key($code)], 'days' => $days, 'time_start' => $start, 'time_end' => $end];
        }

        return ['rows' => $rows, 'problems' => $problems];
    }

    /** "A-61", "a 61" and "A61" are one room. */
    public static function key(string $code): string
    {
        return strtoupper(str_replace([' ', '-'], '', $code));
    }

    /** @return list<list<mixed>> */
    private static function read(string $path, string $extension): array
    {
        if ($extension === 'csv') {
            $reader = new CsvReader;
        } else {
            $options = new Options;
            $options->SHOULD_FORMAT_DATES = false; // times come back as values, not display text
            $reader = new XlsxReader($options);
        }
        $reader->open($path);
        $lines = [];
        foreach ($reader->getSheetIterator() as $sheet) {
            foreach ($sheet->getRowIterator() as $row) {
                $lines[] = $row->toArray();
                if (count($lines) > self::MAX_ROWS + 1) {
                    break; // header + one row too many is enough to refuse it; a small file can hold millions of rows
                }
            }
            break; // first sheet only (the template's second sheet lists rooms)
        }
        $reader->close();

        return $lines;
    }

    /** 9:00, 09:00, 9:00 AM, an Excel time cell, or Excel's day fraction (0.375) → "09:00". */
    private static function time(mixed $v): ?string
    {
        if ($v instanceof DateTimeInterface) {
            return $v->format('H:i');
        }
        if ($v instanceof DateInterval) {
            return sprintf('%02d:%02d', $v->h + $v->d * 24, $v->i);
        }
        if (is_int($v) || is_float($v) || (is_string($v) && is_numeric($v))) {
            $minutes = (int) round(((float) $v) * 1440);

            return $minutes > 0 && $minutes < 1440 ? sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60) : null;
        }
        $s = strtoupper(trim((string) $v));
        if (! preg_match('/^(\d{1,2}):([0-5]\d)(?::\d\d)?\s*(AM|PM)?$/', $s, $m)) {
            return null;
        }
        $h = (int) $m[1];
        if (isset($m[3])) {
            if ($h < 1 || $h > 12) {
                return null;
            }
            $h = $h % 12 + ($m[3] === 'PM' ? 12 : 0);
        }

        return $h <= 23 ? sprintf('%02d:%s', $h, $m[2]) : null;
    }
}
