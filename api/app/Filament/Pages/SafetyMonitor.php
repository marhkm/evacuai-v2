<?php

namespace App\Filament\Pages;

use App\Models\Alert;
use App\Models\SosAlert;
use App\Models\User;
use App\Support\DrillStats;
use App\Support\Places;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Concerns\InteractsWithTable;
use Filament\Tables\Contracts\HasTable;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Livewire\Attributes\Url;

/**
 * Manuscript "Safety Monitor": for one alert, who checked in safe, who needs help, and who is still unknown
 * (with their last known location), plus how many people are at each assembly point.
 */
class SafetyMonitor extends Page implements HasTable
{
    use InteractsWithTable;

    protected string $view = 'filament.pages.safety-monitor';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedShieldCheck;

    protected static ?int $navigationSort = 1;

    #[Url]
    public ?int $alert = null;

    public function alertId(): ?int
    {
        return $this->alert ?? Alert::current()?->id;
    }

    public function updatedAlert(): void
    {
        $this->resetTable();
    }

    /** @return array<int, string> */
    public function alertOptions(): array
    {
        return Alert::whereIn('status', ['active', 'resolved'])->latest('issued_at')->limit(20)->get()
            ->mapWithKeys(fn (Alert $a) => [$a->id => ($a->is_drill ? '[Drill] ' : '').str($a->hazard_type)->replace('_', ' ')->title()
                .' · '.$a->issued_at?->timezone(config('evacuai.timezone'))->format('M j, g:i A').($a->status === 'active' ? ' (active)' : '')])
            ->all();
    }

    private function people(): Builder
    {
        return DrillStats::people();
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('report')->label('Drill report (CSV)')->icon('heroicon-o-arrow-down-tray')
                ->visible(fn () => (bool) $this->alertId())
                ->url(fn () => route('reports.drill', ['alert' => $this->alertId()])),
        ];
    }

    /** @return array{total: int, safe: int, needs_help: int, unknown: int, sos: int} */
    public function counts(): array
    {
        $byStatus = DB::table('evacuation_logs')->where('alert_id', $this->alertId() ?? 0)
            ->whereIn('user_id', $this->people()->select('users.id'))
            ->groupBy('status')->selectRaw('status, count(*) as n')->pluck('n', 'status');
        $total = $this->people()->count();

        return [
            'total' => $total,
            'safe' => (int) ($byStatus['safe'] ?? 0),
            'needs_help' => (int) ($byStatus['needs_help'] ?? 0),
            'unknown' => $total - (int) $byStatus->sum(),
            'sos' => SosAlert::whereIn('status', SosAlert::OPEN)->count(),
        ];
    }

    /** @return list<array{name: string, count: int}> */
    public function occupancy(): array
    {
        $counts = DB::table('evacuation_logs')->where(['alert_id' => $this->alertId() ?? 0, 'status' => 'safe'])
            ->whereNotNull('assembly_node_id')->groupBy('assembly_node_id')->selectRaw('assembly_node_id, count(*) as n')->pluck('n', 'assembly_node_id');

        return DB::table('assembly_points')->orderBy('id')->pluck('node_id')
            ->map(fn (string $node) => ['name' => Places::label(null, null, $node) ?? $node, 'count' => (int) ($counts[$node] ?? 0)])
            ->all();
    }

    public function table(Table $table): Table
    {
        $alertId = $this->alertId() ?? 0;
        $last = fn (string $column) => DB::table('location_events')->select($column)
            ->whereColumn('location_events.user_id', 'users.id')->where('location_events.alert_id', $alertId)
            ->orderByDesc('location_events.id')->limit(1);

        return $table
            ->query(fn () => $this->people()
                ->leftJoin('evacuation_logs as el', fn ($join) => $join->on('el.user_id', '=', 'users.id')->where('el.alert_id', $alertId))
                ->select('users.*', 'el.status as check_status', 'el.assembly_node_id', 'el.checked_in_at')
                ->addSelect([
                    'last_node' => $last('node_id'), 'last_room' => $last('room_id'), 'last_building' => $last('building_id'),
                    'last_level' => $last('level'), 'last_seen_at' => $last('created_at'),
                    'open_sos' => SosAlert::selectRaw('count(*)')->whereColumn('sos_alerts.user_id', 'users.id')->whereIn('status', SosAlert::OPEN),
                ]))
            ->poll('5s')
            ->defaultSort(fn (Builder $query) => $query
                ->orderByRaw("CASE WHEN EXISTS (SELECT 1 FROM sos_alerts s WHERE s.user_id = users.id AND s.status IN ('pending', 'acknowledged')) OR el.status = 'needs_help' THEN 0 WHEN el.status IS NULL THEN 1 ELSE 2 END")
                ->orderBy('users.name'))
            ->columns([
                TextColumn::make('name')->searchable(query: fn (Builder $query, string $search) => $query->where('users.name', 'ilike', "%{$search}%")),
                TextColumn::make('role')->formatStateUsing(fn ($state) => str($state->value)->title())->color('gray'),
                TextColumn::make('status')->badge()
                    ->state(fn (User $record) => $record->getAttribute('open_sos') ? 'SOS' : ($record->getAttribute('check_status') ?? 'unknown'))
                    ->formatStateUsing(fn (string $state) => $state === 'SOS' ? $state : str($state)->replace('_', ' ')->title())
                    ->color(fn (string $state) => match ($state) {
                        'safe' => 'success', 'unknown' => 'warning', default => 'danger'
                    }),
                TextColumn::make('where')->label('Where')->wrap()->placeholder('No location shared')
                    ->state(fn (User $record) => $record->getAttribute('assembly_node_id')
                        ? Places::label(null, null, $record->getAttribute('assembly_node_id'))
                        : Places::label($record->getAttribute('last_building'), $record->getAttribute('last_level'), $record->getAttribute('last_node'), $record->getAttribute('last_room'))),
                TextColumn::make('updated')->label('Last update')->since()
                    ->state(fn (User $record) => $record->getAttribute('checked_in_at') ?? $record->getAttribute('last_seen_at'))->placeholder('—'),
                TextColumn::make('phone')->placeholder('—'),
            ])
            ->filters([
                SelectFilter::make('status')
                    ->options(['needs_help' => 'Needs help', 'unknown' => 'Unknown', 'safe' => 'Safe'])
                    ->query(fn (Builder $query, array $data) => match ($data['value'] ?? null) {
                        null, '' => $query,
                        'unknown' => $query->whereNull('el.status'),
                        default => $query->where('el.status', $data['value']),
                    }),
            ]);
    }
}
