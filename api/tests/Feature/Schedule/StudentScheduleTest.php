<?php

use App\Enums\Role;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Reader\XLSX\Reader;
use OpenSpout\Writer\CSV\Writer as CsvWriter;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;

uses(RefreshDatabase::class);

const HEADER = ['subject', 'room_code', 'days', 'time_start', 'time_end'];

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    DB::table('rooms')->where('id', 'DEMO/1/R101')->update(['code' => 'R101']);
    DB::table('rooms')->where('id', 'DEMO/2/R201')->update(['code' => 'R-201']);
    $this->student = User::forceCreate(['name' => 'Stu', 'email' => 'stu@example.test', 'role' => Role::Student, 'email_verified_at' => now()]);
    Sanctum::actingAs($this->student);
});

/** @param list<list<mixed>> $rows */
function sheet(array $rows, string $ext = 'xlsx'): UploadedFile
{
    $path = tempnam(sys_get_temp_dir(), 'sched').'.'.$ext;
    $w = $ext === 'csv' ? new CsvWriter : new XlsxWriter;
    $w->openToFile($path);
    foreach ($rows as $r) {
        $w->addRow(Row::fromValues($r));
    }
    $w->close();

    return new UploadedFile($path, "schedule.{$ext}", null, null, true);
}

function upload(UploadedFile $file)
{
    return test()->post('/api/me/schedule', ['file' => $file], ['Accept' => 'application/json']);
}

it('uploads an xlsx and replaces the old schedule', function () {
    DB::table('schedules')->insert(['user_id' => $this->student->id, 'subject' => 'Old', 'room_id' => 'DEMO/1/R101', 'days' => 'M', 'time_start' => '07:00', 'time_end' => '08:00']);

    upload(sheet([HEADER, ['IT 101', 'r 101', 'MWF', '08:00', '09:30'], ['IT 102', 'R201', 'TTH', '13:00', '14:30']]))
        ->assertOk()->assertJsonCount(2, 'classes');

    expect(DB::table('schedules')->where('user_id', $this->student->id)->pluck('subject')->sort()->values()->all())->toBe(['IT 101', 'IT 102']);
});

it('reads a csv the same way', function () {
    upload(sheet([HEADER, ['IT 101', 'R101', 'MWF', '8:00', '9:30']], 'csv'))->assertOk()
        ->assertJsonPath('classes.0.time_start', '08:00')->assertJsonPath('classes.0.room_code', 'R101');
});

it('reads Excel times stored as numbers or with AM/PM', function () {
    upload(sheet([HEADER, ['IT 101', 'R101', 'MWF', 0.375, '1:30 PM']]))->assertOk()
        ->assertJsonPath('classes.0.time_start', '09:00')->assertJsonPath('classes.0.time_end', '13:30');
});

it('rejects the whole file when one row is bad, saving nothing', function () {
    upload(sheet([HEADER, ['IT 101', 'R101', 'MWF', '08:00', '09:30'], ['X', 'ZZ-9', 'M', '08:00', '09:00']]))
        ->assertUnprocessable()->assertJsonPath('errors.file.0', 'Row 3: unknown room code ZZ-9');
    expect(DB::table('schedules')->count())->toBe(0);

    upload(sheet([['name', 'room'], ['a', 'b']]))->assertUnprocessable()
        ->assertJsonPath('errors.file.0', 'The first row must be: subject, room_code, days, time_start, time_end');
});

it('refuses more than 60 rows and other file types', function () {
    $rows = array_merge([HEADER], array_fill(0, 61, ['IT 101', 'R101', 'M', '08:00', '09:00']));
    upload(sheet($rows))->assertUnprocessable()->assertJsonPath('errors.file.0', 'Too many rows (60 at most).');
    upload(UploadedFile::fake()->create('schedule.pdf', 10, 'application/pdf'))->assertUnprocessable();
});

it('never touches another user\'s classes', function () {
    $other = User::forceCreate(['name' => 'O', 'email' => 'o@example.test', 'email_verified_at' => now()]);
    DB::table('schedules')->insert(['user_id' => $other->id, 'subject' => 'Theirs', 'room_id' => 'DEMO/1/R101', 'days' => 'M', 'time_start' => '07:00', 'time_end' => '08:00']);

    upload(sheet([HEADER, ['IT 101', 'R101', 'MWF', '08:00', '09:30']]))->assertOk();
    $this->deleteJson('/api/me/schedule')->assertNoContent();

    expect(DB::table('schedules')->where('user_id', $other->id)->count())->toBe(1);
});

it('lists and clears the schedule', function () {
    upload(sheet([HEADER, ['IT 101', 'R101', 'MWF', '08:00', '09:30']]))->assertOk();
    $this->getJson('/api/me/schedule')->assertOk()->assertJsonPath('classes.0.subject', 'IT 101');

    $this->deleteJson('/api/me/schedule')->assertNoContent();
    $this->getJson('/api/me/schedule')->assertJsonCount(0, 'classes');
});

it('gives a signed template link with both sheets', function () {
    $url = $this->getJson('/api/me/schedule/template-link')->assertOk()->json('url');

    $res = $this->get($url)->assertOk();
    $path = tempnam(sys_get_temp_dir(), 'tpl').'.xlsx';
    file_put_contents($path, $res->streamedContent());
    $reader = new Reader;
    $reader->open($path);
    $names = [];
    foreach ($reader->getSheetIterator() as $s) {
        $names[] = $s->getName();
    }
    $reader->close();
    expect($names)->toBe(['Schedule', 'Rooms']);

    $this->get(strtok($url, '?'))->assertForbidden();
});

it('no longer has the admin import page', function () {
    $admin = User::forceCreate(['name' => 'A', 'email' => 'a@example.test', 'role' => Role::Admin, 'email_verified_at' => now()]);
    $this->actingAs($admin, 'admin')->get('/admin/import-schedules')->assertNotFound();
});

it('stops reading a huge sheet early instead of loading every row', function () {
    $rows = array_merge([HEADER], array_fill(0, 60000, ['IT 101', 'R101', 'M', '08:00', '09:00']));
    $file = sheet($rows);
    gc_collect_cycles();
    memory_reset_peak_usage();
    $before = memory_get_usage();

    upload($file)->assertUnprocessable()->assertJsonPath('errors.file.0', 'Too many rows (60 at most).');
    expect(memory_get_peak_usage() - $before)->toBeLessThan(8 * 1024 * 1024);
});
