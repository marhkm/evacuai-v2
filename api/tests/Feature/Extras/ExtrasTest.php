<?php

use App\Enums\Role;
use App\Events\AlertBroadcast;
use App\Filament\Resources\Alerts\Pages\CreateAlert;
use App\Filament\Resources\Alerts\Pages\ListAlerts;
use App\Filament\Resources\HazardReports\Pages\ListHazardReports;
use App\Jobs\SendAlertPush;
use App\Models\Alert;
use App\Models\HazardReport;
use App\Models\User;
use App\Notifications\DraftAlertFromFeed;
use App\Support\AlertTranslator;
use App\Support\Feeds;
use Database\Seeders\CampusSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Livewire\Livewire;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['evacuai.campus_dataset' => 'demo']);
    $this->seed(CampusSeeder::class);
    Event::fake([AlertBroadcast::class]);
    Bus::fake([SendAlertPush::class]);
    Notification::fake();
    config(['evacuai.feeds.campus_lat' => 10.33, 'evacuai.feeds.campus_lng' => 123.95, 'services.llm.gemini.key' => null, 'services.llm.groq.key' => null]);
    $this->officer = User::forceCreate(['name' => 'Officer', 'email' => 'so@example.test', 'role' => Role::SafetyOfficer, 'email_verified_at' => now()]);
});

function fakeFeeds(float $mag = 5.2, float $rain = 18.6): void
{
    Http::fake([
        'earthquake.usgs.gov/*' => Http::response(['features' => [
            ['id' => 'us7000abcd', 'properties' => ['mag' => $mag, 'place' => '20 km NE of Danao', 'time' => 1791853200000]],
        ]]),
        'api.open-meteo.com/*' => Http::response(['hourly' => ['time' => ['2026-10-12T14:00', '2026-10-12T15:00'], 'precipitation' => [3.0, $rain]]]),
        'earthquake.phivolcs.dost.gov.ph/*' => Http::response('<html><table></table></html>'),
        'bagong.pagasa.dost.gov.ph/*' => Http::response('<p>No Active Tropical Cyclone within the Philippine Area of Responsibility</p>'),
    ]);
}

it('turns nearby earthquakes and heavy rain into drafts only, once each, and tells officers', function () {
    fakeFeeds();
    expect(Feeds::poll())->toHaveCount(2);
    expect(Feeds::poll())->toHaveCount(0); // same events: no duplicates

    $quake = Alert::where('external_id', 'usgs:us7000abcd')->sole();
    expect($quake->status)->toBe('draft')->and($quake->source)->toBe('feed')->and($quake->severity_level)->toBe('high')
        ->and($quake->message)->toContain('Magnitude 5.2 earthquake 20 km NE of Danao');
    $rain = Alert::where('hazard_type', 'flood')->sole();
    expect($rain->status)->toBe('draft')->and($rain->message)->toContain('up to 18.6 mm per hour around 3 PM');

    Event::assertNotDispatched(AlertBroadcast::class);
    Bus::assertNotDispatched(SendAlertPush::class);
    Notification::assertSentToTimes($this->officer, DraftAlertFromFeed::class, 1);
    Http::assertSent(fn (Request $r) => str_contains($r->url(), 'maxradiuskm=100') && str_contains($r->url(), 'minmagnitude=4.5'));

    $this->actingAs($this->officer)->getJson('/api/alerts')->assertJsonCount(0, 'alerts'); // drafts never reach users
});

it('ignores light rain and needs campus coordinates', function () {
    fakeFeeds(rain: 6.0);
    Feeds::poll();
    expect(Alert::where('hazard_type', 'flood')->exists())->toBeFalse();

    config(['evacuai.feeds.campus_lat' => null]);
    expect(fn () => Feeds::poll())->toThrow(RuntimeException::class, 'CAMPUS_LAT');
});

it('reads classroom samples in fake mode without the internet', function () {
    Http::preventStrayRequests();
    config(['evacuai.feeds.fake' => true]);
    $this->artisan('evacuai:poll-feeds')->expectsOutput('4 new draft alert(s).')->assertSuccessful();
});

function phivolcsPage(array $rows): string
{
    return '<table><tr><td>Date - Time</td><td>Lat</td><td>Long</td><td>Depth</td><td>Mag</td><td>Location</td></tr>'
        .implode('', array_map(fn (array $r) => '<tr><td><a href="x"><span>'.$r[0].'</span></a></td><td>'.implode('</td><td>', array_slice($r, 1)).'</td></tr>', $rows)).'</table>';
}

it('drafts nearby PHIVOLCS quakes, once per quake even when USGS lists it too', function () {
    $this->travelTo(Carbon\Carbon::parse('2026-10-12 10:00', 'Asia/Manila'));
    Http::fake([
        'earthquake.usgs.gov/*' => Http::response(['features' => [ // the 09:12 Cordova quake, seen by USGS a minute apart
            ['id' => 'us7000cord', 'properties' => ['mag' => 4.9, 'place' => '8 km SW of Cordova', 'time' => Carbon\Carbon::parse('2026-10-12 09:13', 'Asia/Manila')->getTimestampMs()]],
        ]]),
        'api.open-meteo.com/*' => Http::response(['hourly' => ['time' => [], 'precipitation' => []]]),
        'earthquake.phivolcs.dost.gov.ph/*' => Http::response(phivolcsPage([
            ['12 October 2026 - 09:12 AM', '10.27', '123.98', '011', '4.8', '009 km S 45° W of Cordova (Cebu)'],
            ['12 October 2026 - 09:30 AM', '13.17', '124.58', '024', '5.6', '044 km N 72° E of Prieto Diaz (Sorsogon)'], // too far
            ['12 October 2026 - 09:40 AM', '10.30', '123.90', '005', '2.1', '003 km W of Mandaue City (Cebu)'], // too small
            ['11 October 2026 - 11:00 PM', '10.30', '123.90', '005', '5.0', '003 km W of Mandaue City (Cebu)'], // older than 6 hours
        ])),
        'bagong.pagasa.dost.gov.ph/*' => Http::response('No Active Tropical Cyclone'),
    ]);

    expect(Feeds::poll())->toHaveCount(1);
    expect(Alert::sole()->message)->toContain('Magnitude 4.8 earthquake 9 km S 45° W of Cordova (Cebu) at 9:12 AM (PHIVOLCS)')
        ->and(Alert::sole()->severity_level)->toBe('medium');
    expect(Feeds::poll())->toHaveCount(0);
});

it('does not repeat a quake drafted from USGS when PHIVOLCS posts it later, and survives a broken page', function () {
    $usgsTime = Carbon\Carbon::createFromTimestampMs(1791853200000)->timezone('Asia/Manila');
    $this->travelTo($usgsTime->copy()->addMinutes(20));
    Http::fake([
        'earthquake.usgs.gov/*' => Http::response(['features' => [
            ['id' => 'us7000abcd', 'properties' => ['mag' => 4.9, 'place' => '20 km NE of Danao', 'time' => 1791853200000]],
        ]]),
        'api.open-meteo.com/*' => Http::response(['hourly' => ['time' => [], 'precipitation' => []]]),
        'earthquake.phivolcs.dost.gov.ph/*' => Http::sequence()
            ->push('', 503) // PHIVOLCS down: USGS still works
            ->pushResponse(Http::response(phivolcsPage([
                [$usgsTime->copy()->addMinutes(2)->format('j F Y - h:i A'), '10.40', '124.05', '010', '5.0', '020 km NE of Danao (Cebu)'],
            ]))),
        'bagong.pagasa.dost.gov.ph/*' => Http::response('No Active Tropical Cyclone'),
    ]);

    expect(Feeds::poll())->toHaveCount(1);
    $this->travelTo($usgsTime->copy()->addHour());
    expect(Feeds::poll())->toHaveCount(0)->and(Alert::sole()->external_id)->toBe('usgs:us7000abcd');
});

it('drafts a PAGASA wind signal for the campus province, again only when it rises', function () {
    $page = fn (string $signals) => Http::response('<h3>Tropical Cyclone Bulletin No. 7</h3><p>Typhoon "Ompong"</p><table>'.$signals.'</table><script>var a = "Signal No. 5 Cebu";</script>');
    Http::fake([
        'earthquake.usgs.gov/*' => Http::response(['features' => []]),
        'api.open-meteo.com/*' => Http::response(['hourly' => ['time' => [], 'precipitation' => []]]),
        'earthquake.phivolcs.dost.gov.ph/*' => Http::response('<table></table>'),
        'bagong.pagasa.dost.gov.ph/*' => Http::sequence()
            ->pushResponse($page('<tr><td>Wind Signal No. 1</td><td>Visayas: Bohol, Cebu</td></tr>'))
            ->pushResponse($page('<tr><td>Wind Signal No. 1</td><td>Visayas: Bohol, Cebu</td></tr>'))
            ->pushResponse($page('<tr><td>Wind Signal No. 2</td><td>Visayas: Cebu including Camotes Islands</td></tr><tr><td>Wind Signal No. 1</td><td>Bohol</td></tr>'))
            ->pushResponse($page('<tr><td>Wind Signal No. 3</td><td>Visayas: Negros Oriental, Siquijor</td></tr>')),
    ]);

    expect(Feeds::poll())->toHaveCount(1);
    expect(Alert::sole()->message)->toBe('PAGASA Wind Signal No. 1 is raised over Cebu (Typhoon Ompong). Stay indoors away from windows, keep off flood-prone ground floors, and follow safety officers and official class-suspension announcements.')
        ->and(Alert::sole()->severity_level)->toBe('medium');
    expect(Feeds::poll())->toHaveCount(0); // same signal
    expect(Feeds::poll()[0]->severity_level)->toBe('high'); // raised to 2
    expect(Feeds::poll())->toHaveCount(0); // signal elsewhere only (the script text is ignored)
});

it('summarizes matching reports for officers without sending who reported them', function () {
    config(['services.llm.groq.key' => 'q']);
    Http::fake(['api.groq.com/*' => Http::response(['choices' => [['message' => ['content' => 'Two people report smoke at R101.']]]])]);
    foreach (['ana', 'ben'] as $i => $name) {
        $u = User::forceCreate(['name' => ucfirst($name).' Cruz', 'email' => "{$name}@uclm.edu.ph", 'email_verified_at' => now()]);
        HazardReport::create(['reported_by' => $u->id, 'building_id' => 'DEMO', 'level' => 1, 'room_id' => 'DEMO/1/R101', 'hazard_type' => 'fire',
            'description' => $i ? 'Smoke from the door, call me 09171234567' : 'Usok sa pultahan']);
    }
    $this->actingAs($this->officer);

    Livewire::test(ListHazardReports::class)->callTableAction('summarize', HazardReport::first())
        ->assertNotified('Matching reports (AI summary, check before acting)');

    Http::assertSent(function (Request $r) {
        $prompt = $r['messages'][1]['content'];

        return str_contains($prompt, 'Reports from 2 different people') && str_contains($prompt, 'R101: Usok sa pultahan')
            && str_contains($prompt, '[number]') && ! str_contains($r->body(), 'Cruz') && ! str_contains($r->body(), 'uclm.edu.ph');
    });

    config(['services.llm.groq.key' => null]);
    Livewire::test(ListHazardReports::class)->assertTableActionHidden('summarize', HazardReport::first());
});

it('lets an officer edit and publish a draft, or discard it', function () {
    fakeFeeds();
    Feeds::poll();
    [$quake, $rain] = [Alert::where('hazard_type', 'earthquake')->sole(), Alert::where('hazard_type', 'flood')->sole()];
    $this->actingAs($this->officer);

    Livewire::test(ListAlerts::class)
        ->callTableAction('publish', $quake, ['message' => 'M5.2 earthquake felt on campus. Evacuate to the field.'])
        ->callTableAction('discard', $rain);

    $quake->refresh();
    expect($quake->status)->toBe('active')->and($quake->verified)->toBeTrue()->and($quake->issued_by)->toBe($this->officer->id)
        ->and($quake->message)->toBe('M5.2 earthquake felt on campus. Evacuate to the field.')
        ->and($rain->fresh()->status)->toBe('retracted');
    Event::assertDispatched(AlertBroadcast::class, 1);
    Bus::assertDispatched(SendAlertPush::class, 1);
});

it('translates with the first working provider, falls back, and never sends contact details', function () {
    config(['services.llm.gemini.key' => 'g', 'services.llm.groq.key' => 'q']);
    Http::fake([
        'generativelanguage.googleapis.com/*' => Http::response(['error' => 'quota'], 429),
        'api.groq.com/*' => Http::response(['choices' => [['message' => ['content' => "```json\n{\"ceb\": \"Sunog sa BE 2F.\", \"fil\": \"Sunog sa BE 2F.\"}\n```"]]]]),
    ]);

    $result = AlertTranslator::translate('Fire at BE 2F. Call 0917 123 4567 or juan@uclm.edu.ph.');

    expect($result)->toBe(['ceb' => 'Sunog sa BE 2F.', 'fil' => 'Sunog sa BE 2F.', 'provider' => 'groq']);
    Http::assertSent(fn (Request $r) => str_contains($r->url(), 'groq')
        && str_contains($r['messages'][1]['content'], '[number]') && str_contains($r['messages'][1]['content'], '[email]')
        && ! str_contains($r->body(), '4567') && ! str_contains($r->body(), 'juan@'));
});

it('broadcasts officer-reviewed translations with the alert', function () {
    $this->actingAs($this->officer);
    Livewire::test(CreateAlert::class)
        ->fillForm(['hazard_type' => 'fire', 'severity_level' => 'high', 'message' => 'Fire drill at BE.', 'is_drill' => true,
            'translations' => ['ceb' => 'Fire drill sa BE.', 'fil' => '']])
        ->call('create')->assertHasNoFormErrors();

    expect(Alert::sole()->translations)->toBe(['ceb' => 'Fire drill sa BE.']);
    $this->getJson('/api/alerts')->assertJsonPath('alerts.0.translations.ceb', 'Fire drill sa BE.');
});

it('signs in UCLM Microsoft 365 accounts only', function () {
    config(['services.microsoft.tenant_id' => 'TENANT-1']);
    $graph = fn (string $tenant, string $upn) => Http::fake([
        'graph.microsoft.com/v1.0/me*' => Http::response(['id' => 'ms-obj-1', 'displayName' => 'Maria Santos', 'userPrincipalName' => $upn]),
        'graph.microsoft.com/v1.0/organization*' => Http::response(['value' => [['id' => $tenant]]]),
    ]);
    $login = fn () => $this->postJson('/api/auth/microsoft', ['access_token' => 't', 'device_name' => 'web']);

    $graph('tenant-1', 'Maria.Santos@uclm.edu.ph');
    $login()->assertOk()->assertJsonPath('user.email', 'maria.santos@uclm.edu.ph');
    expect(DB::table('social_accounts')->where(['provider' => 'microsoft', 'provider_id' => 'ms-obj-1'])->exists())->toBeTrue();

    Http::swap(new Factory); // reset fakes
    $graph('OTHER-TENANT', 'x@uclm.edu.ph');
    $login()->assertForbidden()->assertJsonPath('reason', 'wrong_tenant');

    Http::swap(new Factory);
    $graph('TENANT-1', 'guest_gmail.com#EXT#@uclm.onmicrosoft.com');
    $login()->assertForbidden();

    config(['services.microsoft.tenant_id' => null]);
    $login()->assertNotFound()->assertJsonPath('reason', 'microsoft_disabled');
});
