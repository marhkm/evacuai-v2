<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ClassDays;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** The signed-in student's class right now: the app's first guess of where they are when an alert starts. */
class ScheduleController extends Controller
{
    public function now(Request $request): JsonResponse
    {
        $at = now(config('evacuai.timezone'));
        $time = $at->format('H:i:s');

        $class = DB::table('schedules')
            ->join('rooms', 'rooms.id', '=', 'schedules.room_id')
            ->where('schedules.user_id', $request->user()->id)
            ->where('schedules.time_start', '<=', $time)
            ->where('schedules.time_end', '>', $time)
            ->select('schedules.subject', 'schedules.days', 'schedules.time_start', 'schedules.time_end',
                'schedules.room_id', 'rooms.building_id as building', 'rooms.level', 'rooms.name as room_name')
            ->get()
            ->first(fn ($c) => ClassDays::includes($c->days, $at));

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
}
