<?php

namespace App\Jobs;

use App\Models\Alert;
use App\Support\AlertDispatcher;
use App\Support\ExpoPush;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

/** Expo push to every active user's devices, 100 messages per request; logs delivery per user and drops dead tokens. */
class SendAlertPush implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public Alert $alert) {}

    public function handle(): void
    {
        $title = AlertDispatcher::title($this->alert);
        $tokens = DB::table('device_tokens')
            ->join('users', 'users.id', '=', 'device_tokens.user_id')
            ->where('users.is_active', true)
            ->select('device_tokens.token', 'device_tokens.user_id')
            ->orderBy('device_tokens.id')
            ->get();

        foreach (ExpoPush::send($tokens, $title, $this->alert->message, ['alert_id' => $this->alert->id]) as $r) {
            DB::table('alert_notifications')->upsert([[
                'alert_id' => $this->alert->id, 'user_id' => $r['user_id'], 'channel' => 'push',
                'delivery_status' => $r['ok'] ? 'sent' : 'failed', 'sent_at' => now(),
            ]], ['alert_id', 'user_id', 'channel'], ['delivery_status', 'sent_at']);
        }
    }
}
