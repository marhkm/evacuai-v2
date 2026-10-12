<?php

namespace App\Filament\Resources\SosAlerts;

use App\Filament\Resources\SosAlerts\Pages\ListSosAlerts;
use App\Filament\Resources\SosAlerts\Pages\SosChat;
use App\Models\SosAlert;
use App\Support\Places;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/** SOS desk: officers acknowledge, chat with and resolve SOS requests sent from the app. */
class SosAlertResource extends Resource
{
    protected static ?string $model = SosAlert::class;

    protected static ?string $navigationLabel = 'SOS';

    protected static ?string $modelLabel = 'SOS';

    protected static ?string $pluralModelLabel = 'SOS';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedLifebuoy;

    protected static ?int $navigationSort = 0;

    public static function statusColor(string $status): string
    {
        return match ($status) {
            'pending' => 'danger', 'acknowledged' => 'warning', 'resolved' => 'success', default => 'gray',
        };
    }

    public static function acknowledgeAction(): Action
    {
        return Action::make('acknowledge')->label('Acknowledge')->icon('heroicon-o-hand-raised')->color('warning')
            ->visible(fn (SosAlert $record) => $record->status === 'pending')
            ->action(fn (SosAlert $record) => $record->acknowledge());
    }

    public static function resolveAction(): Action
    {
        return Action::make('resolve')->label('Resolve')->icon('heroicon-o-check-circle')->color('success')
            ->visible(fn (SosAlert $record) => $record->isOpen())->requiresConfirmation()
            ->action(fn (SosAlert $record) => $record->resolve());
    }

    public static function table(Table $table): Table
    {
        return $table
            ->poll('5s')
            ->modifyQueryUsing(fn (Builder $query) => $query->with(['user', 'responder'])->withCount('messages'))
            ->defaultSort(fn (Builder $query) => $query
                ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END")
                ->orderByDesc('created_at'))
            ->recordUrl(fn (SosAlert $record) => self::getUrl('view', ['record' => $record]))
            ->columns([
                TextColumn::make('created_at')->dateTime()->description(fn (SosAlert $record) => $record->created_at->diffForHumans()),
                TextColumn::make('user.name')->label('Person')->description(fn (SosAlert $record) => $record->user->phone)->searchable(),
                TextColumn::make('place')->label('Location')
                    ->state(fn (SosAlert $record) => Places::label($record->building_id, $record->level, $record->node_id))->placeholder('Unknown')->wrap(),
                TextColumn::make('message')->limit(60)->wrap()->placeholder('—'),
                TextColumn::make('messages_count')->label('Chat')->badge()->color('gray'),
                TextColumn::make('status')->badge()->color(fn (string $state) => self::statusColor($state)),
                TextColumn::make('responder.name')->label('Officer')->placeholder('—'),
            ])
            ->filters([
                SelectFilter::make('status')->options([
                    'pending' => 'Pending', 'acknowledged' => 'Acknowledged', 'resolved' => 'Resolved', 'cancelled' => 'Cancelled',
                ]),
            ])
            ->recordActions([self::acknowledgeAction(), self::resolveAction()]);
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getNavigationBadge(): ?string
    {
        $open = SosAlert::whereIn('status', SosAlert::OPEN)->count();

        return $open ? (string) $open : null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'danger';
    }

    public static function getPages(): array
    {
        return [
            'index' => ListSosAlerts::route('/'),
            'view' => SosChat::route('/{record}'),
        ];
    }
}
