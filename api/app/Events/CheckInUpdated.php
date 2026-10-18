<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/** Someone checked in (or changed their check-in) for an alert. Officers' screens refetch the safety board. */
class CheckInUpdated implements ShouldBroadcastNow
{
    public function __construct(public int $alertId) {}

    /** @return list<PrivateChannel> */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('officers')];
    }

    public function broadcastAs(): string
    {
        return 'checkin.updated';
    }

    /** @return array{alert_id: int} */
    public function broadcastWith(): array
    {
        return ['alert_id' => $this->alertId];
    }
}
