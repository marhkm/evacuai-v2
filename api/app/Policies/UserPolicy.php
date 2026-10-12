<?php

namespace App\Policies;

use App\Enums\Role;
use App\Models\User;

/** Admin panel: safety officers may look up accounts; only admins create, edit or delete them. */
class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->role->canManageIncidents();
    }

    public function view(User $actor, User $user): bool
    {
        return $actor->role->canManageIncidents();
    }

    public function create(User $actor): bool
    {
        return $actor->role === Role::Admin;
    }

    public function update(User $actor, User $user): bool
    {
        return $actor->role === Role::Admin;
    }

    public function delete(User $actor, User $user): bool
    {
        return $actor->role === Role::Admin && ! $actor->is($user);
    }

    public function deleteAny(User $actor): bool
    {
        return $actor->role === Role::Admin;
    }
}
