<?php

use App\Enums\Role;
use App\Events\CampusChanged;
use App\Filament\Pages\ImportSchedules;
use App\Models\EvacEdge;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Livewire\Livewire;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
});

function officer(): User
{
    return User::forceCreate(['name' => 'SO', 'email' => 'so@example.test', 'role' => Role::SafetyOfficer, 'email_verified_at' => now()]);
}

describe('paths', function () {
    it('lets an officer block a path, recording who did it and telling apps to refresh', function () {
        Event::fake([CampusChanged::class]);
        $so = officer();
        $this->actingAs($so);
        $edge = EvacEdge::findOrFail('DEMO/1/C1->DEMO/1/C2');

        $this->patchJson('/api/officer/paths/'.rawurlencode($edge->getKey()), ['status' => 'blocked'])->assertOk();

        expect($edge->fresh()->status)->toBe('blocked')->and($edge->fresh()->updated_by)->toBe($so->id);
        Event::assertDispatched(CampusChanged::class);
    });

    it('broadcasts campus changes on the public campus channel', function () {
        $e = new CampusChanged;
        expect($e->broadcastOn())->toEqual([new Channel('campus')])->and($e->broadcastAs())->toBe('campus.updated');
    });

    it('hides elevator edges, which are never routed', function () {
        // 12 demo edges, 1 elevator: officers never see (or block) the elevator.
        $this->actingAs(officer())->getJson('/api/officer/paths')->assertOk()->assertJsonCount(11, 'paths');
    });
});

describe('schedules', function () {
    beforeEach(function () {
        DB::table('rooms')->where('id', 'DEMO/1/R101')->update(['code' => 'R101']);
        DB::table('rooms')->where('id', 'DEMO/2/R201')->update(['code' => 'R201']);
        $this->student = User::forceCreate(['name' => 'Stu', 'email' => 'stu@example.test', 'email_verified_at' => now()]);
    });

    it('imports a schedule CSV, matching registrar room codes and reporting bad rows', function () {
        $this->actingAs(officer());
        $csv = "email,subject,room_code,days,time_start,time_end\n"
            ."stu@example.test,IT 101,R101,MWF,08:00,09:30\n"
            ."stu@example.test,IT 102,R201,TTH,13:00,14:30\n"
            ."ghost@example.test,X,R101,M,08:00,09:00\n"
            ."stu@example.test,Y,NOPE,M,08:00,09:00\n";
        $file = UploadedFile::fake()->createWithContent('schedules.csv', $csv);

        Livewire::test(ImportSchedules::class)
            ->set('file', $file)
            ->call('import')
            ->assertSee('Imported 2 classes')
            ->assertSee('Row 4: unknown email ghost@example.test')
            ->assertSee('Row 5: unknown room code NOPE');

        expect(DB::table('schedules')->where('user_id', $this->student->id)->count())->toBe(2);
    });

    it('returns the class happening now in Manila time', function () {
        DB::table('schedules')->insert([
            ['user_id' => $this->student->id, 'subject' => 'IT 101', 'room_id' => 'DEMO/1/R101', 'days' => 'MWF', 'time_start' => '08:00', 'time_end' => '09:30'],
            ['user_id' => $this->student->id, 'subject' => 'IT 102', 'room_id' => 'DEMO/2/R201', 'days' => 'TTH', 'time_start' => '13:00', 'time_end' => '14:30'],
        ]);
        Sanctum::actingAs($this->student);

        $this->travelTo(Carbon::parse('2026-10-14 08:45', 'Asia/Manila')); // Wednesday
        $this->getJson('/api/me/schedule/now')->assertOk()
            ->assertJsonPath('class.room_id', 'DEMO/1/R101')->assertJsonPath('class.building', 'DEMO')->assertJsonPath('class.level', 1);

        $this->travelTo(Carbon::parse('2026-10-15 13:10', 'Asia/Manila')); // Thursday: TTH, not T
        $this->getJson('/api/me/schedule/now')->assertJsonPath('class.subject', 'IT 102');

        $this->travelTo(Carbon::parse('2026-10-14 12:00', 'Asia/Manila'));
        $this->getJson('/api/me/schedule/now')->assertOk()->assertJsonPath('class', null);
    });
});
