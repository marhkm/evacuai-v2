<?php

namespace App\Filament\Resources\Users\Pages;

use App\Filament\Resources\Users\UserResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;

class EditUser extends EditRecord
{
    protected static string $resource = UserResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }

    /** `role` is not mass-assignable, so it is set explicitly (this page is admin-only via UserPolicy). */
    protected function handleRecordUpdate(Model $record, array $data): Model
    {
        $record->fill(Arr::except($data, ['role', 'is_active']));
        $record->forceFill(Arr::only($data, ['role', 'is_active']))->save();

        return $record;
    }
}
