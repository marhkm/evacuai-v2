<?php

namespace App\Filament\Resources\Alerts\Schemas;

use App\Support\AlertTranslator;
use App\Support\Llm;
use App\Support\ReportClusters;
use Filament\Actions\Action;
use Filament\Forms\Components\Checkbox;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Notifications\Notification;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;
use Illuminate\Support\Facades\DB;

class AlertForm
{
    public const HAZARDS = ['earthquake' => 'Earthquake', 'fire' => 'Fire', 'flood' => 'Flood', 'structural_damage' => 'Structural damage', 'other' => 'Other / general'];

    public static function configure(Schema $schema): Schema
    {
        // Manuscript rule: broadcast once 3 reports confirm the incident; otherwise the officer must confirm it directly.
        $needsDirectConfirmation = fn (Get $get): bool => ! $get('is_drill')
            && ReportClusters::recentReporterCount($get('hazard_type'), $get('building_id')) < config('evacuai.report_cluster_threshold');

        return $schema->components([
            Select::make('hazard_type')->options(self::HAZARDS)->required()->live(),
            Select::make('severity_level')->options(['low' => 'Low', 'medium' => 'Medium', 'high' => 'High', 'critical' => 'Critical'])->required()->default('high'),
            Select::make('building_id')->label('Building')->placeholder('Campus-wide')
                ->options(fn () => DB::table('buildings')->orderBy('name')->pluck('name', 'id')->all())->live(),
            Textarea::make('message')->required()->maxLength(500)->rows(3)
                ->helperText('Say what happened, where, and what people should do (e.g. "Fire at BE 2F. Use Stairs Left to Exit North.").')
                ->hintAction(self::translateAction()),
            Textarea::make('translations.ceb')->label('Cebuano (optional)')->maxLength(600)->rows(2),
            Textarea::make('translations.fil')->label('Filipino (optional)')->maxLength(600)->rows(2),
            Toggle::make('is_drill')->label('This is a drill')->live(),
            Checkbox::make('confirmed_direct')
                ->label('I verified this incident directly')
                ->helperText(fn (Get $get): string => ReportClusters::recentReporterCount($get('hazard_type'), $get('building_id'))
                    .' people reported this in the last '.config('evacuai.report_cluster_minutes').' minutes.')
                ->accepted($needsDirectConfirmation)
                ->visible($needsDirectConfirmation)
                ->dehydrated(false),
        ])->columns(1);
    }

    /** Fills the translations for the officer to check. Only the message text is sent, never names or contact details. */
    private static function translateAction(): Action
    {
        return Action::make('translate')->label('Translate with AI')->icon('heroicon-o-language')
            ->visible(fn () => Llm::enabled())
            ->tooltip('Sends only this message to the AI provider. Do not type names or phone numbers in it.')
            ->action(function (Get $get, Set $set) {
                $result = filled($get('message')) ? AlertTranslator::translate((string) $get('message')) : null;
                if (! $result) {
                    Notification::make()->danger()->title('Translation unavailable')->body('Write the message first, or type the translations yourself.')->send();

                    return;
                }
                $set('translations.ceb', $result['ceb']);
                $set('translations.fil', $result['fil']);
                Notification::make()->success()->title("Translated by {$result['provider']}")->body('Check both translations before broadcasting.')->send();
            });
    }
}
