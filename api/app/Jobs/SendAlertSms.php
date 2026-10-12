<?php

namespace App\Jobs;

use App\Models\Alert;
use App\Support\AlertDispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/** Optional SMS fallback via Semaphore (PH gateway, ported from the student prototype). Costs per message. */
class SendAlertSms implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public Alert $alert) {}

    public function handle(): void
    {
        $users = DB::table('users')->where('is_active', true)->whereNotNull('phone')->select('id', 'phone')->get();
        $text = '[EvacuAI] '.AlertDispatcher::title($this->alert)."\n".$this->alert->message;

        foreach ($users->chunk(1000) as $chunk) { // Semaphore accepts up to 1000 numbers per request
            $ok = Http::asForm()->post('https://api.semaphore.co/api/v4/messages', [
                'apikey' => config('services.semaphore.key'),
                'number' => $chunk->pluck('phone')->implode(','),
                'message' => $text,
                'sendername' => config('services.semaphore.sender'),
            ])->successful();

            DB::table('alert_notifications')->upsert($chunk->map(fn ($u) => [
                'alert_id' => $this->alert->id, 'user_id' => $u->id, 'channel' => 'sms',
                'delivery_status' => $ok ? 'sent' : 'failed', 'sent_at' => now(),
            ])->values()->all(), ['alert_id', 'user_id', 'channel'], ['delivery_status', 'sent_at']);
        }
    }
}
