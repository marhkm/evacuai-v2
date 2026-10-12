<?php

namespace App\Filament\Pages;

use App\Support\ClassDays;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Facades\DB;
use Livewire\Features\SupportFileUploads\TemporaryUploadedFile;
use Livewire\WithFileUploads;

/**
 * Upload class schedules exported from the registrar (CSV: email, subject, room_code, days, time_start, time_end).
 * Each user's previous schedule is replaced. Students' schedules are personal data: only their own app reads them.
 */
class ImportSchedules extends Page
{
    use WithFileUploads;

    protected string $view = 'filament.pages.import-schedules';

    protected static ?string $title = 'Import class schedules';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCalendarDays;

    /** @var TemporaryUploadedFile|null */
    public $file = null;

    public ?string $summary = null;

    /** @var list<string> */
    public array $problems = [];

    public function import(): void
    {
        $this->validate(['file' => ['required', 'file', 'mimes:csv,txt', 'max:5120']]);
        $rows = array_map('str_getcsv', preg_split('/\r\n|\n|\r/', trim($this->file->get())));
        $header = array_map(fn ($h) => strtolower(trim($h)), array_shift($rows) ?? []);
        $need = ['email', 'subject', 'room_code', 'days', 'time_start', 'time_end'];
        if (array_diff($need, $header)) {
            $this->summary = null;
            $this->problems = ['The first row must be: '.implode(', ', $need)];

            return;
        }

        $users = DB::table('users')->pluck('id', 'email')->mapWithKeys(fn ($id, $e) => [strtolower($e) => $id]);
        $rooms = DB::table('rooms')->whereNotNull('code')->pluck('id', 'code')->mapWithKeys(fn ($id, $c) => [strtoupper($c) => $id]);
        $records = [];
        $this->problems = [];

        foreach ($rows as $i => $row) {
            $line = $i + 2;
            $r = array_combine($header, array_pad(array_map('trim', $row), count($header), ''));
            $userId = $users[strtolower($r['email'])] ?? null;
            $roomId = $rooms[strtoupper(str_replace(' ', '', $r['room_code']))] ?? null;
            $start = $this->time($r['time_start']);
            $end = $this->time($r['time_end']);
            $error = match (true) {
                ! $userId => "unknown email {$r['email']}",
                ! $roomId => "unknown room code {$r['room_code']}",
                ! ClassDays::valid($r['days']) => "invalid days {$r['days']}",
                ! $start || ! $end || $start >= $end => 'invalid time range',
                default => null,
            };
            if ($error) {
                $this->problems[] = "Row {$line}: {$error}";

                continue;
            }
            $records[] = ['user_id' => $userId, 'subject' => mb_substr($r['subject'], 0, 100), 'room_id' => $roomId,
                'days' => strtoupper(str_replace(' ', '', $r['days'])), 'time_start' => $start, 'time_end' => $end];
        }

        DB::transaction(function () use ($records) {
            DB::table('schedules')->whereIn('user_id', array_unique(array_column($records, 'user_id')))->delete();
            foreach (array_chunk($records, 500) as $chunk) {
                DB::table('schedules')->insert($chunk);
            }
        });

        $this->summary = 'Imported '.count($records).' classes'.($this->problems ? ', skipped '.count($this->problems).' rows.' : '.');
        $this->file = null;
    }

    private function time(string $t): ?string
    {
        return preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', $t, $m) ? sprintf('%02d:%02d', $m[1], $m[2]) : null;
    }
}
