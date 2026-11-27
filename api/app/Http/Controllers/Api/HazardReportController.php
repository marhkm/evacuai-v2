<?php

namespace App\Http\Controllers\Api;

use App\Events\ReportSubmitted;
use App\Http\Controllers\Controller;
use App\Jobs\CheckReportPhoto;
use App\Models\Alert;
use App\Models\HazardReport;
use App\Support\Activity;
use App\Support\Places;
use App\Support\ReportClusters;
use App\Support\ReportPhoto;
use App\Support\ReportPhotoCheck;
use App\Support\ReportVerification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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
            'node_id' => ['nullable', 'string', 'prohibits:room_id'], // an outdoor area (a safe zone such as an open ground), instead of a room
            'description' => ['nullable', 'string', 'max:500'],
            // Required, taken in the app just now (reused pictures are the easiest fake). HEIC is not accepted: the app
            // sends JPEG. 8 MB covers full-size phone photos; the server shrinks them.
            'photo' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
            'taken_at' => ['required', 'date'],
            'at_building' => ['nullable', 'string'], // where the app last placed the reporter (a hint for officers)
            'at_level' => ['nullable', 'integer'],
            'send_anyway' => ['boolean'], // the AI did not see the hazard: the student sends it for an officer to check
        ], ['photo.required' => 'Take a photo of the hazard.', 'taken_at.required' => 'Update the app, then take a new photo of the hazard.']);
        $taken = Carbon::parse($data['taken_at']);
        if ($taken->lt(now()->subMinutes(10)) || $taken->gt(now()->addMinute())) {
            throw ValidationException::withMessages(['taken_at' => 'Take a new photo of the hazard (photos older than 10 minutes are not accepted).']);
        }
        if (! DB::table('floors')->where(['building_id' => $data['building_id'], 'level' => $data['level']])->exists()) {
            throw ValidationException::withMessages(['level' => 'That floor does not exist in this building.']);
        }
        if (! empty($data['room_id'])
            && ! DB::table('rooms')->where(['id' => $data['room_id'], 'building_id' => $data['building_id'], 'level' => $data['level']])->exists()) {
            throw ValidationException::withMessages(['room_id' => 'That room is not on the selected floor.']);
        }
        if (! empty($data['node_id']) && ! DB::table('evac_nodes')->where(['id' => $data['node_id'], 'type' => 'assembly_point',
            'building_id' => $data['building_id'], 'level' => $data['level']])->exists()) {
            throw ValidationException::withMessages(['node_id' => 'Choose an outdoor area from the list.']);
        }

        try {
            $photo = ReportPhoto::store($request->file('photo'));
        } catch (RuntimeException) {
            throw ValidationException::withMessages(['photo' => 'That image could not be read or is too large. Try another photo.']);
        }
        // The photo check runs now, while the student sees "Checking photo…" (floods skip it: officers or the report
        // count verify them). No answer in time: the report waits for an officer and the check runs again later.
        // A re-sent photo is not new evidence: no check. Only one check at a time while reports are sent (the model
        // answers one request at a time; a burst must not hold every PHP worker): the others wait for the job.
        $duplicate = self::duplicateOf($photo['hash']);
        [$verdict, $note] = [null, null];
        if ($duplicate === null && ReportPhotoCheck::applies($data['hazard_type'])) {
            $lock = Cache::lock('ollama-submit', ReportPhotoCheck::SUBMIT_TIMEOUT + 5);
            if ($lock->get()) {
                try {
                    [$verdict, $note] = ReportPhotoCheck::ask($data['hazard_type'], $photo['path'], ReportPhotoCheck::SUBMIT_TIMEOUT);
                } finally {
                    $lock->release();
                }
            }
        }
        if ($verdict === 'no_match' && ! ($data['send_anyway'] ?? false)) {
            Storage::disk('local')->delete($photo['path']);
            $message = "The photo doesn't seem to show ".ReportPhotoCheck::words($data['hazard_type']).'. Take a new photo, or send it anyway for a safety officer to check.';

            return response()->json(['message' => $message, 'reason' => 'photo_rejected', 'ai_note' => $note, 'errors' => ['photo' => [$message]]], 422);
        }
        $checked = in_array($verdict, ['match', 'no_match', 'unclear'], true);

        $user = $request->user();
        $report = HazardReport::create(Arr::except($data, ['photo', 'taken_at', 'at_building', 'at_level', 'send_anyway']) + [
            'ai_verdict' => $checked ? $verdict : null,
            'ai_note' => $checked ? $note : null,
            'reported_by' => $user->id,
            'photo_path' => $photo['path'],
            'photo_hash' => $photo['hash'],
            'photo_taken_at' => $taken,
            'duplicate_of' => $duplicate,
        ] + self::reporterPlace($user->id, $data));
        Activity::log('report_submitted', ['report_id' => $report->id, 'hazard' => $report->hazard_type]);
        // The AI saw it in this student's own new photo: the UNVERIFIED alert goes out now. Not for a flagged student
        // ("Often false"), and once per student while their alert is active (no alert in every building).
        $aiConfirmed = $verdict === 'match' && ! ReportVerification::flagged($user)
            && ! HazardReport::where('hazard_reports.reported_by', $user->id)->whereKeyNot($report->id)
                ->join('alerts', 'alerts.id', '=', 'hazard_reports.alert_id')
                ->where(['alerts.status' => 'active', 'alerts.source' => 'reports'])->exists();
        ReportClusters::evaluate($report, $aiConfirmed);
        ReportVerification::evaluate($report); // an earlier AI "yes" in the cluster may already be enough
        rescue(fn () => event(new ReportSubmitted($report))); // officers' live feed only; never fail the report
        if (! $checked && $report->hazard_type !== 'flood') {
            CheckReportPhoto::dispatch($report); // the AI was busy or down: check in the background
        }

        return response()->json(['report' => self::payload($report->fresh())], 201);
    }

    /** The oldest report from the last 24 h with (nearly) the same photo: a re-sent picture is not new evidence. */
    private static function duplicateOf(string $hash): ?int
    {
        return HazardReport::where('created_at', '>=', now()->subDay())->whereNotNull('photo_hash')->orderBy('id')
            ->get(['id', 'photo_hash'])
            ->first(fn (HazardReport $r) => ReportPhoto::distance($hash, (string) $r->photo_hash) <= 6)?->id;
    }

    /**
     * Was the reporter on the reported floor? From their last shared location during the alert, else where the app
     * last placed them. A hint for officers, never a reason to refuse a report.
     *
     * @param  array<string, mixed>  $data
     * @return array{reporter_place: string, reporter_place_label: ?string}
     */
    private static function reporterPlace(int $userId, array $data): array
    {
        $alert = Alert::current();
        $seen = $alert ? DB::table('location_events')->where(['user_id' => $userId, 'alert_id' => $alert->id])
            ->whereNotNull('building_id')->orderByDesc('id')->first(['building_id', 'level']) : null;
        [$building, $level] = $seen ? [$seen->building_id, $seen->level] : [$data['at_building'] ?? null, $data['at_level'] ?? null];
        if ($building === null || $level === null) {
            return ['reporter_place' => 'unknown', 'reporter_place_label' => null];
        }
        $same = $building === $data['building_id'] && (int) $level === (int) $data['level'];

        return ['reporter_place' => $same ? 'match' : 'elsewhere', 'reporter_place_label' => $same ? null : Places::label($building, (int) $level)];
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
