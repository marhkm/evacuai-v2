<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\Alert;
use App\Models\SosAlert;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * A finished sample drill so every dashboard screen has data on a fresh test stack: Safety Monitor (choose the
 * drill), dashboard stats, drill report CSV, Campus 3D replay, SOS history, feedback. Runs once (keyed by
 * external_id); never in production. The sample people have no password, so nobody can sign in as them.
 */
class DemoDrillSeeder extends Seeder
{
    public const EXTERNAL_ID = 'demo:sample-drill';

    public function run(): void
    {
        if (app()->isProduction() || Alert::where('external_id', self::EXTERNAL_ID)->exists()) {
            return;
        }
        $rooms = DB::table('evac_nodes')->where('type', 'room')->orderBy('id')->pluck('id')->values();
        $assembly = DB::table('assembly_points')->orderBy('id')->value('node_id');
        $officer = User::where('role', Role::SafetyOfficer)->orderBy('id')->first();
        if ($rooms->isEmpty() || ! $assembly || ! $officer) {
            return; // campus or demo accounts not seeded yet
        }

        $issued = now()->subDays(2)->setTime(10, 0);
        $at = fn (int $seconds) => $issued->copy()->addSeconds($seconds);
        $alert = Alert::create([
            'external_id' => self::EXTERNAL_ID,
            'hazard_type' => 'earthquake',
            'severity_level' => 'high',
            'message' => 'Sample drill: earthquake. Drop, cover and hold on, then evacuate to the assembly point.',
            'is_drill' => true,
            'status' => 'resolved',
            'source' => 'admin',
            'verified' => true,
            'issued_by' => $officer->id,
            'issued_at' => $issued,
            'resolved_at' => $at(20 * 60),
        ]);

        $stairs = DB::table('evac_nodes')->where('type', 'stairwell')->orderBy('id')->pluck('id')->values();
        foreach (range(1, 12) as $i) {
            $person = self::samplePerson($i);

            // Where the app saw them: their classroom, then a stair landing on the way out.
            $room = $rooms[($i * 3) % $rooms->count()];
            $events = [['node_id' => $room, 'source' => 'schedule', 'confidence' => 'likely', 'created_at' => $at(20 + $i * 7)]];
            if ($stairs->isNotEmpty() && $i <= 10) {
                $events[] = ['node_id' => $stairs[$i % $stairs->count()], 'source' => 'barometer', 'confidence' => 'likely', 'created_at' => $at(120 + $i * 15)];
            }
            foreach ($events as $e) {
                $node = DB::table('evac_nodes')->where('id', $e['node_id'])->first();
                DB::table('location_events')->insert($e + [
                    'user_id' => $person->id, 'alert_id' => $alert->id, 'room_id' => $node?->room_id,
                    'building_id' => $node?->building_id, 'level' => $node?->level,
                ]);
            }

            // 9 reach the assembly point (3 to 11 minutes), 1 needs help, 2 never check in.
            if ($i <= 9) {
                DB::table('evacuation_logs')->insert(['user_id' => $person->id, 'alert_id' => $alert->id, 'status' => 'safe',
                    'assembly_node_id' => $assembly, 'checked_in_at' => $at(180 + $i * 55)]);
            } elseif ($i === 10) {
                DB::table('evacuation_logs')->insert(['user_id' => $person->id, 'alert_id' => $alert->id, 'status' => 'needs_help',
                    'assembly_node_id' => null, 'checked_in_at' => $at(300)]);
                $this->sos($alert, $person, $officer, $room, $at);
            }
        }

        foreach ([[1, 5, 'Clear steps, easy to follow.'], [2, 4, 'The 3D view helped me see the stairs.'], [3, 3, null]] as [$i, $rating, $comments]) {
            DB::table('feedback')->insert(['user_id' => User::where('email', sprintf('sample%02d@evacuai.test', $i))->value('id'),
                'rating' => $rating, 'comments' => $comments, 'created_at' => $at(25 * 60), 'updated_at' => $at(25 * 60)]);
        }
    }

    /** Sample student #$i (sampleNN@evacuai.test). No password: used by the seed and evacuai:simulate, never for sign-in. */
    public static function samplePerson(int $i): User
    {
        $person = User::firstOrNew(['email' => sprintf('sample%02d@evacuai.test', $i)]);
        if (! $person->exists) {
            $person->forceFill([
                'name' => sprintf('Sample Student %02d', $i),
                'role' => Role::Student,
                'department' => $i % 2 ? 'CCS' : 'CBA',
                'email_verified_at' => now(),
                'consented_at' => now(),
            ])->save();
        }

        return $person;
    }

    private function sos(Alert $alert, User $person, User $officer, string $room, \Closure $at): void
    {
        $node = DB::table('evac_nodes')->where('id', $room)->first();
        SosAlert::withoutEvents(function () use ($alert, $person, $officer, $node, $at) {
            $sos = SosAlert::create([
                'user_id' => $person->id, 'alert_id' => $alert->id, 'node_id' => $node?->id, 'building_id' => $node?->building_id,
                'level' => $node?->level, 'message' => 'Sample: twisted my ankle on the stairs.', 'status' => 'resolved',
                'acknowledged_by' => $officer->id, 'acknowledged_at' => $at(345), 'resolved_at' => $at(900),
            ]);
            $sos->forceFill(['created_at' => $at(310), 'updated_at' => $at(900)])->saveQuietly();
            DB::table('sos_messages')->insert([
                ['sos_alert_id' => $sos->id, 'sender_id' => $officer->id, 'body' => 'Stay where you are, we are on the way.', 'created_at' => $at(350)],
                ['sos_alert_id' => $sos->id, 'sender_id' => $person->id, 'body' => 'Okay, I am by the stair door.', 'created_at' => $at(380)],
            ]);
        });
    }
}
