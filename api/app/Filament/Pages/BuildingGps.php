<?php

namespace App\Filament\Pages;

use App\Support\Activity;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Each building's GPS corners, so an SOS from a student with no class can still name the building they are in. */
class BuildingGps extends Page
{
    protected string $view = 'filament.pages.building-gps';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedMapPin;

    protected static ?string $title = 'Building GPS';

    protected static ?string $slug = 'building-gps';

    /** @var array<string, string> building id => one "lat, lng" per line */
    public array $corners = [];

    /** @var array<string, string> building id => name */
    public array $names = [];

    public function mount(): void
    {
        foreach (DB::table('buildings')->orderBy('name')->get(['id', 'name', 'gps_corners']) as $b) {
            $this->names[$b->id] = $b->name;
            $points = $b->gps_corners ? json_decode((string) $b->gps_corners, true) : [];
            $this->corners[$b->id] = implode("\n", array_map(fn ($p) => "{$p[0]}, {$p[1]}", $points));
        }
    }

    public function save(): void
    {
        $parsed = [];
        foreach ($this->corners as $id => $text) {
            $lines = array_values(array_filter(array_map('trim', preg_split('/\r\n|\n|\r/', (string) $text))));
            if (! $lines) {
                $parsed[$id] = null;

                continue;
            }
            $points = [];
            foreach ($lines as $line) {
                if (! preg_match('/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/', $line, $m) || abs((float) $m[1]) > 90 || abs((float) $m[2]) > 180) {
                    throw ValidationException::withMessages(["corners.{$id}" => "\"{$line}\" is not a GPS point. Use lat, lng (for example 10.32741, 123.95012)."]);
                }
                $points[] = [(float) $m[1], (float) $m[2]];
            }
            if (count($points) < 3 || count($points) > 8) {
                throw ValidationException::withMessages(["corners.{$id}" => 'Enter 3 to 8 corners, one per line.']);
            }
            $parsed[$id] = $points;
        }

        foreach ($parsed as $id => $points) {
            DB::table('buildings')->where('id', $id)->update(['gps_corners' => $points ? json_encode($points) : null]);
        }
        Activity::log('building_gps_changed', ['buildings' => array_keys(array_filter($parsed))]);
        Notification::make()->title('Building GPS saved')->success()->send();
    }
}
