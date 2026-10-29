<?php

namespace App\Models;

use App\Events\SosUpdated;
use App\Exceptions\InvalidState;
use App\Support\Activity;
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
        static::saved(function (SosAlert $sos) {
            if ($sos->wasRecentlyCreated || $sos->wasChanged('status')) {
                Activity::log($sos->wasRecentlyCreated ? 'sos_sent' : "sos_{$sos->status}", ['sos_id' => $sos->id]);
            }
            event(new SosUpdated($sos));
        });
    }

    public function isOpen(): bool
    {
        return in_array($this->status, self::OPEN, true);
    }

    /** The signed-in officer takes the case, unless another officer already has it (then returns that officer). */
    public function acknowledge(): ?User
    {
        /** @var User $officer */
        $officer = auth()->user();

        return $this->claimFor($officer);
    }

    /**
     * Makes $officer the owner when nobody handles the case yet. The claim is one conditional UPDATE (unowned and still
     * open), so of two officers replying at once exactly one wins, and a case the student cancelled meanwhile stays
     * closed. Returns the other officer who handles it, or null when $officer does.
     *
     * @throws InvalidState when the case closed meanwhile
     */
    public function claimFor(User $officer): ?User
    {
        if ($this->acknowledged_by === null) {
            $wasPending = $this->status === 'pending';
            $claimed = self::whereKey($this->id)->whereNull('acknowledged_by')->whereIn('status', self::OPEN)
                ->update(['acknowledged_by' => $officer->id, 'status' => 'acknowledged', 'acknowledged_at' => $this->acknowledged_at ?? now()]);
            $this->refresh();
            if (! $this->isOpen()) {
                throw new InvalidState('This SOS is closed.');
            }
            if ($claimed) { // the raw update skips model events: log and broadcast as a save would
                if ($wasPending) {
                    Activity::log('sos_acknowledged', ['sos_id' => $this->id]);
                }
                event(new SosUpdated($this));
            }
        }

        return $this->acknowledged_by === $officer->id ? null : $this->responder;
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
