<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Campus names loaded once per request or queued job (bound as a scoped singleton), so listing hundreds of
 * reports, SOS or people costs four queries instead of four per row.
 */
class PlaceDirectory
{
    /** @var array<string, string>|null */
    private ?array $buildings = null;

    /** @var array<string, string>|null keyed "building|level" */
    private ?array $floors = null;

    /** @var array<string, object{name: ?string, building_id: string, level: int, room_id: ?string}>|null */
    private ?array $nodes = null;

    /** @var array<string, string>|null */
    private ?array $rooms = null;

    public function building(string $id): ?string
    {
        $this->buildings ??= DB::table('buildings')->pluck('name', 'id')->all();

        return $this->buildings[$id] ?? null;
    }

    public function floor(string $buildingId, int $level): ?string
    {
        $this->floors ??= DB::table('floors')->get(['building_id', 'level', 'name'])
            ->mapWithKeys(fn ($f) => ["{$f->building_id}|{$f->level}" => $f->name])->all();

        return $this->floors["{$buildingId}|{$level}"] ?? null;
    }

    /** @return object{name: ?string, building_id: string, level: int, room_id: ?string}|null */
    public function node(string $id): ?object
    {
        $this->nodes ??= DB::table('evac_nodes')->get(['id', 'name', 'building_id', 'level', 'room_id'])->keyBy('id')->all();

        return $this->nodes[$id] ?? null;
    }

    public function room(string $id): ?string
    {
        $this->rooms ??= DB::table('rooms')->pluck('name', 'id')->all();

        return $this->rooms[$id] ?? null;
    }
}
