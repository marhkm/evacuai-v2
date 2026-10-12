<?php

use App\Enums\Role;
use App\Events\AlertBroadcast;
use App\Models\HazardReport;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Event::fake([AlertBroadcast::class]);
    Storage::fake('local');
    $this->student = User::forceCreate(['name' => 'Juan', 'email' => 'j@example.test', 'email_verified_at' => now()]);
});

function reportWithPhoto(UploadedFile $photo)
{
    return test()->post('/api/hazard-reports', [
        'hazard_type' => 'fire', 'building_id' => 'DEMO', 'level' => '1', 'description' => 'Smoke', 'photo' => $photo,
    ], ['Accept' => 'application/json']);
}

it('stores a re-encoded, downscaled JPEG on the private disk', function () {
    Sanctum::actingAs($this->student);
    reportWithPhoto(UploadedFile::fake()->image('smoke.png', 2000, 1500))->assertCreated()->assertJsonPath('report.has_photo', true);

    $path = HazardReport::sole()->photo_path;
    expect($path)->toStartWith('reports/')->toEndWith('.jpg');
    Storage::disk('local')->assertExists($path);
    [$w, $h, $type] = getimagesizefromstring(Storage::disk('local')->get($path));
    expect([$w, $h, $type])->toBe([1600, 1200, IMAGETYPE_JPEG]);
});

it('strips EXIF metadata such as the GPS position', function () {
    $img = imagecreatetruecolor(320, 240);
    ob_start();
    imagejpeg($img);
    $jpeg = (string) ob_get_clean();
    $payload = "Exif\0\0".'II*'."\0".'GPS-SECRET-10.3270N-123.9500E';
    $withExif = substr($jpeg, 0, 2)."\xFF\xE1".pack('n', strlen($payload) + 2).$payload.substr($jpeg, 2); // APP1 right after SOI
    $file = tempnam(sys_get_temp_dir(), 'exif').'.jpg';
    file_put_contents($file, $withExif);

    Sanctum::actingAs($this->student);
    reportWithPhoto(new UploadedFile($file, 'phone.jpg', 'image/jpeg', null, true))->assertCreated();

    $stored = Storage::disk('local')->get(HazardReport::sole()->photo_path);
    expect($stored)->not->toContain('GPS-SECRET')->not->toContain("Exif\0\0");
});

it('rejects non-images, unreadable files and oversized uploads', function () {
    Sanctum::actingAs($this->student);
    reportWithPhoto(UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf'))->assertUnprocessable()->assertJsonValidationErrors('photo');
    reportWithPhoto(UploadedFile::fake()->create('fake.jpg', 10, 'image/jpeg'))->assertUnprocessable()->assertJsonValidationErrors('photo'); // not really an image
    reportWithPhoto(UploadedFile::fake()->image('huge.jpg')->size(9000))->assertUnprocessable()->assertJsonValidationErrors('photo');
    expect(HazardReport::count())->toBe(0);
});

it('shows photos to officers only', function () {
    Sanctum::actingAs($this->student);
    reportWithPhoto(UploadedFile::fake()->image('smoke.jpg', 800, 600))->assertCreated();
    $report = HazardReport::sole();
    app('auth')->forgetGuards();

    $this->get(route('reports.photo', $report))->assertForbidden();
    $this->actingAs($this->student)->get(route('reports.photo', $report))->assertForbidden();
    $officer = User::forceCreate(['name' => 'Officer', 'email' => 'so@example.test', 'role' => Role::SafetyOfficer]);
    $this->actingAs($officer)->get(route('reports.photo', $report))->assertOk()->assertHeader('content-type', 'image/jpeg');
});

it('deletes photos of closed reports after the retention period, and with the account', function () {
    Sanctum::actingAs($this->student);
    reportWithPhoto(UploadedFile::fake()->image('a.jpg'))->assertCreated();
    reportWithPhoto(UploadedFile::fake()->image('b.jpg'))->assertCreated();
    [$old, $open] = HazardReport::orderBy('id')->get()->all();
    $old->forceFill(['status' => 'resolved', 'updated_at' => now()->subDays(31)])->saveQuietly();
    $oldPath = $old->photo_path;

    $this->artisan('evacuai:purge-personal-data')->assertSuccessful();
    Storage::disk('local')->assertMissing($oldPath);
    expect($old->fresh()->photo_path)->toBeNull();
    Storage::disk('local')->assertExists($open->photo_path); // still open: kept

    $this->deleteJson('/api/me')->assertNoContent();
    Storage::disk('local')->assertMissing($open->photo_path);
});
