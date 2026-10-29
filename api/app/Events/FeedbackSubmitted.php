<?php

namespace App\Events;

use App\Models\Feedback;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/** New app feedback, so the Command Center's Feedback tab and badge refresh. No identity in the payload. */
class FeedbackSubmitted implements ShouldBroadcastNow
{
    public function __construct(public Feedback $feedback) {}

    /** @return list<PrivateChannel> */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('officers')];
    }

    public function broadcastAs(): string
    {
        return 'feedback.submitted';
    }

    /** @return array{id: int, rating: int} */
    public function broadcastWith(): array
    {
        return ['id' => $this->feedback->id, 'rating' => (int) $this->feedback->rating];
    }
}
