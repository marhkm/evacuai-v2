<?php

namespace App\Models;

use App\Enums\Role;
use App\Support\Activity;
use Database\Factories\UserFactory;
use Filament\Models\Contracts\FilamentUser;
use Filament\Panel;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * @property Role $role
 * @property bool $is_active
 */
// `role` is deliberately not fillable: only an admin action may change it (no self-promotion via registration).
#[Fillable(['name', 'email', 'password', 'department', 'phone'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements FilamentUser
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $attributes = ['role' => 'student', 'is_active' => true]; // mirror DB defaults in memory

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'consented_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        // Audit trail for privilege changes (who promoted whom).
        static::updated(function (User $user) {
            if ($user->wasChanged('role')) {
                Activity::log('role_changed', [
                    'target_user_id' => $user->id,
                    'from' => $user->getOriginal('role')?->value,
                    'to' => $user->role->value,
                ]);
            }
        });
    }

    public function canAccessPanel(Panel $panel): bool
    {
        return $this->is_active && $this->role === Role::Admin; // officers work in the Command Center (/command)
    }
}
