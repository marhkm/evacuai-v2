<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Read-only view of the audit trail. Written by App\Support\Activity.
 *
 * @property string $activity_type
 * @property ?array<string, mixed> $details
 * @property ?string $ip_address
 * @property Carbon $created_at
 */
class ActivityLog extends Model
{
    protected $table = 'user_activity_logs';

    public $timestamps = false;

    protected function casts(): array
    {
        return ['details' => 'array', 'created_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
