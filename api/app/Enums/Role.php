<?php

namespace App\Enums;

enum Role: string
{
    case Student = 'student';
    case Faculty = 'faculty';
    case Staff = 'staff';
    case SafetyOfficer = 'safety_officer';
    case Admin = 'admin';

    public function canManageIncidents(): bool
    {
        return $this === self::Admin || $this === self::SafetyOfficer;
    }
}
