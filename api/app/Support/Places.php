<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** Human-readable campus places for officers, e.g. "Basic Ed · Third · BE301". */
class Places
{
    /** Same rule as displayName() in packages/campus-view. */
    public static function humanize(string $id): string
    {
        $local = last(explode('/', $id));

        return str_replace('_', ' ', (string) preg_replace('/_(G|\d+|Ground|Second|Third)$/', '', $local));
    }

    public static function label(?string $buildingId, ?int $level, ?string $nodeId = null, ?string $roomId = null): ?string
    {
        if (! $buildingId && ! $nodeId && ! $roomId) {
            return null;
        }
        $node = $nodeId ? DB::table('evac_nodes')->where('id', $nodeId)->first() : null;
        $buildingId ??= $node?->building_id;
        $level ??= $node?->level;
        $roomId ??= $node?->room_id;

        $spot = $node->name ?? ($roomId ? DB::table('rooms')->where('id', $roomId)->value('name') : null) ?? ($nodeId ? self::humanize($nodeId) : null);

        return implode(' · ', array_filter([
            DB::table('buildings')->where('id', $buildingId)->value('name') ?? $buildingId,
            $level === null ? null : DB::table('floors')->where(['building_id' => $buildingId, 'level' => $level])->value('name') ?? "Level {$level}",
            $spot,
        ]));
    }
}
