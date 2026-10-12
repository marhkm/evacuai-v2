<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Check-in Safe: one row per user per alert.
 *
 * @property int $user_id
 * @property int $alert_id
 * @property ?string $assembly_node_id
 * @property string $status
 * @property Carbon $checked_in_at
 */
class EvacuationLog extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['checked_in_at' => 'datetime'];
    }
}
