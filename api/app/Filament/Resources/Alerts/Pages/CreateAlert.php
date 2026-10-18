<?php

namespace App\Filament\Resources\Alerts\Pages;

use App\Filament\Resources\Alerts\AlertResource;
use App\Models\User;
use App\Support\AlertActions;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Database\Eloquent\Model;

class CreateAlert extends CreateRecord
{
    protected static string $resource = AlertResource::class;

    protected static ?string $title = 'Broadcast alert';

    protected function handleRecordCreation(array $data): Model
    {
        /** @var User $user */
        $user = auth()->user();

        return AlertActions::broadcast($user, $data);
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
