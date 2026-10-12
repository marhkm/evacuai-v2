<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/** Path status or hazard rooms changed: apps refetch the campus snapshot (ETag) and re-route. */
class CampusChanged implements ShouldBroadcastNow
{
    /** @return list<Channel> */
    public function broadcastOn(): array
    {
        return [new Channel('campus')];
    }

    public function broadcastAs(): string
    {
        return 'campus.updated';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return ['at' => now()->toIso8601String()];
    }
}
