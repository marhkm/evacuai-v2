<?php

use App\Models\SosAlert;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// Officers' live feed (Command Center, Responder mode): active safety officers and admins.
Broadcast::channel('officers', function (User $user) {
    return $user->is_active && $user->role->canManageIncidents();
});

// SOS chat: the sender and incident managers only.
Broadcast::channel('sos.{id}', function (User $user, int $id) {
    return $user->role->canManageIncidents() || SosAlert::whereKey($id)->where('user_id', $user->id)->exists();
});
