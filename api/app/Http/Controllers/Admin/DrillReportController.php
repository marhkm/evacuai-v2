<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Alert;
use App\Models\User;
use App\Support\DrillReport;
use Filament\Facades\Filament;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Admin-panel download of the CSV drill report (the officer API streams the same file). */
class DrillReportController extends Controller
{
    public function __invoke(Request $request, Alert $alert): StreamedResponse
    {
        /** @var ?User $user */
        $user = $request->user();
        abort_unless($user?->canAccessPanel(Filament::getPanel('admin')), 403);

        return DrillReport::stream($alert);
    }
}
