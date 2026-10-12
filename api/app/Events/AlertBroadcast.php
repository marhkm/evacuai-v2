<?php

namespace App\Events;

use App\Http\Resources\AlertResource;
use App\Models\Alert;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/** New, updated, resolved or retracted alert. Public channel: alerts are public safety information. Sent immediately, not queued. */
class AlertBroadcast implements ShouldBroadcastNow
{
    public function __construct(public Alert $alert) {}

    /** @return list<Channel> */
    public function broadcastOn(): array
    {
        return [new Channel('alerts')];
    }

    public function broadcastAs(): string
    {
        return 'alert.updated';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return ['alert' => (new AlertResource($this->alert))->resolve()];
    }
}
