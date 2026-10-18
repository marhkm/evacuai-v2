<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\HazardReport;
use App\Models\User;
use App\Support\ReportPhoto;
use Filament\Facades\Filament;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Report photos may show people: officers and admins only, never cached by shared proxies. */
class HazardReportPhotoController extends Controller
{
    public function __invoke(Request $request, HazardReport $report): StreamedResponse
    {
        /** @var ?User $user */
        $user = $request->user();
        abort_unless($user?->canAccessPanel(Filament::getPanel('admin')), 403);

        return ReportPhoto::response($report);
    }
}
