<?php

namespace App\Models;

use App\Events\SosUpdated;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $sos_alert_id
 * @property int $sender_id
 * @property string $body
 * @property Carbon $created_at
 */
class SosMessage extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::created(fn (SosMessage $m) => event(new SosUpdated($m->sos()->firstOrFail())));
    }

    /** @return BelongsTo<SosAlert, $this> */
    public function sos(): BelongsTo
    {
        return $this->belongsTo(SosAlert::class, 'sos_alert_id');
    }

    /** @return BelongsTo<User, $this> */
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
