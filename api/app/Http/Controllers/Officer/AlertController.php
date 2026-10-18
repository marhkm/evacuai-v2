<?php

namespace App\Http\Controllers\Officer;

use App\Filament\Resources\Alerts\Schemas\AlertForm;
use App\Http\Controllers\Controller;
use App\Http\Resources\AlertResource;
use App\Models\Alert;
use App\Models\User;
use App\Support\AlertActions;
use App\Support\AlertTranslator;
use App\Support\DrillReport;
use App\Support\Llm;
use App\Support\ReportClusters;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AlertController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $alerts = Alert::query()
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->orderByRaw("CASE status WHEN 'draft' THEN 0 WHEN 'active' THEN 1 ELSE 2 END")
            ->latest('created_at')->limit(100)->get();

        return response()->json(['alerts' => AlertResource::collection($alerts)->resolve()]);
    }

    /** Broadcast. Without 3 matching reports (and not a drill) the officer must confirm they verified it directly. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'hazard_type' => ['required', Rule::in(array_keys(AlertForm::HAZARDS))],
            'severity_level' => ['required', Rule::in(['low', 'medium', 'high', 'critical'])],
            'building_id' => ['nullable', 'string', Rule::exists('buildings', 'id')],
            'message' => ['required', 'string', 'max:500'],
            'is_drill' => ['boolean'],
            'translations.ceb' => ['nullable', 'string', 'max:600'],
            'translations.fil' => ['nullable', 'string', 'max:600'],
            'confirm' => ['boolean'],
        ]);
        $reporters = ReportClusters::recentReporterCount($data['hazard_type'], $data['building_id'] ?? null);
        if (! ($data['is_drill'] ?? false) && ! ($data['confirm'] ?? false) && $reporters < config('evacuai.report_cluster_threshold')) {
            return response()->json(['needs_confirmation' => true, 'reporters' => $reporters]);
        }
        unset($data['confirm']);

        return $this->alert(AlertActions::broadcast($this->officer($request), $data), 201);
    }

    public function publish(Request $request, Alert $alert): JsonResponse
    {
        $message = $request->validate(['message' => ['required', 'string', 'max:500']])['message'];

        return $this->alert(AlertActions::publish($alert, $this->officer($request), $message));
    }

    public function discard(Alert $alert): JsonResponse
    {
        return $this->alert(AlertActions::discard($alert));
    }

    public function confirm(Alert $alert): JsonResponse
    {
        return $this->alert(AlertActions::confirm($alert));
    }

    public function resolve(Alert $alert): JsonResponse
    {
        return $this->alert(AlertActions::resolve($alert));
    }

    public function retract(Alert $alert): JsonResponse
    {
        return $this->alert(AlertActions::retract($alert));
    }

    public function translate(Request $request): JsonResponse
    {
        abort_unless(Llm::enabled(), 404);
        $result = AlertTranslator::translate($request->validate(['message' => ['required', 'string', 'max:500']])['message']);

        return $result ? response()->json($result) : response()->json(['message' => 'No AI provider answered'], 503);
    }

    public function report(Alert $alert): StreamedResponse
    {
        return DrillReport::stream($alert);
    }

    private function alert(Alert $alert, int $status = 200): JsonResponse
    {
        return response()->json(['alert' => (new AlertResource($alert->fresh()))->resolve()], $status);
    }

    private function officer(Request $request): User
    {
        /** @var User */
        return $request->user();
    }
}
