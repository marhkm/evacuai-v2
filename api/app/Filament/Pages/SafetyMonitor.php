<?php

namespace App\Filament\Pages;

use App\Models\Alert;
use App\Models\User;
use App\Support\SafetyBoard;
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
        return SafetyBoard::counts($this->alertId() ?? 0);
    }

    /** @return list<array{name: string, count: int}> */
    public function occupancy(): array
    {
        return SafetyBoard::occupancy($this->alertId() ?? 0);
    }

    public function table(Table $table): Table
    {
        $alertId = $this->alertId() ?? 0;

        return $table
            ->query(fn () => SafetyBoard::query($alertId))
            ->poll('5s')
            ->defaultSort(fn (Builder $query) => SafetyBoard::sort($query))
            ->columns([
                TextColumn::make('name')->searchable(query: fn (Builder $query, string $search) => $query->where('users.name', 'ilike', "%{$search}%")),
                TextColumn::make('role')->formatStateUsing(fn ($state) => str($state->value)->title())->color('gray'),
                TextColumn::make('status')->badge()
                    ->state(fn (User $record) => SafetyBoard::status($record))
                    ->formatStateUsing(fn (string $state) => $state === 'SOS' ? $state : str($state)->replace('_', ' ')->title())
                    ->color(fn (string $state) => match ($state) {
                        'safe' => 'success', 'unknown' => 'warning', default => 'danger'
                    }),
                TextColumn::make('where')->label('Where')->wrap()->placeholder('No location shared')
                    ->state(fn (User $record) => SafetyBoard::place($record)),
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
