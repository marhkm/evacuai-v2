<?php

namespace App\Events;

use App\Models\HazardReport;
use App\Support\Places;
use App\Support\ReportClusters;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/** A new hazard report, for the officers' live feed. No reporter identity in the payload. */
class ReportSubmitted implements ShouldBroadcastNow
{
    public function __construct(public HazardReport $report) {}

    /** @return list<PrivateChannel> */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('officers')];
    }

    public function broadcastAs(): string
    {
        return 'report.submitted';
    }

    /** @return array{id: int, hazard_type: string, place: ?string, matching: int} */
    public function broadcastWith(): array
    {
        $r = $this->report;

        return [
            'id' => $r->id,
            'hazard_type' => $r->hazard_type,
            'place' => Places::label($r->building_id, $r->level, $r->node_id, $r->room_id),
            'matching' => ReportClusters::reporterCount($r->hazard_type, $r->building_id, $r->level),
        ];
    }
}
