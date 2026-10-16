<?php

namespace App\Filament\Resources\HazardReports\Tables;

use App\Models\HazardReport;
use App\Support\Llm;
use App\Support\ReportClusters;
use App\Support\ReportSummary;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class HazardReportsTable
{
    public static function configure(Table $table): Table
    {
        $open = fn (HazardReport $record): bool => in_array($record->status, ['pending', 'verified'], true);

        return $table
            ->poll('5s')
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('created_at')->dateTime()->sortable(),
                TextColumn::make('hazard_type')->badge()->formatStateUsing(fn (string $state) => str($state)->replace('_', ' ')->title()),
                TextColumn::make('building.name')->label('Building'),
                TextColumn::make('level')->label('Floor'),
                TextColumn::make('room_id')->label('Room')->formatStateUsing(fn (?string $state) => $state ? last(explode('/', $state)) : null)->placeholder('—'),
                TextColumn::make('description')->limit(60)->wrap(),
                TextColumn::make('photo_path')->label('Photo')->placeholder('—')
                    ->formatStateUsing(fn () => 'View photo')->color('primary')->icon('heroicon-o-photo')
                    ->url(fn (HazardReport $record) => $record->photo_path ? route('reports.photo', $record) : null, shouldOpenInNewTab: true),
                TextColumn::make('reporter.name')->label('Reported by'),
                TextColumn::make('matching')->label('Same-floor reporters (10 min)')
                    ->state(fn (HazardReport $record) => ReportClusters::reporterCount($record->hazard_type, $record->building_id, $record->level))
                    ->badge()->color(fn (int $state) => $state >= config('evacuai.report_cluster_threshold') ? 'danger' : 'gray'),
                TextColumn::make('status')->badge()->color(fn (string $state) => match ($state) {
                    'pending' => 'warning', 'verified' => 'danger', 'resolved' => 'success', default => 'gray',
                }),
            ])
            ->filters([
                SelectFilter::make('status')->options([
                    'pending' => 'Pending', 'verified' => 'Verified', 'resolved' => 'Resolved', 'dismissed' => 'Dismissed',
                ]),
            ])
            ->recordActions([
                Action::make('summarize')->label('Summarize')->icon('heroicon-o-sparkles')->color('gray')
                    ->tooltip('AI summary of the matching reports on this floor (no names are sent)')
                    ->visible(fn (HazardReport $record) => $open($record) && Llm::enabled()
                        && ReportClusters::reporterCount($record->hazard_type, $record->building_id, $record->level) >= 2)
                    ->action(function (HazardReport $record) {
                        $summary = ReportSummary::for($record);
                        $note = Notification::make()->persistent();
                        $summary
                            ? $note->info()->title('Matching reports (AI summary, check before acting)')->body("{$summary['text']} ({$summary['provider']})")->send()
                            : $note->warning()->title('No AI provider answered')->body('Read the reports below instead.')->send();
                    }),
                Action::make('verify')->label('Verify')->icon('heroicon-o-check-badge')->color('danger')
                    ->visible(fn (HazardReport $record) => $record->status === 'pending')
                    ->action(fn (HazardReport $record) => $record->update(['status' => 'verified', 'verified_by' => auth()->id()])),
                Action::make('dismiss')->label('Dismiss')->icon('heroicon-o-x-mark')->color('gray')
                    ->visible($open)->requiresConfirmation()
                    ->action(fn (HazardReport $record) => $record->update(['status' => 'dismissed', 'verified_by' => auth()->id()])),
                Action::make('resolve')->label('Resolve')->icon('heroicon-o-check-circle')->color('success')
                    ->visible(fn (HazardReport $record) => $record->status === 'verified')
                    ->action(fn (HazardReport $record) => $record->update(['status' => 'resolved', 'resolved_at' => now()])),
            ]);
    }
}
