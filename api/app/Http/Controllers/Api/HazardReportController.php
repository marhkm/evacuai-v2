<?php

namespace App\Http\Controllers\Api;

use App\Events\ReportSubmitted;
use App\Http\Controllers\Controller;
use App\Models\HazardReport;
use App\Support\Activity;
use App\Support\ReportClusters;
use App\Support\ReportPhoto;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use RuntimeException;

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
            // HEIC is not accepted: the app sends JPEG. 8 MB covers full-size phone photos; the server shrinks them.
            'photo' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
        ]);
        if (! DB::table('floors')->where(['building_id' => $data['building_id'], 'level' => $data['level']])->exists()) {
            throw ValidationException::withMessages(['level' => 'That floor does not exist in this building.']);
        }
        if (! empty($data['room_id'])
            && ! DB::table('rooms')->where(['id' => $data['room_id'], 'building_id' => $data['building_id'], 'level' => $data['level']])->exists()) {
            throw ValidationException::withMessages(['room_id' => 'That room is not on the selected floor.']);
        }

        unset($data['photo']);
        if ($request->hasFile('photo')) {
            try {
                $data['photo_path'] = ReportPhoto::store($request->file('photo'));
            } catch (RuntimeException) {
                throw ValidationException::withMessages(['photo' => 'That image could not be read or is too large. Try another photo.']);
            }
        }
        $report = HazardReport::create($data + ['reported_by' => $request->user()->id]);
        Activity::log('report_submitted', ['report_id' => $report->id, 'hazard' => $report->hazard_type]);
        ReportClusters::evaluate($report);
        rescue(fn () => event(new ReportSubmitted($report))); // officers' live feed only; never fail the report

        return response()->json(['report' => self::payload($report->fresh())], 201);
    }

    /** @return array<string, mixed> */
    private static function payload(HazardReport $r): array
    {
        return $r->only(self::FIELDS) + ['has_photo' => $r->photo_path !== null];
    }

    public function mine(Request $request): JsonResponse
    {
        return response()->json([
            'reports' => HazardReport::where('reported_by', $request->user()->id)->latest()->limit(50)->get()->map(fn (HazardReport $r) => self::payload($r)),
        ]);
    }
}
