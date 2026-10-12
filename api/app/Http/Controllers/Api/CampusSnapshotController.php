<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * GET /api/campus-snapshot — the CampusSnapshot contract (packages/routing/src/types.ts) with live edge status.
 * The app caches it for offline routing and refetches with If-None-Match.
 */
class CampusSnapshotController extends Controller
{
    public function __invoke(Request $request): JsonResponse|Response
    {
        $snapshot = $this->build();
        $etag = '"'.sha1(json_encode($snapshot)).'"';
        if ($request->header('If-None-Match') === $etag) {
            return response()->noContent(304)->setEtag(trim($etag, '"'));
        }

        return response()->json($snapshot)->setEtag(trim($etag, '"'));
    }

    /** @return array<string, mixed> */
    public function build(): array
    {
        $floors = DB::table('floors')->orderBy('level')->get()->groupBy('building_id');

        return [
            'name' => json_decode((string) DB::table('system_configurations')->where('key', 'campus_name')->value('value')) ?? config('app.name'),
            'buildings' => DB::table('buildings')->orderBy('id')->get()->map(fn ($b) => [
                'id' => $b->id,
                'name' => $b->name,
                'origin' => $b->origin_lat === null ? null : ['lat' => self::num($b->origin_lat), 'lng' => self::num($b->origin_lng)],
                'rotation_deg' => self::num($b->rotation_deg),
                'footprint' => json_decode($b->footprint),
                'floors' => ($floors[$b->id] ?? collect())->map(fn ($f) => [
                    'level' => $f->level,
                    'name' => $f->name,
                    'elevation_m' => self::num($f->elevation_m),
                    'height_m' => self::num($f->height_m),
                ])->values(),
            ]),
            'rooms' => DB::table('rooms')->orderBy('id')->get()->map(fn ($r) => [
                'id' => $r->id, 'building' => $r->building_id, 'level' => $r->level,
                'name' => $r->name, 'type' => $r->type, 'polygon' => json_decode($r->polygon),
            ]),
            'nodes' => DB::table('evac_nodes')->orderBy('id')->get()->map(fn ($n) => array_filter([
                'id' => $n->id, 'building' => $n->building_id, 'level' => $n->level, 'type' => $n->type,
                'x' => self::num($n->x), 'y' => self::num($n->y),
                'name' => $n->name, 'room_id' => $n->room_id, 'safe_for' => json_decode($n->safe_for),
                'qr_id' => $n->qr_id, 'capacity' => $n->capacity, 'occupancy' => $n->capacity === null ? null : $n->occupancy,
            ], fn ($v) => $v !== null)),
            'edges' => DB::table('evac_edges')->orderBy('id')->get()->map(fn ($e) => [
                'id' => $e->id, 'from' => $e->from_node_id, 'to' => $e->to_node_id, 'type' => $e->type,
                'distance_m' => self::num($e->distance_m), 'bidirectional' => (bool) $e->bidirectional,
                'flags' => json_decode($e->flags), 'status' => $e->status,
            ]),
            'assemblyPoints' => DB::table('assembly_points')->orderBy('id')->get()->map(fn ($a) => [
                'id' => $a->id, 'node_id' => $a->node_id,
                'lat' => $a->lat === null ? null : self::num($a->lat), 'lng' => $a->lng === null ? null : self::num($a->lng),
                'radius_m' => $a->radius_m,
            ]),
            // Rooms with a verified, unresolved hazard: routing will not pass through or end in them.
            'hazardRoomIds' => DB::table('hazard_reports')->where('status', 'verified')->whereNotNull('room_id')
                ->distinct()->orderBy('room_id')->pluck('room_id'),
            'weights' => config('evacuai.route_weights'),
        ];
    }

    /** Postgres returns decimals as strings; JSON consumers expect numbers (7, not "7.00"). */
    private static function num(mixed $v): int|float
    {
        $f = (float) $v;

        return $f == (int) $f ? (int) $f : $f;
    }
}
