<?php

use App\Enums\Role;
use App\Events\CampusChanged;
use App\Models\EvacEdge;
use App\Models\User;
use Database\Seeders\CampusSeeder;
use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;

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

describe('whole staircase', function () {
    beforeEach(function () {
        config(['evacuai.campus_dataset' => 'uclm']);
        $this->seed(CampusSeeder::class);
    });

    it('blocks every flight of a staircase at once, and tells phones once', function () {
        Event::fake([CampusChanged::class]);
        $this->actingAs(officer());

        $this->patchJson('/api/officer/paths/'.rawurlencode('BE/3/Stairs_Left_3->BE/2/Stairs_Left_2').'/staircase', ['status' => 'blocked'])
            ->assertOk()->assertJsonPath('changed', 2);

        $status = fn (string $id) => DB::table('evac_edges')->where('id', $id)->value('status');
        expect($status('BE/3/Stairs_Left_3->BE/2/Stairs_Left_2'))->toBe('blocked')
            ->and($status('BE/2/Stairs_Left_2->BE/1/Stairs_Left_G'))->toBe('blocked')
            ->and($status('BE/2/Stairs_Right_2->BE/1/Stairs_Right_G'))->toBe('open')
            ->and(DB::table('user_activity_logs')->where('activity_type', 'staircase_status_changed')->count())->toBe(1);
        Event::assertDispatchedTimes(CampusChanged::class, 1);
    });

    it('only works on stairs', function () {
        $this->actingAs(officer());
        $this->patchJson('/api/officer/paths/'.rawurlencode('BE/1/C1_01->BE/1/C1_02').'/staircase', ['status' => 'blocked'])->assertUnprocessable();
    });
});
