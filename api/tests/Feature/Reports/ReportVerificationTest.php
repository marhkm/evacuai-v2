<?php

use App\Enums\Role;
use App\Events\CampusChanged;
use App\Events\ReportSubmitted;
use App\Jobs\CheckReportPhoto;
use App\Models\Alert;
use App\Models\HazardReport;
use App\Support\ReportActions;
use App\Support\ReportPhoto;
use App\Support\ReportVerification;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Storage::fake('local');
});

function sendReport(int $seed, array $over = [], ?UploadedFile $photo = null): TestResponse
{
    Sanctum::actingAs(officerUser(Role::Student));

    return test()->post('/api/hazard-reports', array_merge(
        ['hazard_type' => 'fire', 'building_id' => 'DEMO', 'level' => 1],
        ['photo' => $photo ?? hazardPhoto($seed), 'taken_at' => now()->toIso8601String()],
        $over,
    ), ['Accept' => 'application/json']);
}

describe('fresh in-app photo', function () {
    it('needs a photo', function () {
        Sanctum::actingAs(officerUser(Role::Student));
        $this->post('/api/hazard-reports', ['hazard_type' => 'fire', 'building_id' => 'DEMO', 'level' => 1, 'taken_at' => now()->toIso8601String()],
            ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('photo');
    });

    it('needs the time the photo was taken (an older app gets a clear message, not an error)', function () {
        sendReport(1, ['taken_at' => null])->assertUnprocessable()->assertJsonValidationErrors('taken_at');
    });

    it('refuses a photo older than 10 minutes', function () {
        sendReport(1, ['taken_at' => now()->subMinutes(11)->toIso8601String()])->assertUnprocessable()
            ->assertJsonPath('errors.taken_at.0', 'Take a new photo of the hazard (photos older than 10 minutes are not accepted).');
    });

    it('stores when the photo was taken', function () {
        $taken = now()->subMinutes(2)->startOfSecond();
        sendReport(1, ['taken_at' => $taken->toIso8601String()])->assertCreated();
        expect(HazardReport::sole()->photo_taken_at->equalTo($taken))->toBeTrue();
    });
});

describe('duplicate photos', function () {
    it('fingerprints identical pictures the same', function () {
        $a = ReportPhoto::dhash(imagecreatefromjpeg(hazardPhoto(7)->getRealPath()));
        expect($a)->toMatch('/^[0-9a-f]{16}$/')
            ->and(ReportPhoto::distance($a, ReportPhoto::dhash(imagecreatefromjpeg(hazardPhoto(7)->getRealPath()))))->toBe(0);
    });

    it('marks the same photo sent again (even recompressed) as a duplicate of the first', function () {
        $first = sendReport(1)->assertCreated()->json('report.id');
        sendReport(2, [], hazardPhoto(1, 55))->assertCreated();

        expect(HazardReport::latest('id')->first()->duplicate_of)->toBe($first);
    });

    it('does not mark a different photo as a duplicate', function () {
        sendReport(1)->assertCreated();
        sendReport(2)->assertCreated();

        expect(HazardReport::latest('id')->first()->duplicate_of)->toBeNull()
            ->and(ReportPhoto::distance(HazardReport::oldest('id')->first()->photo_hash, HazardReport::latest('id')->first()->photo_hash))->toBeGreaterThan(6);
    });
});

describe('where the reporter was', function () {
    beforeEach(function () {
        $this->alert = Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Fire', 'issued_at' => now()]);
    });

    $place = function (?array $lastSeen) {
        $user = officerUser(Role::Student);
        if ($lastSeen) {
            DB::table('location_events')->insert(['user_id' => $user->id, 'alert_id' => $this->alert->id, 'source' => 'qr', 'confidence' => 'exact',
                'building_id' => $lastSeen[0], 'level' => $lastSeen[1], 'created_at' => now()]);
        }
        Sanctum::actingAs($user);
        $this->post('/api/hazard-reports', ['hazard_type' => 'fire', 'building_id' => 'DEMO', 'level' => 1] + photoFields(),
            ['Accept' => 'application/json'])->assertCreated();

        return HazardReport::latest('id')->first();
    };

    it('matches when the reporter was last seen on that floor', function () use ($place) {
        expect($place->call($this, ['DEMO', 1]))->reporter_place->toBe('match');
    });

    it('says where the reporter was when it was another floor', function () use ($place) {
        expect($place->call($this, ['DEMO', 2]))->reporter_place->toBe('elsewhere')->reporter_place_label->toBe('Demo Building · Second');
    });

    it('is unknown without a last location', function () use ($place) {
        expect($place->call($this, null))->reporter_place->toBe('unknown');
    });
});

describe('AI photo check (local Ollama, advice only)', function () {
    beforeEach(function () {
        config(['services.ollama.base' => 'http://ollama:11434', 'services.ollama.vision_model' => 'moondream']);
        Queue::fake(); // the job is run by hand below
        sendReport(1)->assertCreated();
        $this->report = HazardReport::sole();
    });

    $reply = fn (string $text) => Http::fake(['ollama:11434/*' => Http::response(['response' => $text])]);

    it('records "looks like" when the model says yes', function () use ($reply) {
        $reply('Yes, there are flames and smoke in a hallway.');
        (new CheckReportPhoto($this->report))->handle();

        expect($this->report->fresh())->ai_verdict->toBe('match')->ai_note->toContain('flames');
        Http::assertSent(fn ($req) => str_contains($req->url(), '/api/generate') && $req['model'] === 'moondream'
            && str_contains($req['prompt'], 'fire or smoke') && count($req['images']) === 1 && $req['stream'] === false);
    });

    it('records no and unclear answers', function () {
        Http::fakeSequence('ollama:11434/*')->push(['response' => 'No. It is a classroom.'])->push(['response' => 'Maybe, it is too dark.']);
        (new CheckReportPhoto($this->report))->handle();
        expect($this->report->fresh()->ai_verdict)->toBe('no_match');

        (new CheckReportPhoto($this->report))->handle();
        expect($this->report->fresh()->ai_verdict)->toBe('unclear');
    });

    it('says not available when the model is down or not set up, without failing the report', function () {
        Http::fake(['ollama:11434/*' => fn () => throw new ConnectionException('down')]);
        (new CheckReportPhoto($this->report))->handle();
        expect($this->report->fresh()->ai_verdict)->toBe('unavailable');

        config(['services.ollama.base' => null]);
        (new CheckReportPhoto($this->report))->handle();
        expect($this->report->fresh())->ai_verdict->toBe('unavailable')->status->toBe('pending');
    });

    it('is queued when a report arrives', function () {
        Queue::assertPushed(CheckReportPhoto::class);
    });
});

describe('auto-verify, false reports and the live map', function () {
    beforeEach(function () {
        Queue::fake(); // AI verdicts are set by hand
        Event::fake([CampusChanged::class]);
        // Auto-verify only runs during an officer's (verified) alert.
        Alert::withoutEvents(fn () => Alert::create(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Fire', 'status' => 'active', 'issued_at' => now()]));
    });

    // $n students, each their own photo, each last seen on that floor; $ai is the AI verdict of the first two reports.
    $cluster = function (int $n, ?string $ai = 'match') {
        for ($i = 1; $i <= $n; $i++) {
            sendReport(100 + $i)->assertCreated();
        }
        HazardReport::query()->update(['reporter_place' => 'match']);
        HazardReport::whereIn('id', HazardReport::oldest('id')->limit(2)->pluck('id'))->update(['ai_verdict' => $ai]);

        return HazardReport::latest('id')->first();
    };

    it('verifies by itself at 3 different students with different photos and an AI match', function () use ($cluster) {
        $last = $cluster(3);
        expect(ReportVerification::evaluate($last))->toBeTrue()
            ->and(HazardReport::pluck('status')->unique()->values()->all())->toBe(['verified'])
            ->and(HazardReport::where('auto_verified', true)->count())->toBe(3);
        Event::assertDispatched(CampusChanged::class);
    });

    it('waits with only 2 students, without an AI match, or with a re-sent photo', function () use ($cluster) {
        expect(ReportVerification::evaluate($cluster(2)))->toBeFalse();
        HazardReport::query()->delete();

        expect(ReportVerification::evaluate($cluster(3, 'unclear')))->toBeFalse();
        HazardReport::query()->delete();

        $cluster(2);
        sendReport(999, [], hazardPhoto(101, 55))->assertCreated(); // the first student's photo, sent again
        expect(ReportVerification::evaluate(HazardReport::latest('id')->first()))->toBeFalse();
    });

    it('only counts students who were last seen on that floor', function () use ($cluster) {
        $last = $cluster(3);
        HazardReport::query()->update(['reporter_place' => 'unknown']);
        expect(ReportVerification::evaluate($last))->toBeFalse();
    });

    it('needs the AI to agree on two photos, and more yes than no', function () use ($cluster) {
        $last = $cluster(3);
        HazardReport::where('id', HazardReport::oldest('id')->value('id'))->update(['ai_verdict' => 'unclear']);
        expect(ReportVerification::evaluate($last))->toBeFalse();
        HazardReport::query()->delete();

        $last = $cluster(5);
        HazardReport::whereNull('ai_verdict')->update(['ai_verdict' => 'no_match']); // 2 yes, 3 no
        expect(ReportVerification::evaluate($last))->toBeFalse();
    });

    it('only verifies by itself while an officer alert is active', function () use ($cluster) {
        $last = $cluster(3);
        Alert::query()->update(['verified' => false]); // only the students' own unverified alert
        expect(ReportVerification::evaluate($last))->toBeFalse();
        Alert::query()->delete();
        expect(ReportVerification::evaluate($last))->toBeFalse();
    });

    it('tells officers when reports verify themselves', function () use ($cluster) {
        $last = $cluster(3);
        Event::fake([CampusChanged::class, ReportSubmitted::class]);
        ReportVerification::evaluate($last);
        Event::assertDispatched(ReportSubmitted::class, fn ($e) => $e->broadcastWith()['auto_verified'] === true);
    });

    it('rejecting one auto-verified report clears the whole group, and it does not verify itself again', function () use ($cluster) {
        ReportVerification::evaluate($cluster(3));
        $id = HazardReport::orderBy('id')->value('id');
        ReportActions::rejectFalse(HazardReport::find($id), officerUser());

        expect(HazardReport::pluck('status')->unique()->values()->all())->toBe(['dismissed'])
            ->and(HazardReport::where('dismiss_reason', 'false')->pluck('id')->all())->toBe([$id]); // only the one counts as false

        sendReport(150)->assertCreated();
        $new = HazardReport::latest('id')->first();
        $new->update(['reporter_place' => 'match', 'ai_verdict' => 'match']);
        expect(ReportVerification::evaluate($new))->toBeFalse()->and($new->fresh()->status)->toBe('pending');
    });

    it('a plain Dismiss of an auto-verified report clears the group too', function () use ($cluster) {
        ReportVerification::evaluate($cluster(3));
        ReportActions::dismiss(HazardReport::orderBy('id')->first(), officerUser());
        expect(HazardReport::where('status', 'verified')->count())->toBe(0);
    });

    it('counts one student once, however many reports they send', function () {
        Sanctum::actingAs(officerUser(Role::Student));
        foreach ([201, 202, 203] as $seed) {
            $this->post('/api/hazard-reports', ['hazard_type' => 'fire', 'building_id' => 'DEMO', 'level' => 1] + photoFields($seed), ['Accept' => 'application/json'])->assertCreated();
        }
        HazardReport::query()->update(['ai_verdict' => 'match']);
        expect(ReportVerification::evaluate(HazardReport::latest('id')->first()))->toBeFalse();
    });

    it('flags a student after 3 false reports in 30 days, and an admin can clear it', function () {
        $u = officerUser(Role::Student);
        foreach ([1, 2, 3] as $i) {
            ReportActions::rejectFalse(HazardReport::create(['reported_by' => $u->id, 'building_id' => 'DEMO', 'level' => 1, 'hazard_type' => 'fire']), officerUser());
        }
        expect(ReportVerification::flagged($u))->toBeTrue();

        $u->forceFill(['false_reports_cleared_at' => now()->addSecond()])->save();
        expect(ReportVerification::flagged($u->fresh()))->toBeFalse();
    });

    it('does not count a plain Dismiss as false', function () {
        $u = officerUser(Role::Student);
        foreach ([1, 2, 3] as $i) {
            ReportActions::dismiss(HazardReport::create(['reported_by' => $u->id, 'building_id' => 'DEMO', 'level' => 1, 'hazard_type' => 'fire']), officerUser());
        }
        expect(ReportVerification::flagged($u))->toBeFalse()->and(HazardReport::first()->dismiss_reason)->toBe('other');
    });

    it('does not let a flagged student help auto-verify', function () use ($cluster) {
        $last = $cluster(3);
        foreach ([1, 2, 3] as $i) {
            ReportActions::rejectFalse(HazardReport::create(['reported_by' => $last->reported_by, 'building_id' => 'DEMO', 'level' => 2, 'hazard_type' => 'flood']), officerUser());
        }
        expect(ReportVerification::evaluate($last))->toBeFalse();
    });

    it('takes a hazard off the maps when an officer rejects an auto-verified report', function () use ($cluster) {
        ReportVerification::evaluate($cluster(3));
        Event::fake([CampusChanged::class]);

        Sanctum::actingAs(officerUser());
        $id = HazardReport::orderBy('id')->value('id');
        $this->postJson("/api/officer/reports/{$id}/reject-false")->assertOk();
        expect(HazardReport::find($id))->status->toBe('dismissed')->dismiss_reason->toBe('false');
        Event::assertDispatched(CampusChanged::class);
    });

    it('gives officers every signal in the report list', function () use ($cluster) {
        $cluster(3);
        Sanctum::actingAs(officerUser());
        $row = $this->getJson('/api/officer/reports')->assertOk()->json('reports.0');

        expect($row)->toHaveKeys(['ai_verdict', 'ai_note', 'duplicate_of', 'reporter_place', 'reporter_place_label', 'auto_verified', 'reporter_flagged', 'reporter', 'independent']);
    });
});

describe('the photo check never holds up alerts', function () {
    it('runs on its own "ai" queue, apart from alert pushes', function () {
        Queue::fake();
        sendReport(1)->assertCreated();
        Queue::assertPushedOn('ai', CheckReportPhoto::class);
    });

    it('marks the check "not available" when the job itself fails, and stops before the queue retries it', function () {
        Queue::fake();
        sendReport(1)->assertCreated();
        $job = new CheckReportPhoto(HazardReport::sole());
        $job->failed(new RuntimeException('worker killed'));

        expect(HazardReport::sole()->ai_verdict)->toBe('unavailable')
            ->and($job->timeout)->toBeLessThan(config('queue.connections.database.retry_after'))
            ->and($job->deleteWhenMissingModels)->toBeTrue();
    });
});
