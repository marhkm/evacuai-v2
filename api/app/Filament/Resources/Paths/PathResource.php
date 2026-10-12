<?php

namespace App\Filament\Resources\Paths;

use App\Filament\Resources\Paths\Pages\ListPaths;
use App\Models\EvacEdge;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\SelectColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/** Manuscript "Stairs/Path Status": officers mark path segments open, blocked or congested; apps re-route live. */
class PathResource extends Resource
{
    protected static ?string $model = EvacEdge::class;

    protected static ?string $navigationLabel = 'Paths';

    protected static ?string $modelLabel = 'path';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedArrowsRightLeft;

    protected static ?int $navigationSort = 3;

    public static function table(Table $table): Table
    {
        $names = null; // node id => readable name, loaded once per render
        $label = function (string $nodeId) use (&$names): string {
            $names ??= DB::table('evac_nodes')
                ->leftJoin('rooms', 'rooms.id', '=', 'evac_nodes.room_id')
                ->get(['evac_nodes.id', 'evac_nodes.name', 'rooms.name as room_name'])
                ->mapWithKeys(fn ($n) => [$n->id => $n->name ?? $n->room_name ?? $n->id]);

            return $names[$nodeId] ?? $nodeId;
        };

        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query->where('type', '!=', 'elevator')) // elevators are never routed
            ->poll('10s')
            ->defaultSort('id')
            ->columns([
                TextColumn::make('from_node_id')->label('From')->formatStateUsing(fn (string $state) => $label($state))->searchable(),
                TextColumn::make('to_node_id')->label('To')->formatStateUsing(fn (string $state) => $label($state))->searchable(),
                TextColumn::make('floor')->state(fn (EvacEdge $record) => str($record->from_node_id)->beforeLast('/')->replace('/', ' · ')),
                TextColumn::make('type')->badge()->color('gray'),
                SelectColumn::make('status')
                    ->options(['open' => 'Open', 'congested' => 'Congested', 'blocked' => 'Blocked'])
                    ->selectablePlaceholder(false),
                TextColumn::make('updated_at')->since()->label('Changed'),
            ])
            ->filters([
                SelectFilter::make('status')->options(['open' => 'Open', 'congested' => 'Congested', 'blocked' => 'Blocked']),
                SelectFilter::make('building')
                    ->options(fn () => DB::table('buildings')->orderBy('name')->pluck('name', 'id')->all())
                    ->query(fn (Builder $query, array $data) => $data['value'] ? $query->where('from_node_id', 'like', $data['value'].'/%') : $query),
                SelectFilter::make('type')->options(['corridor' => 'Corridor', 'stairs' => 'Stairs', 'door' => 'Door', 'outdoor' => 'Outdoor', 'ramp' => 'Ramp']),
            ]);
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getNavigationBadge(): ?string
    {
        $blocked = EvacEdge::where('status', 'blocked')->count();

        return $blocked ? "{$blocked} blocked" : null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'danger';
    }

    public static function getPages(): array
    {
        return ['index' => ListPaths::route('/')];
    }
}
