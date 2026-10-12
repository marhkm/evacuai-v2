<?php

namespace App\Filament\Pages;

use App\Models\Alert;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;

/**
 * Live 3D overview of the campus (spec §3.4): blocked paths, hazard rooms, people still inside per room, SOS and
 * check-in pins, refreshed every 2 s; plus a drill replay slider. Rendering is done by packages/campus-3d
 * (public/js/campus-3d.js, built with `npm run build:3d`).
 */
class Campus3d extends Page
{
    protected string $view = 'filament.pages.campus-3d';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCube;

    protected static ?string $navigationLabel = 'Campus 3D';

    protected static ?string $title = 'Campus 3D';

    protected static ?string $slug = 'campus-3d';

    protected static ?int $navigationSort = 2;

    /** @return array<int, string> alerts that can be replayed */
    public function replayOptions(): array
    {
        return Alert::whereNotNull('issued_at')->whereIn('status', ['active', 'resolved'])->latest('issued_at')->limit(20)->get()
            ->mapWithKeys(fn (Alert $a) => [$a->id => ($a->is_drill ? '[Drill] ' : '').str($a->hazard_type)->replace('_', ' ')->title()
                .' · '.$a->issued_at?->timezone(config('evacuai.timezone'))->format('M j, g:i A')])
            ->all();
    }
}
