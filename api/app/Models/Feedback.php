<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * App feedback (manuscript: user satisfaction / ISO 25010 evaluation support).
 *
 * @property int $id
 * @property int $user_id
 * @property int $rating
 * @property ?string $comments
 */
class Feedback extends Model
{
    protected $table = 'feedback';

    protected $guarded = ['id'];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
