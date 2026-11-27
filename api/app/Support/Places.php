<?php

namespace App\Support;

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
        $places = app(PlaceDirectory::class);
        $node = $nodeId ? $places->node($nodeId) : null;
        // A safe zone is a place of its own (an open ground, Nature's Spring): its name alone, never "inside" the building
        // its point is filed under, which read as being in two places at once.
        if ($node?->type === 'assembly_point' && $node->name) {
            return $node->name;
        }
        $buildingId ??= $node?->building_id;
        $level ??= $node?->level;
        $roomId ??= $node?->room_id;

        $spot = $node->name ?? ($roomId ? $places->room($roomId) : null) ?? ($nodeId ? self::humanize($nodeId) : null);

        return implode(' · ', array_filter([
            $buildingId ? ($places->building($buildingId) ?? $buildingId) : null,
            $level === null || ! $buildingId ? null : $places->floor($buildingId, (int) $level) ?? "Level {$level}",
            $spot,
        ]));
    }
}
