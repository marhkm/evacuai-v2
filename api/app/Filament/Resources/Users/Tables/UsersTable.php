<?php

namespace App\Filament\Resources\Users\Tables;

use App\Models\User;
use App\Support\Activity;
use App\Support\ReportVerification;
use Filament\Actions\Action;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class UsersTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->searchable(),
                TextColumn::make('email')
                    ->label('Email address')
                    ->searchable(),
                TextColumn::make('email_verified_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('role')
                    ->badge()
                    ->searchable(),
                TextColumn::make('department')
                    ->searchable(),
                TextColumn::make('phone')
                    ->searchable(),
                IconColumn::make('is_active')
                    ->boolean(),
                TextColumn::make('false_reports') // 3+ hazard reports rejected as false in 30 days: theirs stop counting
                    ->label('Reports')
                    ->state(fn (User $u) => self::flagged($u) ? 'Often false' : null)
                    ->badge()
                    ->color('danger'),
                TextColumn::make('created_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('updated_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                //
            ])
            ->recordActions([
                EditAction::make(),
                Action::make('clearFalseReports')
                    ->label('Clear false reports')
                    ->icon(Heroicon::OutlinedArrowPath)
                    ->visible(fn (User $u) => self::flagged($u))
                    ->requiresConfirmation()
                    ->modalDescription('Their reports count again towards verifying hazards. Earlier false reports are kept in the history.')
                    ->action(function (User $u) {
                        $u->forceFill(['false_reports_cleared_at' => now()])->save();
                        Activity::log('false_reports_cleared', ['user_id' => $u->id]);
                    }),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }

    /** One query per page of users, not per row. */
    private static function flagged(User $u): bool
    {
        return once(fn () => ReportVerification::flaggedIds())->contains($u->id);
    }
}
