<?php

namespace App\Filament\Resources\Alerts\Schemas;

use App\Support\ReportClusters;
use Filament\Forms\Components\Checkbox;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Utilities\Get;
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
                ->helperText('Say what happened, where, and what people should do (e.g. "Fire at BE 2F. Use Stairs Left to Exit North.").'),
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
}
