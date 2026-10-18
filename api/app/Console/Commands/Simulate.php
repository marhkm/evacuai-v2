<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Jobs\SendOfficerPush;
use App\Models\Alert;
use App\Models\EvacEdge;
use App\Models\HazardReport;
use App\Models\SosAlert;
use App\Models\User;
use App\Notifications\SosRaised;
use App\Support\AlertDispatcher;
use App\Support\Feeds;
use App\Support\ReportClusters;
use Database\Seeders\DemoDrillSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Lets one tester see the multi-user features live (test stacks only). Run it while the app and dashboard are open:
 *   docker compose -f docker/compose.yml exec app php artisan evacuai:simulate drill
 */
class Simulate extends Command
{
    protected $signature = 'evacuai:simulate
        {scenario : drill | reports | sos | block | reopen | feed}
        {--people=12 : drill: how many sample people take part}
        {--seconds=90 : drill: how long the drill runs in real time}
        {--hazard=fire : reports: hazard type}
        {--keep : drill: leave the alert active at the end (resolve it in the dashboard)}';

    protected $description = 'Simulate other people using EvacuAI: a live drill, hazard reports, an SOS, a blocked stair, hazard-feed drafts';

    public function handle(): int
    {
        if (app()->isProduction()) {
            $this->error('Simulations are for test stacks only.');

            return self::FAILURE;
        }

        return match ($this->argument('scenario')) {
            'drill' => $this->drill(),
            'reports' => $this->reports(),
            'sos' => $this->sos(),
            'block' => $this->block(),
            'reopen' => $this->reopen(),
            'feed' => $this->feed(),
            default => $this->invalid(),
        };
    }

    /** A drill alert goes out; sample people are seen in their rooms, move to the stairs and check in; one needs help. */
    private function drill(): int
    {
        $rooms = DB::table('evac_nodes')->where('type', 'room')->orderBy('id')->pluck('id');
        $stairs = DB::table('evac_nodes')->where('type', 'stairwell')->orderBy('id')->pluck('id');
        $assembly = DB::table('assembly_points')->orderBy('id')->value('node_id');
        if ($rooms->isEmpty() || ! $assembly) {
            $this->error('No campus map loaded.');

            return self::FAILURE;
        }
        $n = max(1, min(50, (int) $this->option('people')));
        $total = max(20, (int) $this->option('seconds'));

        $alert = Alert::create([
            'hazard_type' => 'earthquake', 'severity_level' => 'high', 'is_drill' => true, 'issued_at' => now(),
            'message' => 'Simulated drill: earthquake. Drop, cover and hold on, then evacuate to the assembly point.',
            'issued_by' => User::where('role', Role::SafetyOfficer)->value('id'),
        ]);
        AlertDispatcher::dispatch($alert);
        $this->info("Drill alert #{$alert->id} sent. Watch: Dashboard, Safety Monitor, Campus 3D, and the app banner.");

        // Timeline (seconds from start) for each person: seen in room, on the stairs, then checked in (or not).
        $plan = collect(range(1, $n))->map(fn (int $i) => [
            'person' => DemoDrillSeeder::samplePerson($i),
            'room' => $rooms[($i * 3) % $rooms->count()],
            'stair' => $stairs->isEmpty() ? null : $stairs[$i % $stairs->count()],
            'seen' => (int) round($total * 0.05 * (1 + $i % 4)),
            'moving' => (int) round($total * (0.25 + 0.03 * ($i % 6))),
            'done' => (int) round($total * (0.45 + 0.5 * $i / $n)),
            'outcome' => match (true) {
                $i === (int) ceil($n * 0.6) => 'needs_help', $i > $n - max(1, intdiv($n, 6)) => 'unknown', default => 'safe'
            },
        ]);

        $start = time();
        $events = $plan->flatMap(fn ($p) => array_filter([
            [$p['seen'], fn () => $this->seen($alert, $p['person'], $p['room'], 'schedule')],
            $p['stair'] ? [$p['moving'], fn () => $this->seen($alert, $p['person'], $p['stair'], 'barometer')] : null,
            $p['outcome'] === 'safe' ? [$p['done'], fn () => $this->checkIn($alert, $p['person'], $assembly, 'safe')] : null,
            $p['outcome'] === 'needs_help' ? [$p['moving'] + 3, fn () => $this->help($alert, $p['person'], $p['room'])] : null,
        ]))->sortBy(fn ($e) => $e[0])->values();

        $bar = $this->output->createProgressBar($events->count());
        foreach ($events as [$at, $run]) {
            while (time() - $start < $at) {
                usleep(250_000);
            }
            $run();
            $bar->advance();
        }
        $bar->finish();
        $this->newLine();

        if (! $this->option('keep')) {
            $alert->update(['status' => 'resolved', 'resolved_at' => now()]);
            AlertDispatcher::update($alert);
            $this->info('Drill resolved. Replay it in Campus 3D, or download its report from Safety Monitor.');
        } else {
            $this->info('Drill left active: resolve it in the dashboard (Alerts) when you are done.');
        }

        return self::SUCCESS;
    }

    /** Three sample people report the same hazard on one floor within minutes: the 3-report rule broadcasts an UNVERIFIED alert. */
    private function reports(): int
    {
        $room = DB::table('evac_nodes')->where('type', 'room')->whereNotNull('room_id')->orderBy('id')->first();
        if (! $room) {
            $this->error('No campus map loaded.');

            return self::FAILURE;
        }
        $hazard = (string) $this->option('hazard');
        if (! in_array($hazard, ['earthquake', 'fire', 'flood', 'structural_damage', 'other'], true)) {
            $this->error('Unknown hazard. Use earthquake, fire, flood, structural_damage or other.');

            return self::FAILURE;
        }
        $threshold = (int) config('evacuai.report_cluster_threshold');
        foreach (range(1, $threshold) as $k) {
            $report = HazardReport::create([
                'reported_by' => DemoDrillSeeder::samplePerson(20 + $k)->id, 'hazard_type' => $hazard, 'building_id' => $room->building_id,
                'level' => $room->level, 'room_id' => $room->room_id, 'description' => "Simulated report {$k} of {$threshold}",
            ]);
            $alert = ReportClusters::evaluate($report);
            $this->line("Report {$k}/{$threshold} sent".($alert ? " → UNVERIFIED alert #{$alert->id} broadcast" : ''));
            sleep(2);
        }
        $this->info('Check the app banner, Dashboard → Hazard Reports, and the bell. Confirm or retract the alert in Alerts.');

        return self::SUCCESS;
    }

    /** One sample student sends an SOS from a room: it appears on the SOS desk and in the officers' bell. */
    private function sos(): int
    {
        $room = DB::table('evac_nodes')->where('type', 'room')->orderBy('id')->first();
        $person = DemoDrillSeeder::samplePerson(30);
        $sos = SosAlert::where('user_id', $person->id)->whereIn('status', SosAlert::OPEN)->first()
            ?? SosAlert::create(['user_id' => $person->id, 'alert_id' => Alert::current()?->id, 'node_id' => $room?->id,
                'building_id' => $room?->building_id, 'level' => $room?->level, 'message' => 'Simulated SOS: I am stuck behind a jammed door.']);
        User::whereIn('role', [Role::Admin, Role::SafetyOfficer])->where('is_active', true)->get()->each->notify(new SosRaised($sos));
        SendOfficerPush::forSos($sos);
        $this->info("SOS #{$sos->id} from {$person->name}. Open Dashboard → SOS, acknowledge it and reply in the chat.");

        return self::SUCCESS;
    }

    /** Blocks the first open stair segment: open evacuation routes re-route within seconds. */
    private function block(): int
    {
        $edge = EvacEdge::where('type', 'stairs')->where('status', 'open')->orderBy('id')->first();
        if (! $edge) {
            $this->error('No open stairs left to block. Run: evacuai:simulate reopen');

            return self::FAILURE;
        }
        $edge->update(['status' => 'blocked']);
        $this->info("Blocked {$edge->id}. Routes that used it change within seconds; Paths and Campus 3D show it in red.");

        return self::SUCCESS;
    }

    private function reopen(): int
    {
        $edges = EvacEdge::where('status', '!=', 'open')->get();
        $edges->each->update(['status' => 'open']);
        $this->info("Reopened {$edges->count()} path(s).");

        return self::SUCCESS;
    }

    /** Built-in sample USGS and Open-Meteo events become draft alerts for officers to publish or discard. */
    private function feed(): int
    {
        config(['evacuai.feeds.fake' => true]);
        config(['evacuai.feeds.campus_lat' => config('evacuai.feeds.campus_lat') ?? 10.33, 'evacuai.feeds.campus_lng' => config('evacuai.feeds.campus_lng') ?? 123.95]);
        $drafts = Feeds::poll();
        $this->info(count($drafts).' new draft alert(s). Open Dashboard → Alerts, filter Draft, then Publish or Discard.'
            .($drafts ? '' : ' (The samples were already used; discard and re-run does not recreate them.)'));

        return self::SUCCESS;
    }

    private function invalid(): int
    {
        $this->error('Unknown scenario. Use: drill, reports, sos, block, reopen or feed.');

        return self::FAILURE;
    }

    private function seen(Alert $alert, User $person, string $nodeId, string $source): void
    {
        $node = DB::table('evac_nodes')->where('id', $nodeId)->first();
        DB::table('location_events')->insert([
            'user_id' => $person->id, 'alert_id' => $alert->id, 'node_id' => $nodeId, 'room_id' => $node?->room_id,
            'building_id' => $node?->building_id, 'level' => $node?->level, 'source' => $source, 'confidence' => 'likely', 'created_at' => now(),
        ]);
    }

    private function checkIn(Alert $alert, User $person, ?string $nodeId, string $status): void
    {
        DB::table('evacuation_logs')->updateOrInsert(
            ['user_id' => $person->id, 'alert_id' => $alert->id],
            ['status' => $status, 'assembly_node_id' => $nodeId, 'checked_in_at' => now()],
        );
    }

    private function help(Alert $alert, User $person, string $roomNode): void
    {
        $this->checkIn($alert, $person, null, 'needs_help');
        $node = DB::table('evac_nodes')->where('id', $roomNode)->first();
        $sos = SosAlert::create(['user_id' => $person->id, 'alert_id' => $alert->id, 'node_id' => $roomNode, 'building_id' => $node?->building_id,
            'level' => $node?->level, 'message' => 'Simulated: I hurt my leg and cannot use the stairs.']);
        User::whereIn('role', [Role::Admin, Role::SafetyOfficer])->where('is_active', true)->get()->each->notify(new SosRaised($sos));
        SendOfficerPush::forSos($sos);
    }
}
