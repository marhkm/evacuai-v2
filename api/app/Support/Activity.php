<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** Audit trail (user_activity_logs). IP and device are purged after the retention period (evacuai:purge-personal-data). */
class Activity
{
    /** @param array<string, mixed> $details */
    public static function log(string $type, array $details = [], ?int $userId = null): void
    {
        $request = app()->runningInConsole() && ! app()->runningUnitTests() ? null : request();

        DB::table('user_activity_logs')->insert([
            'user_id' => $userId ?? auth()->id(),
            'activity_type' => $type,
            'details' => $details ? json_encode($details) : null,
            'ip_address' => $request?->ip(),
            'device_info' => $request ? substr((string) $request->userAgent(), 0, 200) ?: null : null,
            'created_at' => now(),
        ]);
    }
}
