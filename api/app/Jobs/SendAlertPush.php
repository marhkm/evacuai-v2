<?php

namespace App\Jobs;

use App\Models\Alert;
use App\Support\AlertDispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

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

        foreach ($tokens->chunk(100) as $chunk) {
            $chunk = $chunk->values();
            $tickets = Http::acceptJson()->post('https://exp.host/--/api/v2/push/send', $chunk->map(fn ($t) => [
                'to' => $t->token,
                'title' => $title,
                'body' => $this->alert->message,
                'sound' => 'default',
                'priority' => 'high',
                'channelId' => 'emergency', // high-importance Android channel created by the app
                'data' => ['alert_id' => $this->alert->id],
            ])->all())->json('data', []);

            foreach ($chunk as $i => $t) {
                $ok = ($tickets[$i]['status'] ?? 'error') === 'ok';
                if (! $ok && ($tickets[$i]['details']['error'] ?? null) === 'DeviceNotRegistered') {
                    DB::table('device_tokens')->where('token', $t->token)->delete();
                }
                DB::table('alert_notifications')->upsert([[
                    'alert_id' => $this->alert->id, 'user_id' => $t->user_id, 'channel' => 'push',
                    'delivery_status' => $ok ? 'sent' : 'failed', 'sent_at' => now(),
                ]], ['alert_id', 'user_id', 'channel'], ['delivery_status', 'sent_at']);
            }
        }
    }
}
