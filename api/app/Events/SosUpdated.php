<?php

namespace App\Events;

use App\Models\SosAlert;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/** Status change or new chat message on an SOS. Private: only the sender and officers may listen; the app refetches. */
class SosUpdated implements ShouldBroadcastNow
{
    public function __construct(public SosAlert $sos) {}

    /** @return list<PrivateChannel> */
    public function broadcastOn(): array
    {
        return [new PrivateChannel("sos.{$this->sos->id}")];
    }

    public function broadcastAs(): string
    {
        return 'sos.updated';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return ['id' => $this->sos->id, 'status' => $this->sos->status];
    }
}
