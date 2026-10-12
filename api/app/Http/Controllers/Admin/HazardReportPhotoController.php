<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\HazardReport;
use App\Models\User;
use Filament\Facades\Filament;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Report photos may show people: officers and admins only, never cached by shared proxies. */
class HazardReportPhotoController extends Controller
{
    public function __invoke(Request $request, HazardReport $report): StreamedResponse
    {
        /** @var ?User $user */
        $user = $request->user();
        abort_unless($user?->canAccessPanel(Filament::getPanel('admin')), 403);
        abort_unless($report->photo_path && Storage::disk('local')->exists($report->photo_path), 404);

        return Storage::disk('local')->response($report->photo_path, "report-{$report->id}.jpg", [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, max-age=600',
        ]);
    }
}
