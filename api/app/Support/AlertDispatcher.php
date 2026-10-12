<?php

namespace App\Support;

use App\Events\AlertBroadcast;
use App\Jobs\SendAlertPush;
use App\Jobs\SendAlertSms;
use App\Models\Alert;

/** One place that fans an alert out: live (Reverb), push (Expo), and SMS (Semaphore, only when configured). */
class AlertDispatcher
{
    public static function dispatch(Alert $alert): void
    {
        event(new AlertBroadcast($alert));
        SendAlertPush::dispatch($alert);
        if (config('services.semaphore.key')) {
            SendAlertSms::dispatch($alert);
        }
    }

    /** Status change (resolved/retracted/confirmed): live update only, no new push or SMS. */
    public static function update(Alert $alert): void
    {
        event(new AlertBroadcast($alert));
    }

    public static function title(Alert $alert): string
    {
        $type = strtoupper(str_replace('_', ' ', $alert->hazard_type));

        return ($alert->is_drill ? '[DRILL] ' : '').($alert->verified ? '' : 'UNVERIFIED ').$type.' ALERT';
    }
}
