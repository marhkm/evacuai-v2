<?php

namespace App\Support;

use App\Exceptions\InvalidState;
use App\Models\Alert;
use App\Models\User;

/** Every officer action on alerts, shared by the officer API and the admin panel. */
class AlertActions
{
    /** @param array<string, mixed> $data hazard_type, severity_level, building_id?, message, is_drill?, translations? */
    public static function broadcast(User $by, array $data): Alert
    {
        $data['translations'] = array_filter($data['translations'] ?? []) ?: null;
        $alert = Alert::create($data + [
            'issued_by' => $by->id,
            'issued_at' => now(),
            'status' => 'active',
            'source' => 'admin',
            'verified' => true,
        ]);
        if (! $alert->is_drill) {
            // The officer's broadcast verifies the matching reports, so routing starts avoiding those rooms.
            ReportClusters::recentReports($alert->hazard_type, $alert->building_id)->get()
                ->each->update(['status' => 'verified', 'verified_by' => $by->id, 'alert_id' => $alert->id]);
        }
        AlertDispatcher::dispatch($alert);

        return $alert;
    }

    public static function publish(Alert $alert, User $by, string $message): Alert
    {
        self::expect($alert->status === 'draft', 'Only draft alerts can be published.');
        $alert->update(['message' => $message, 'status' => 'active', 'verified' => true, 'issued_by' => $by->id, 'issued_at' => now()]);
        AlertDispatcher::dispatch($alert);

        return $alert;
    }

    public static function discard(Alert $alert): Alert
    {
        self::expect($alert->status === 'draft', 'Only draft alerts can be discarded.');
        $alert->update(['status' => 'retracted', 'resolved_at' => now()]);

        return $alert;
    }

    public static function confirm(Alert $alert): Alert
    {
        self::expect($alert->status === 'active' && ! $alert->verified, 'Only active unverified alerts can be confirmed.');

        return self::change($alert, ['verified' => true]);
    }

    public static function resolve(Alert $alert): Alert
    {
        self::expect($alert->status === 'active', 'Only active alerts can be resolved.');

        return self::change($alert, ['status' => 'resolved', 'resolved_at' => now()]);
    }

    public static function retract(Alert $alert): Alert
    {
        self::expect($alert->status === 'active', 'Only active alerts can be retracted.');

        return self::change($alert, ['status' => 'retracted', 'resolved_at' => now()]);
    }

    /** @param array<string, mixed> $attrs */
    private static function change(Alert $alert, array $attrs): Alert
    {
        $alert->update($attrs);
        AlertDispatcher::update($alert); // live update only; no second push/SMS

        return $alert;
    }

    private static function expect(bool $ok, string $message): void
    {
        if (! $ok) {
            throw new InvalidState($message);
        }
    }
}
