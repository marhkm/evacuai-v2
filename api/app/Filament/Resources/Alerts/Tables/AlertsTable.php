<?php

namespace App\Filament\Resources\Alerts\Tables;

use App\Models\Alert;
use App\Support\AlertDispatcher;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class AlertsTable
{
    public static function configure(Table $table): Table
    {
        $active = fn (Alert $record): bool => $record->status === 'active';
        $change = function (Alert $record, array $attrs): void {
            $record->update($attrs);
            AlertDispatcher::update($record); // live update only; no second push/SMS
        };

        return $table
            ->poll('5s')
            ->defaultSort('issued_at', 'desc')
            ->columns([
                TextColumn::make('issued_at')->dateTime()->sortable()->placeholder('Draft'),
                TextColumn::make('hazard_type')->badge()->formatStateUsing(fn (string $state) => str($state)->replace('_', ' ')->title()),
                TextColumn::make('severity_level')->badge()->color(fn (string $state) => match ($state) {
                    'critical', 'high' => 'danger', 'medium' => 'warning', default => 'gray',
                }),
                TextColumn::make('message')->limit(70)->wrap(),
                TextColumn::make('building.name')->placeholder('Campus-wide'),
                TextColumn::make('status')->badge()->color(fn (string $state) => match ($state) {
                    'active' => 'danger', 'resolved' => 'success', 'draft' => 'warning', default => 'gray',
                }),
                IconColumn::make('verified')->boolean(),
                IconColumn::make('is_drill')->label('Drill')->boolean(),
                TextColumn::make('source')->badge()->color('gray'),
            ])
            ->filters([
                SelectFilter::make('status')->options(['draft' => 'Draft (from feeds)', 'active' => 'Active', 'resolved' => 'Resolved', 'retracted' => 'Retracted']),
            ])
            ->recordActions([
                Action::make('publish')->label('Publish')->icon('heroicon-o-megaphone')->color('danger')
                    ->visible(fn (Alert $record) => $record->status === 'draft')
                    ->modalDescription('Broadcast this feed alert to everyone now (live, push and SMS). Edit the message first if needed.')
                    ->fillForm(fn (Alert $record) => ['message' => $record->message])
                    ->schema([Textarea::make('message')->required()->maxLength(500)->rows(4)])
                    ->action(function (Alert $record, array $data) {
                        $record->update(['message' => $data['message'], 'status' => 'active', 'verified' => true, 'issued_by' => auth()->id(), 'issued_at' => now()]);
                        AlertDispatcher::dispatch($record);
                    }),
                Action::make('discard')->label('Discard')->icon('heroicon-o-trash')->color('gray')
                    ->visible(fn (Alert $record) => $record->status === 'draft')->requiresConfirmation()
                    ->action(fn (Alert $record) => $record->update(['status' => 'retracted', 'resolved_at' => now()])),
                Action::make('report')->label('Drill report')->icon('heroicon-o-arrow-down-tray')->color('gray')
                    ->visible(fn (Alert $record) => $record->issued_at !== null)
                    ->url(fn (Alert $record) => route('reports.drill', ['alert' => $record])),
                Action::make('confirm')->label('Confirm')->icon('heroicon-o-check-badge')->color('warning')
                    ->visible(fn (Alert $record) => $active($record) && ! $record->verified)
                    ->requiresConfirmation()->modalDescription('Mark this report-based alert as verified by a safety officer.')
                    ->action(fn (Alert $record) => $change($record, ['verified' => true])),
                Action::make('resolve')->label('Resolve')->icon('heroicon-o-check-circle')->color('success')
                    ->visible($active)->requiresConfirmation()->modalDescription('The emergency is over. Users will see the alert as resolved.')
                    ->action(fn (Alert $record) => $change($record, ['status' => 'resolved', 'resolved_at' => now()])),
                Action::make('retract')->label('Retract')->icon('heroicon-o-x-circle')->color('gray')
                    ->visible($active)->requiresConfirmation()->modalDescription('False alarm. Users will see that this alert was retracted.')
                    ->action(fn (Alert $record) => $change($record, ['status' => 'retracted', 'resolved_at' => now()])),
            ]);
    }
}
