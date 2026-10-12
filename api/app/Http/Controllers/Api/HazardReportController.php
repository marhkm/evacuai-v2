<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HazardReport;
use App\Support\Activity;
use App\Support\ReportClusters;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class HazardReportController extends Controller
{
    private const FIELDS = ['id', 'hazard_type', 'building_id', 'level', 'room_id', 'description', 'status', 'created_at'];

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'hazard_type' => ['required', Rule::in(['earthquake', 'fire', 'flood', 'structural_damage', 'other'])],
            'building_id' => ['required', 'string', Rule::exists('buildings', 'id')],
            'level' => ['required', 'integer'],
            'room_id' => ['nullable', 'string'],
            'description' => ['nullable', 'string', 'max:500'],
        ]);
        if (! DB::table('floors')->where(['building_id' => $data['building_id'], 'level' => $data['level']])->exists()) {
            throw ValidationException::withMessages(['level' => 'That floor does not exist in this building.']);
        }
        if (! empty($data['room_id'])
            && ! DB::table('rooms')->where(['id' => $data['room_id'], 'building_id' => $data['building_id'], 'level' => $data['level']])->exists()) {
            throw ValidationException::withMessages(['room_id' => 'That room is not on the selected floor.']);
        }

        $report = HazardReport::create($data + ['reported_by' => $request->user()->id]);
        Activity::log('report_submitted', ['report_id' => $report->id, 'hazard' => $report->hazard_type]);
        ReportClusters::evaluate($report);

        return response()->json(['report' => $report->fresh()->only(self::FIELDS)], 201);
    }

    public function mine(Request $request): JsonResponse
    {
        return response()->json([
            'reports' => HazardReport::where('reported_by', $request->user()->id)->latest()->limit(50)->get(self::FIELDS),
        ]);
    }
}
