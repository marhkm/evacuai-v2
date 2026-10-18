<?php

namespace App\Support;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use stdClass;

/** Sends Expo push messages (100 per request) on the high-importance "emergency" channel and drops dead tokens. */
class ExpoPush
{
    /**
     * @param  Collection<int, stdClass>  $tokens  rows with token and user_id
     * @param  array<string, mixed>  $data
     * @return list<array{token: string, user_id: int, ok: bool}>
     */
    public static function send(Collection $tokens, string $title, string $body, array $data): array
    {
        $results = [];
        foreach ($tokens->chunk(100) as $chunk) {
            $chunk = $chunk->values();
            $tickets = Http::acceptJson()->post('https://exp.host/--/api/v2/push/send', $chunk->map(fn ($t) => [
                'to' => $t->token,
                'title' => $title,
                'body' => $body,
                'sound' => 'default',
                'priority' => 'high',
                'channelId' => 'emergency', // high-importance Android channel created by the app
                'data' => $data,
            ])->all())->json('data', []);
            foreach ($chunk as $i => $t) {
                $ok = ($tickets[$i]['status'] ?? 'error') === 'ok';
                if (! $ok && ($tickets[$i]['details']['error'] ?? null) === 'DeviceNotRegistered') {
                    DB::table('device_tokens')->where('token', $t->token)->delete();
                }
                $results[] = ['token' => $t->token, 'user_id' => $t->user_id, 'ok' => $ok];
            }
        }

        return $results;
    }
}
