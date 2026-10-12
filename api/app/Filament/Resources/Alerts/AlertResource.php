<?php

namespace App\Filament\Resources\Alerts;

use App\Filament\Resources\Alerts\Pages\CreateAlert;
use App\Filament\Resources\Alerts\Pages\ListAlerts;
use App\Filament\Resources\Alerts\Schemas\AlertForm;
use App\Filament\Resources\Alerts\Tables\AlertsTable;
use App\Models\Alert;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

/** Alerts are immutable once broadcast; only their status changes (confirm, resolve, retract). */
class AlertResource extends Resource
{
    protected static ?string $model = Alert::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedMegaphone;

    protected static ?int $navigationSort = 1;

    public static function form(Schema $schema): Schema
    {
        return AlertForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return AlertsTable::configure($table);
    }

    public static function getNavigationBadge(): ?string
    {
        $active = Alert::where('status', 'active')->count();

        return $active ? (string) $active : null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'danger';
    }

    public static function getPages(): array
    {
        return [
            'index' => ListAlerts::route('/'),
            'create' => CreateAlert::route('/create'),
        ];
    }
}
