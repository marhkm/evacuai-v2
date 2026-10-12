<?php

namespace App\Filament\Resources\HazardReports;

use App\Filament\Resources\HazardReports\Pages\ListHazardReports;
use App\Filament\Resources\HazardReports\Tables\HazardReportsTable;
use App\Models\HazardReport;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

/** Reports come from the app only; officers verify, dismiss or resolve them here. */
class HazardReportResource extends Resource
{
    protected static ?string $model = HazardReport::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedExclamationTriangle;

    protected static ?int $navigationSort = 2;

    public static function table(Table $table): Table
    {
        return HazardReportsTable::configure($table);
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getNavigationBadge(): ?string
    {
        $pending = HazardReport::where('status', 'pending')->count();

        return $pending ? (string) $pending : null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'warning';
    }

    public static function getPages(): array
    {
        return [
            'index' => ListHazardReports::route('/'),
        ];
    }
}
