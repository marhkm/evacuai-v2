<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
 */
class HazardReport extends Model
{
    protected $guarded = ['id'];

    protected $attributes = ['status' => 'pending'];

    protected function casts(): array
    {
        return ['resolved_at' => 'datetime'];
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
