<?php

namespace App\Filament\Resources\Users\Schemas;

use App\Enums\Role;
use App\Models\User;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class UserForm
{
    public static function configure(Schema $schema): Schema
    {
        // An admin cannot demote or disable themselves (prevents locking everyone out of the panel).
        $isSelf = fn (?User $record): bool => $record !== null && $record->is(auth()->user());

        return $schema
            ->components([
                TextInput::make('name')->required()->maxLength(100),
                TextInput::make('email')->label('Email address')->email()->required()->maxLength(100)->unique(ignoreRecord: true),
                TextInput::make('password')
                    ->password()
                    ->revealable()
                    ->minLength(8)
                    ->dehydrated(fn (?string $state): bool => filled($state))
                    ->helperText('Leave blank to keep the current password. New users can also set one with "Forgot password".'),
                Select::make('role')->options(Role::class)->default(Role::Student->value)->required()->disabled($isSelf),
                TextInput::make('department')->maxLength(100),
                TextInput::make('phone')->tel()->regex('/^(\+639\d{9}|09\d{9})$/')->unique(ignoreRecord: true),
                Toggle::make('is_active')->default(true)->disabled($isSelf),
            ]);
    }
}
