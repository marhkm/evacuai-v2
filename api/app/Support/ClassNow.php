<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** The class a user has right now (campus time), from their uploaded schedule. */
class ClassNow
{
    /** @return object{subject: string, days: string, time_start: string, time_end: string, room_id: string, building: string, level: int, room_name: string}|null */
    public static function for(int $userId): ?object
    {
        $at = now(config('evacuai.timezone'));
        $time = $at->format('H:i:s');

        return DB::table('schedules')
            ->join('rooms', 'rooms.id', '=', 'schedules.room_id')
            ->where('schedules.user_id', $userId)
            ->where('schedules.time_start', '<=', $time)
            ->where('schedules.time_end', '>', $time)
            ->select('schedules.subject', 'schedules.days', 'schedules.time_start', 'schedules.time_end',
                'schedules.room_id', 'rooms.building_id as building', 'rooms.level', 'rooms.name as room_name')
            ->get()
            ->first(fn ($c) => ClassDays::includes($c->days, $at));
    }
}
