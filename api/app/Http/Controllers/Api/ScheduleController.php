<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ClassNow;
use App\Support\ScheduleImport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** The signed-in student's own class schedule: uploaded by them, used as the first guess of where they are. */
class ScheduleController extends Controller
{
    public function now(Request $request): JsonResponse
    {
        $class = ClassNow::for($request->user()->id);

        return response()->json(['class' => $class ? [
            'subject' => $class->subject,
            'room_id' => $class->room_id,
            'room_name' => $class->room_name,
            'building' => $class->building,
            'level' => (int) $class->level,
            'time_start' => substr($class->time_start, 0, 5),
            'time_end' => substr($class->time_end, 0, 5),
        ] : null]);
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json(['classes' => self::classes($request->user()->id)]);
    }

    /** Replaces the whole schedule, or saves nothing and lists every bad row. */
    public function upload(Request $request): JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'max:1024', 'extensions:xlsx,csv']]);
        $file = $request->file('file');
        $ext = strtolower($file->getClientOriginalExtension());
        $rows = [];
        try {
            ['rows' => $rows, 'problems' => $problems] = ScheduleImport::parse($file->getRealPath(), $ext);
        } catch (\Throwable) {
            $problems = ['Could not read this file. Download the template, fill it in and upload it again.'];
        }
        if ($problems) {
            throw ValidationException::withMessages(['file' => $problems]);
        }

        $userId = $request->user()->id;
        DB::transaction(function () use ($rows, $userId) {
            DB::table('schedules')->where('user_id', $userId)->delete();
            DB::table('schedules')->insert(array_map(fn ($r) => $r + ['user_id' => $userId], $rows));
        });

        return response()->json(['classes' => self::classes($userId)]);
    }

    public function clear(Request $request): Response
    {
        DB::table('schedules')->where('user_id', $request->user()->id)->delete();

        return response()->noContent();
    }

    /** A short-lived link the phone can open in a browser (a plain link can't carry the sign-in). */
    public function templateLink(): JsonResponse
    {
        return response()->json(['url' => URL::temporarySignedRoute('schedule.template', now()->addMinutes(5))]);
    }

    /** The template: a Schedule sheet to fill in, and a Rooms sheet listing every valid room code. */
    public function template(): StreamedResponse
    {
        return response()->streamDownload(function () {
            $w = new Writer;
            $w->openToBrowser('evacuai-schedule-template.xlsx');
            $w->getCurrentSheet()->setName('Schedule');
            $w->addRow(Row::fromValues(ScheduleImport::HEADER));
            $w->addRow(Row::fromValues(['Physics 1', 'A-61', 'MWF', '09:00', '10:30']));
            $w->addNewSheetAndMakeItCurrent()->setName('Rooms');
            $w->addRow(Row::fromValues(['room_code', 'room', 'building', 'floor']));
            DB::table('rooms')->join('buildings', 'buildings.id', '=', 'rooms.building_id')
                ->leftJoin('floors', fn ($j) => $j->on('floors.building_id', '=', 'rooms.building_id')->on('floors.level', '=', 'rooms.level'))
                ->whereNotNull('rooms.code')->orderBy('rooms.code')
                ->get(['rooms.code', 'rooms.name', 'buildings.name as building', 'floors.name as floor'])
                ->each(fn ($r) => $w->addRow(Row::fromValues([$r->code, $r->name, $r->building, $r->floor])));
            $w->close();
        }, 'evacuai-schedule-template.xlsx', ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    }

    /** @return list<array{subject: string, room_code: ?string, room: string, days: string, time_start: string, time_end: string}> */
    private static function classes(int $userId): array
    {
        return DB::table('schedules')->join('rooms', 'rooms.id', '=', 'schedules.room_id')
            ->where('schedules.user_id', $userId)->orderBy('schedules.time_start')
            ->get(['schedules.subject', 'rooms.code', 'rooms.name', 'schedules.days', 'schedules.time_start', 'schedules.time_end'])
            ->map(fn ($c) => ['subject' => $c->subject, 'room_code' => $c->code, 'room' => $c->name, 'days' => $c->days,
                'time_start' => substr($c->time_start, 0, 5), 'time_end' => substr($c->time_end, 0, 5)])
            ->values()->all();
    }
}
