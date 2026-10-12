<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $hazard_type
 * @property string $severity_level
 * @property string $message
 * @property string $status
 * @property string $source
 * @property bool $verified
 * @property bool $is_drill
 * @property ?string $building_id
 * @property ?array{ceb?: string, fil?: string} $translations
 * @property ?string $external_id
 * @property ?Carbon $issued_at
 * @property ?Carbon $resolved_at
 */
class Alert extends Model
{
    protected $guarded = ['id'];

    protected $attributes = ['status' => 'active', 'source' => 'admin', 'verified' => true, 'is_drill' => false];

    protected function casts(): array
    {
        return ['translations' => 'array', 'verified' => 'boolean', 'is_drill' => 'boolean', 'issued_at' => 'datetime', 'resolved_at' => 'datetime'];
    }

    /** The incident check-ins, SOS and location events belong to: the most recent active alert. */
    public static function current(): ?self
    {
        return self::where('status', 'active')->latest('issued_at')->first();
    }

    public function issuer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by');
    }

    public function building(): BelongsTo
    {
        return $this->belongsTo(Building::class);
    }

    public function reports(): HasMany
    {
        return $this->hasMany(HazardReport::class);
    }
}
