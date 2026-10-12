<?php

namespace App\Filament\Resources\Alerts\Pages;

use App\Filament\Resources\Alerts\AlertResource;
use App\Models\Alert;
use App\Support\AlertDispatcher;
use App\Support\ReportClusters;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Database\Eloquent\Model;

class CreateAlert extends CreateRecord
{
    protected static string $resource = AlertResource::class;

    protected static ?string $title = 'Broadcast alert';

    protected function handleRecordCreation(array $data): Model
    {
        $data['translations'] = array_filter($data['translations'] ?? []) ?: null;
        $alert = Alert::create($data + [
            'issued_by' => auth()->id(),
            'issued_at' => now(),
            'status' => 'active',
            'source' => 'admin',
            'verified' => true,
        ]);
        if (! $alert->is_drill) {
            // The officer's broadcast verifies the matching reports, so routing starts avoiding those rooms.
            ReportClusters::recentReports($alert->hazard_type, $alert->building_id)->get()
                ->each->update(['status' => 'verified', 'verified_by' => auth()->id(), 'alert_id' => $alert->id]);
        }
        AlertDispatcher::dispatch($alert);

        return $alert;
    }

    protected function getCreatedNotificationTitle(): ?string
    {
        return 'Alert broadcast';
    }

    protected function getRedirectUrl(): string
    {
        return AlertResource::getUrl('index');
    }
}
