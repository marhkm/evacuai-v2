<?php

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
 // ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

/** An account with the given role for officer API tests (RefreshDatabase is used by each officer test file). */
function officerUser(Role $role = Role::SafetyOfficer, bool $active = true): User
{
    return User::forceCreate([
        'name' => ucfirst(str_replace('_', ' ', $role->value)).' '.Str::random(4),
        'email' => Str::lower(Str::random(10)).'@example.test',
        'role' => $role, 'is_active' => $active, 'email_verified_at' => now(),
    ]);
}

/** A real JPEG with seeded shapes: different seeds give visibly different photos (fake()->image() is blank). */
function hazardPhoto(int $seed = 1, int $quality = 85): UploadedFile
{
    mt_srand($seed);
    $img = imagecreatetruecolor(640, 480);
    imagefill($img, 0, 0, imagecolorallocate($img, mt_rand(0, 255), mt_rand(0, 255), mt_rand(0, 255)));
    for ($i = 0; $i < 12; $i++) {
        $x = mt_rand(0, 560);
        $y = mt_rand(0, 400);
        imagefilledrectangle($img, $x, $y, $x + mt_rand(40, 200), $y + mt_rand(40, 200), imagecolorallocate($img, mt_rand(0, 255), mt_rand(0, 255), mt_rand(0, 255)));
    }
    $file = tempnam(sys_get_temp_dir(), 'hz').'.jpg';
    imagejpeg($img, $file, $quality);

    return new UploadedFile($file, "hazard-{$seed}.jpg", 'image/jpeg', null, true);
}

/** The fields every hazard report needs since Part 3: a fresh in-app photo and when it was taken. */
function photoFields(int $seed = 1): array
{
    return ['photo' => hazardPhoto($seed), 'taken_at' => now()->toIso8601String()];
}
