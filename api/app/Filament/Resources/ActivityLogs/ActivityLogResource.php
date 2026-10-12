<?php

namespace App\Filament\Resources\ActivityLogs;

use App\Enums\Role;
use App\Filament\Resources\ActivityLogs\Pages\ListActivityLogs;
use App\Models\ActivityLog;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Support\Facades\DB;
use UnitEnum;

/** Audit trail: sign-ins, alerts, path changes, SOS, check-ins, role changes. Read-only. */
class ActivityLogResource extends Resource
{
    protected static ?string $model = ActivityLog::class;

    protected static ?string $navigationLabel = 'Activity log';

    protected static ?string $modelLabel = 'activity';

    protected static ?string $pluralModelLabel = 'activity log';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedClipboardDocumentList;

    protected static string|UnitEnum|null $navigationGroup = 'Reports';

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('created_at')->label('When')->dateTime('M j, Y g:i:s A')->sortable(),
                TextColumn::make('user.name')->label('User')->placeholder('—')->searchable(),
                TextColumn::make('activity_type')->label('Activity')->badge()->color('gray')
                    ->formatStateUsing(fn (string $state) => str($state)->replace('_', ' ')->ucfirst()),
                // Computed: an array state would be formatted item by item.
                TextColumn::make('summary')->label('Details')->wrap()->placeholder('—')
                    ->state(fn (ActivityLog $record) => collect($record->details ?? [])
                        ->map(fn ($v, $k) => "{$k}: ".(is_bool($v) ? ($v ? 'yes' : 'no') : (is_scalar($v) ? $v : json_encode($v))))->implode(', ') ?: null),
                TextColumn::make('ip_address')->label('IP')->placeholder('—')->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                SelectFilter::make('activity_type')->label('Activity')
                    ->options(fn () => DB::table('user_activity_logs')->distinct()->orderBy('activity_type')->pluck('activity_type', 'activity_type')->all()),
            ]);
    }

    /** Contains IP addresses: admins only, not safety officers. */
    public static function canViewAny(): bool
    {
        return auth()->user()?->role === Role::Admin;
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getPages(): array
    {
        return ['index' => ListActivityLogs::route('/')];
    }
}
