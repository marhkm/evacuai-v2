<?php

namespace App\Http\Resources;

use App\Models\Alert;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Alert */
class AlertResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'hazard_type' => $this->hazard_type,
            'severity_level' => $this->severity_level,
            'message' => $this->message,
            'translations' => $this->translations,
            'status' => $this->status,
            'source' => $this->source,
            'verified' => $this->verified,
            'is_drill' => $this->is_drill,
            'building_id' => $this->building_id,
            'issued_at' => $this->issued_at?->toIso8601String(),
            'resolved_at' => $this->resolved_at?->toIso8601String(),
        ];
    }
}
