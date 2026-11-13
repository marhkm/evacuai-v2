<?php

namespace App\Filament\Pages;

use App\Support\Activity;
use App\Support\ReportVerification;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Facades\DB;

/**
 * When hazard reports verify themselves: this many different students, with different photos, on the same floor
 * within this many minutes, and the server's AI agrees with one photo. The same numbers raise the unverified alert.
 */
class ReportRules extends Page
{
    protected string $view = 'filament.pages.report-rules';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedShieldCheck;

    protected static ?string $title = 'Report rules';

    public int|string $threshold = 3;

    public int|string $minutes = 10;

    public function mount(): void
    {
        $this->threshold = ReportVerification::threshold();
        $this->minutes = ReportVerification::minutes();
    }

    public function save(): void
    {
        $this->validate(['threshold' => ['required', 'integer', 'between:2,10'], 'minutes' => ['required', 'integer', 'between:5,60']]);
        $now = now();
        DB::table('system_configurations')->upsert([
            ['key' => 'report_cluster_threshold', 'value' => json_encode((int) $this->threshold), 'description' => 'Different students needed to verify a hazard report', 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'report_cluster_minutes', 'value' => json_encode((int) $this->minutes), 'description' => 'Minutes those reports must fall within', 'created_at' => $now, 'updated_at' => $now],
        ], ['key'], ['value', 'updated_at']);
        Activity::log('report_rules_changed', ['threshold' => (int) $this->threshold, 'minutes' => (int) $this->minutes]);
        Notification::make()->title('Report rules saved')->success()->send();
    }
}
