<?php

namespace App\Models;

use App\Events\CampusChanged;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $reported_by
 * @property string $building_id
 * @property int $level
 * @property ?string $room_id
 * @property string $hazard_type
 * @property string $status
 * @property ?int $alert_id
 * @property ?string $photo_path
 * @property ?Carbon $photo_taken_at
 * @property ?string $photo_hash 64-bit dHash, hex (ReportPhoto::dhash)
 * @property ?int $duplicate_of the earlier report with the same photo
 * @property ?string $reporter_place match | elsewhere | unknown
 * @property ?string $reporter_place_label
 * @property ?string $ai_verdict match | no_match | unclear | unavailable
 * @property ?string $ai_note
 * @property bool $auto_verified
 * @property ?string $dismiss_reason false | other
 */
class HazardReport extends Model
{
    protected $guarded = ['id'];

    protected $attributes = ['status' => 'pending'];

    protected function casts(): array
    {
        return ['resolved_at' => 'datetime', 'photo_taken_at' => 'datetime', 'auto_verified' => 'boolean'];
    }

    protected static function booted(): void
    {
        // Verified hazard rooms are on every map and change routes: tell apps to refetch when that set changes.
        static::saved(function (HazardReport $r) {
            if ($r->wasChanged('status') && ($r->status === 'verified' || $r->getOriginal('status') === 'verified')) {
                rescue(fn () => event(new CampusChanged));
            }
        });
    }

    /** @return BelongsTo<User, $this> */
    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_by');
    }

    /** @return BelongsTo<Building, $this> */
    public function building(): BelongsTo
    {
        return $this->belongsTo(Building::class);
    }

    /** @return BelongsTo<Alert, $this> */
    public function alert(): BelongsTo
    {
        return $this->belongsTo(Alert::class);
    }
}
