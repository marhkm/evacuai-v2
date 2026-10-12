<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
class UserResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'department' => $this->department,
            'phone' => $this->phone,
            'email_verified' => $this->email_verified_at !== null,
            'consented' => $this->consented_at !== null,
            'has_password' => $this->password !== null,
        ];
    }
}
