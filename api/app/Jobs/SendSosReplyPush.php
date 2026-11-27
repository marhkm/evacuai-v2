<?php

namespace App\Jobs;

use App\Models\SosAlert;
use App\Support\ExpoPush;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

/** Push an officer's chat reply to the SOS sender's own devices; tapping it opens the chat. Nothing once the SOS is closed. */
class SendSosReplyPush implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public SosAlert $sos, public string $body) {}

    public function handle(): void
    {
        if (! $this->sos->fresh()?->isOpen()) {
            return;
        }
        $tokens = DB::table('device_tokens')->where('user_id', $this->sos->user_id)
            ->select('token', 'user_id')->orderBy('id')->get();

        ExpoPush::send($tokens, 'Safety officer replied', mb_strimwidth($this->body, 0, 80, '…'), ['sos_id' => $this->sos->id]);
    }
}
