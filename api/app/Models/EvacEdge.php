<?php

namespace App\Models;

use App\Events\CampusChanged;
use App\Support\Activity;
use Illuminate\Database\Eloquent\Model;

/**
 * One path segment of the campus graph. Geometry comes from CampusSeeder; officers only change `status`.
 *
 * @property string $id
 * @property string $from_node_id
 * @property string $to_node_id
 * @property string $type
 * @property string $status
 * @property ?int $updated_by
 */
class EvacEdge extends Model
{
    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = ['status'];

    protected static function booted(): void
    {
        static::updating(function (EvacEdge $edge) {
            if ($edge->isDirty('status')) {
                $edge->updated_by = auth()->id();
            }
        });
        static::updated(function (EvacEdge $edge) {
            if ($edge->wasChanged('status')) {
                Activity::log('path_status_changed', ['edge' => $edge->id, 'from' => $edge->getOriginal('status'), 'to' => $edge->status]);
                event(new CampusChanged);
            }
        });
    }
}
