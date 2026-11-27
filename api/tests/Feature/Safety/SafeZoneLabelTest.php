<?php

use App\Support\Places;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// A safe zone is its own place: "Open Ground 2 · Basic Ed", not "Basic Education Building · Ground · Open Ground 2 · …"
// (which read as being safe in two places), and Nature's Spring is not "in" Annex 1 where its point is filed.
it('names a safe zone by itself, not by the building its point is filed under', function () {
    config(['evacuai.campus_dataset' => 'uclm']);
    $this->seed(CampusSeeder::class);

    expect(Places::label(null, null, 'BE/1/AP_Field'))->toBe('Open Ground 2 · Basic Ed')
        ->and(Places::label(null, null, 'A1/1/AP_NaturesSpring'))->toBe("Nature's Spring (off campus)")
        ->and(Places::label('BE', 1, 'BE/1/AP_Field'))->toBe('Open Ground 2 · Basic Ed')
        ->and(Places::label('BE', 2, null, 'BE/2/Room_BE201'))->toContain('Basic Education Building'); // rooms keep their building
});
