<?php

namespace App\Filament\Pages;

use App\Support\Activity;
use App\Support\Places;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Facades\DB;

/**
 * How many people each safe zone holds. The app shows "42 of 300" at check-in and suggests another zone when one is
 * full; routing avoids full zones. Blank means no limit is shown (until the office decides the numbers).
 */
class SafeZones extends Page
{
    protected string $view = 'filament.pages.safe-zones';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedMapPin;

    protected static ?string $title = 'Safe zones';

    /** @var array<string, string|int|null> capacity per assembly point id */
    public array $capacities = [];

    public function mount(): void
    {
        $this->capacities = DB::table('assembly_points')->pluck('capacity', 'id')->map(fn ($c) => $c === null ? '' : (int) $c)->all();
    }

    /** @return list<array{id: string, name: string}> */
    public function zones(): array
    {
        return DB::table('assembly_points as ap')->join('evac_nodes as n', 'n.id', '=', 'ap.node_id')->orderBy('ap.id')
            ->get(['ap.id', 'ap.node_id', 'n.name'])
            ->map(fn ($z) => ['id' => $z->id, 'name' => $z->name ?? Places::humanize($z->node_id)])->values()->all();
    }

    public function save(): void
    {
        $this->validate(['capacities.*' => ['nullable', 'integer', 'min:0', 'max:100000']]);
        foreach ($this->capacities as $id => $capacity) {
            $value = $capacity === '' || $capacity === null ? null : (int) $capacity;
            DB::table('assembly_points')->where('id', $id)->update(['capacity' => $value]);
        }
        Activity::log('safe_zone_capacity', ['capacities' => $this->capacities]);
        Notification::make()->title('Safe zone capacities saved')->success()->send();
    }
}
