<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Alert;
use App\Models\User;
use App\Support\DrillStats;
use App\Support\Places;
use Filament\Facades\Filament;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** CSV drill report for one alert: summary, then one row per person (opens in Excel / Google Sheets). */
class DrillReportController extends Controller
{
    public function __invoke(Request $request, Alert $alert): StreamedResponse
    {
        /** @var ?User $user */
        $user = $request->user();
        abort_unless($user?->canAccessPanel(Filament::getPanel('admin')), 403);

        $tz = config('evacuai.timezone');
        $s = DrillStats::for($alert);
        $logs = DB::table('evacuation_logs')->where('alert_id', $alert->id)->get()->keyBy('user_id');
        $people = DrillStats::people()->orderBy('name')->get();

        return response()->streamDownload(function () use ($alert, $s, $logs, $people, $tz) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\u{FEFF}"); // UTF-8 BOM so Excel shows non-ASCII names correctly
            $row = fn (array $cells) => fputcsv($out, array_map([self::class, 'cell'], $cells));

            $row(['EvacuAI drill report']);
            $row(['Alert', ($alert->is_drill ? '[Drill] ' : '').str($alert->hazard_type)->replace('_', ' ')->title().' — '.$alert->message]);
            $row(['Issued', $alert->issued_at?->timezone($tz)->format('Y-m-d H:i:s')]);
            $row(['Resolved', $alert->resolved_at?->timezone($tz)->format('Y-m-d H:i:s') ?? 'still active']);
            $row(['People', $s['people']]);
            $row(['Safe', $s['safe']]);
            $row(['Needs help', $s['needs_help']]);
            $row(['Unknown (no check-in)', $s['unknown']]);
            $row(['Check-in rate (%)', $s['check_in_rate']]);
            $row(['Median evacuation time (min)', $s['median_minutes'] ?? '']);
            $row(['Slowest evacuation time (min)', $s['slowest_minutes'] ?? '']);
            $row(['SOS requests', $s['sos']]);
            $row(['Average SOS response (s)', $s['sos_response_seconds'] ?? '']);
            $row([]);
            $row(['Name', 'Role', 'Department', 'Status', 'Assembly point', 'Checked in at', 'Minutes after alert']);
            foreach ($people as $p) {
                $log = $logs[$p->id] ?? null;
                $at = $log ? Carbon::parse($log->checked_in_at) : null;
                $row([
                    $p->name,
                    $p->role->value,
                    $p->department,
                    $log ? $log->status : 'unknown',
                    $log?->assembly_node_id ? Places::label(null, null, $log->assembly_node_id) : '',
                    $at?->timezone($tz)->format('Y-m-d H:i:s') ?? '',
                    $at && $alert->issued_at ? round(max(0, $alert->issued_at->diffInSeconds($at)) / 60, 1) : '',
                ]);
            }
            fclose($out);
        }, "drill-report-{$alert->id}-".$alert->issued_at?->timezone($tz)->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** Stops spreadsheet formula injection from user-entered text (names, departments, messages). */
    public static function cell(mixed $value): string
    {
        $text = (string) $value;

        return preg_match('/^[=+\-@\t\r]/', $text) && ! is_numeric($text) ? "'".$text : $text;
    }
}
