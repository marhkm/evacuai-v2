<?php

namespace App\Filament\Resources\HazardReports\Pages;

use App\Filament\Resources\Alerts\AlertResource;
use App\Filament\Resources\HazardReports\HazardReportResource;
use Filament\Actions\Action;
use Filament\Resources\Pages\ListRecords;

class ListHazardReports extends ListRecords
{
    protected static string $resource = HazardReportResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('broadcast')->label('Broadcast alert')->icon('heroicon-o-megaphone')->url(AlertResource::getUrl('create')),
        ];
    }
}
