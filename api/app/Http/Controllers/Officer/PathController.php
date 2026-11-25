<?php

namespace App\Http\Controllers\Officer;

use App\Events\CampusChanged;
use App\Http\Controllers\Controller;
use App\Models\EvacEdge;
use App\Support\Activity;
use App\Support\Places;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Path segments and their status. The EvacEdge model records who changed it, logs it and tells every phone. */
class PathController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = $this->query()
            ->where('evac_edges.type', '!=', 'elevator') // never routed (elevators are off in an emergency), so nothing to set
            ->when($request->query('building'), fn ($q, $b) => $q->where('n.building_id', $b))
            ->when($request->query('level') !== null, fn ($q) => $q->where('n.level', (int) $request->query('level')))
            ->orderBy('n.building_id')->orderBy('n.level')->orderBy('evac_edges.id')->get();

        return response()->json(['paths' => $rows->map(fn ($r) => $this->payload($r))->values()]);
    }

    public function update(Request $request, string $edge): JsonResponse
    {
        $path = EvacEdge::findOrFail($edge);
        $path->update($request->validate(['status' => ['required', Rule::in(['open', 'congested', 'blocked'])]]));

        return response()->json(['path' => $this->payload($this->query()->where('evac_edges.id', $path->id)->firstOrFail())]);
    }

    /**
     * Blocks (or reopens) every flight of the staircase this stair path belongs to, found by following the stair
     * links up and down. Smoke in a stairwell closes all of it, not one flight: routes switch to the other stairs.
     */
    public function staircase(Request $request, string $edge): JsonResponse
    {
        $status = $request->validate(['status' => ['required', Rule::in(['open', 'congested', 'blocked'])]])['status'];
        $first = EvacEdge::findOrFail($edge);
        if ($first->type !== 'stairs') {
            throw ValidationException::withMessages(['status' => 'This path is not a staircase.']);
        }
        $stairs = DB::table('evac_edges')->where('type', 'stairs')->get(['id', 'from_node_id', 'to_node_id']);
        $nodes = [$first->from_node_id => true, $first->to_node_id => true];
        $ids = [];
        do { // ponytail: re-scans the stair edges until nothing new joins; a campus has a few dozen
            $grew = false;
            foreach ($stairs as $s) {
                if (! isset($ids[$s->id]) && (isset($nodes[$s->from_node_id]) || isset($nodes[$s->to_node_id]))) {
                    $ids[$s->id] = true;
                    $nodes[$s->from_node_id] = $nodes[$s->to_node_id] = true;
                    $grew = true;
                }
            }
        } while ($grew);

        DB::table('evac_edges')->whereIn('id', array_keys($ids))->update(['status' => $status, 'updated_by' => $request->user()->id, 'updated_at' => now()]);
        Activity::log('staircase_status_changed', ['edges' => array_keys($ids), 'to' => $status]);
        event(new CampusChanged); // one refresh for the whole staircase

        return response()->json(['changed' => count($ids)]);
    }

    private function query(): Builder
    {
        return DB::table('evac_edges')
            ->join('evac_nodes as n', 'n.id', '=', 'evac_edges.from_node_id')
            ->leftJoin('users as u', 'u.id', '=', 'evac_edges.updated_by')
            ->select('evac_edges.*', 'n.building_id', 'n.level', 'u.name as updated_by_name');
    }

    /** @return array<string, mixed> */
    private function payload(object $r): array
    {
        return [
            'id' => $r->id,
            'type' => $r->type,
            'building_id' => $r->building_id,
            'level' => (int) $r->level,
            'from' => Places::humanize($r->from_node_id),
            'to' => Places::humanize($r->to_node_id),
            'place' => Places::label($r->building_id, (int) $r->level),
            'status' => $r->status,
            'updated_by' => $r->updated_by_name,
            'updated_at' => $r->updated_at,
        ];
    }
}
