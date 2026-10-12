<?php

namespace App\Models;

use App\Events\SosUpdated;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Lifecycle (from the prototype): pending → acknowledged → resolved; the sender may cancel only while pending.
 *
 * @property int $id
 * @property int $user_id
 * @property ?int $alert_id
 * @property ?string $node_id
 * @property ?string $building_id
 * @property ?int $level
 * @property ?string $message
 * @property string $status
 * @property ?int $acknowledged_by
 * @property ?Carbon $acknowledged_at
 * @property ?Carbon $resolved_at
 * @property Carbon $created_at
 */
class SosAlert extends Model
{
    public const OPEN = ['pending', 'acknowledged'];

    protected $guarded = ['id'];

    protected $attributes = ['status' => 'pending'];

    protected function casts(): array
    {
        return ['acknowledged_at' => 'datetime', 'resolved_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::saved(fn (SosAlert $sos) => event(new SosUpdated($sos)));
    }

    public function isOpen(): bool
    {
        return in_array($this->status, self::OPEN, true);
    }

    public function acknowledge(): void
    {
        $this->update(['status' => 'acknowledged', 'acknowledged_by' => auth()->id(), 'acknowledged_at' => now()]);
    }

    public function resolve(): void
    {
        $this->update(['status' => 'resolved', 'acknowledged_by' => $this->acknowledged_by ?? auth()->id(), 'resolved_at' => now()]);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<User, $this> */
    public function responder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    /** @return HasMany<SosMessage, $this> */
    public function messages(): HasMany
    {
        return $this->hasMany(SosMessage::class)->orderBy('id');
    }
}
