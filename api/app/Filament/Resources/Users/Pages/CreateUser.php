<?php

namespace App\Filament\Resources\Users\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Models\User;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;

class CreateUser extends CreateRecord
{
    protected static string $resource = UserResource::class;

    /** `role` is not mass-assignable, so it is set explicitly (this page is admin-only via UserPolicy). */
    protected function handleRecordCreation(array $data): Model
    {
        $user = new User(Arr::except($data, ['role', 'is_active']));
        $user->forceFill(Arr::only($data, ['role', 'is_active']))->save();

        return $user;
    }
}
