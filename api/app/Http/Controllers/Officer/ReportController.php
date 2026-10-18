<?php

namespace App\Http\Controllers\Officer;

use App\Http\Controllers\Controller;
use App\Models\HazardReport;
use App\Models\User;
use App\Support\Llm;
use App\Support\Places;
use App\Support\ReportActions;
use App\Support\ReportClusters;
use App\Support\ReportPhoto;
use App\Support\ReportSummary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $page = HazardReport::with('reporter:id,name')
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->latest()->latest('id')->paginate(50);
        $matching = ReportClusters::reporterCounts();

        return response()->json([
            'reports' => collect($page->items())->map(fn (HazardReport $r) => $this->payload($r, $matching))->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }

    public function verify(Request $request, HazardReport $report): JsonResponse
    {
        return $this->report(ReportActions::verify($report, $this->officer($request)));
    }

    public function dismiss(Request $request, HazardReport $report): JsonResponse
    {
        return $this->report(ReportActions::dismiss($report, $this->officer($request)));
    }

    public function resolve(HazardReport $report): JsonResponse
    {
        return $this->report(ReportActions::resolve($report));
    }

    public function summary(HazardReport $report): JsonResponse
    {
        abort_unless(Llm::enabled(), 404);
        $summary = ReportSummary::for($report);

        return $summary ? response()->json($summary) : response()->json(['message' => 'No AI provider answered'], 503);
    }

    public function photo(HazardReport $report): StreamedResponse
    {
        return ReportPhoto::response($report);
    }

    /**
     * @param  array<string, int>|null  $matching  ReportClusters::reporterCounts(), for lists
     * @return array<string, mixed>
     */
    private function payload(HazardReport $r, ?array $matching = null): array
    {
        return [
            'id' => $r->id,
            'hazard_type' => $r->hazard_type,
            'building_id' => $r->building_id,
            'level' => $r->level,
            'room_id' => $r->room_id,
            'place' => Places::label($r->building_id, $r->level, $r->node_id, $r->room_id),
            'description' => $r->description,
            'status' => $r->status,
            'alert_id' => $r->alert_id,
            'reporter' => $r->reporter?->name,
            'matching' => $matching === null
                ? ReportClusters::reporterCount($r->hazard_type, $r->building_id, $r->level)
                : ($matching["{$r->hazard_type}|{$r->building_id}|{$r->level}"] ?? 0),
            'photo_url' => $r->photo_path ? url("/api/officer/reports/{$r->id}/photo") : null,
            'created_at' => $r->created_at?->toIso8601String(),
        ];
    }

    private function report(HazardReport $report): JsonResponse
    {
        return response()->json(['report' => $this->payload($report->fresh() ?? $report)]);
    }

    private function officer(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
