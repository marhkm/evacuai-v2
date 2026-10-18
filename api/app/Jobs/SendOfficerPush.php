<?php

namespace App\Jobs;

use App\Enums\Role;
use App\Models\Alert;
use App\Models\SosAlert;
use App\Support\ExpoPush;
use App\Support\Places;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

/** Push to the phones of active safety officers and admins (new SOS, unverified alert from reports). */
class SendOfficerPush implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @param array<string, mixed> $data */
    public function __construct(public string $title, public string $body, public array $data) {}

    public static function forSos(SosAlert $sos): void
    {
        $place = Places::label($sos->building_id, $sos->level, $sos->node_id) ?? 'location not shared';
        self::dispatch("SOS: {$place}", $sos->message ? mb_strimwidth($sos->message, 0, 80, '…') : 'Needs help', ['sos_id' => $sos->id]);
    }

    public static function forUnverifiedAlert(Alert $alert): void
    {
        $hazard = str($alert->hazard_type)->replace('_', ' ')->title();
        $where = $alert->building_id ? DB::table('buildings')->where('id', $alert->building_id)->value('name') : 'campus';
        self::dispatch("Unverified alert: {$hazard} at {$where}", $alert->message, ['alert_id' => $alert->id]);
    }

    public function handle(): void
    {
        $tokens = DB::table('device_tokens')
            ->join('users', 'users.id', '=', 'device_tokens.user_id')
            ->where('users.is_active', true)
            ->whereIn('users.role', [Role::SafetyOfficer->value, Role::Admin->value])
            ->select('device_tokens.token', 'device_tokens.user_id')
            ->orderBy('device_tokens.id')
            ->get();

        ExpoPush::send($tokens, $this->title, $this->body, $this->data);
    }
}
