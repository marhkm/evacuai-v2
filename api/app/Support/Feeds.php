<?php

namespace App\Support;

use App\Enums\Role;
use App\Models\Alert;
use App\Models\User;
use App\Notifications\DraftAlertFromFeed;
use DOMDocument;
use DOMXPath;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use RuntimeException;
use Throwable;

/**
 * External hazard feeds → DRAFT alerts (never broadcast automatically; an officer publishes or discards them).
 * Earthquakes: PHIVOLCS (official, preferred) and USGS, within the radius above the magnitude; one draft per quake.
 * Rain: Open-Meteo forecast above the threshold. Typhoons: a PAGASA wind signal raised over the campus province.
 * PHIVOLCS and PAGASA have no public API, so their pages are scraped: a failed scrape is logged and skipped.
 */
class Feeds
{
    public const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

    public const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

    public const PHIVOLCS_URL = 'https://earthquake.phivolcs.dost.gov.ph/';

    public const PAGASA_URL = 'https://bagong.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin';

    /** @return list<Alert> drafts created by this poll */
    public static function poll(): array
    {
        $cfg = config('evacuai.feeds');
        if ($cfg['campus_lat'] === null || $cfg['campus_lng'] === null) {
            throw new RuntimeException('Set CAMPUS_LAT and CAMPUS_LNG to use the external feeds.');
        }
        $drafts = array_values(array_filter([...self::earthquakes($cfg), self::rain($cfg), self::typhoon($cfg)]));
        if ($drafts) {
            Notification::send(
                User::whereIn('role', [Role::Admin, Role::SafetyOfficer])->where('is_active', true)->get(),
                new DraftAlertFromFeed(count($drafts)),
            );
        }

        return $drafts;
    }

    /**
     * A quake listed by both agencies gets one draft: the USGS one if it was drafted first, otherwise PHIVOLCS.
     *
     * @param  array<string, mixed>  $cfg
     * @return list<Alert|null>
     */
    private static function earthquakes(array $cfg): array
    {
        $usgs = self::usgs($cfg);
        $phivolcs = [];
        foreach (self::phivolcs($cfg) as $p) {
            $twins = array_filter($usgs, fn (array $u) => abs($p['time']->diffInMinutes($u['time'])) <= 3);
            if ($twins && Alert::whereIn('external_id', array_column($twins, 'id'))->exists()) {
                continue; // already drafted from USGS
            }
            $usgs = array_diff_key($usgs, $twins);
            $phivolcs[] = $p;
        }

        return array_map(fn (array $q) => self::draft($q['id'], [
            'hazard_type' => 'earthquake',
            'severity_level' => $q['mag'] >= 6 ? 'critical' : ($q['mag'] >= 5 ? 'high' : 'medium'),
            'message' => sprintf('Magnitude %.1f earthquake %s at %s (%s). Drop, cover and hold on; after the shaking, check for damage and follow safety officers.',
                $q['mag'], $q['place'], $q['time']->timezone(config('evacuai.timezone'))->format('g:i A'), $q['source']),
        ]), [...$phivolcs, ...array_values($usgs)]);
    }

    /**
     * @param  array<string, mixed>  $cfg
     * @return array<int, array{id: string, mag: float, place: string, time: Carbon, source: string}>
     */
    private static function usgs(array $cfg): array
    {
        $data = $cfg['fake'] ? self::fixture('usgs.geojson') : Http::timeout(15)->get(self::USGS_URL, [
            'format' => 'geojson',
            'latitude' => $cfg['campus_lat'],
            'longitude' => $cfg['campus_lng'],
            'maxradiuskm' => $cfg['quake_radius_km'],
            'minmagnitude' => $cfg['quake_min_magnitude'],
            'starttime' => now()->subHours(6)->toIso8601ZuluString(),
        ])->throw()->json();

        return array_map(fn (array $f) => [
            'id' => "usgs:{$f['id']}",
            'mag' => (float) $f['properties']['mag'],
            'place' => $f['properties']['place'] ?? 'near campus',
            'time' => Carbon::createFromTimestampMs($f['properties']['time']),
            'source' => 'USGS',
        ], $data['features'] ?? []);
    }

    /**
     * Latest-events table on the PHIVOLCS home page: date-time (PH time), latitude, longitude, depth, magnitude, location.
     *
     * @param  array<string, mixed>  $cfg
     * @return list<array{id: string, mag: float, place: string, time: Carbon, source: string}>
     */
    private static function phivolcs(array $cfg): array
    {
        if (! $cfg['phivolcs']) {
            return [];
        }
        try {
            // The PHIVOLCS server omits its intermediate certificate, so verify against GlobalSign's published chain.
            // ponytail: pinned to the CA PHIVOLCS uses now (cert renews Nov 2026); if they switch CA, this logs and USGS still covers quakes.
            $html = $cfg['fake'] ? self::fixtureText('phivolcs.html') : Http::withOptions(['verify' => resource_path('feeds/phivolcs-ca.pem')])
                ->timeout(20)->get(self::PHIVOLCS_URL)->throw()->body();
            $doc = new DOMDocument;
            @$doc->loadHTML('<?xml encoding="UTF-8">'.$html); // read as UTF-8 (° signs); hand-made HTML, so ignore markup errors
            $quakes = [];
            foreach ((new DOMXPath($doc))->query('//tr') ?: [] as $row) {
                $cells = [];
                foreach ($row->childNodes as $td) {
                    if ($td->nodeName === 'td') {
                        $cells[] = trim((string) preg_replace('/\s+/u', ' ', $td->textContent));
                    }
                }
                if (count($cells) < 6 || ! preg_match('/^\d{1,2} \w+ \d{4} - \d{1,2}:\d{2} [AP]M$/', $cells[0])) {
                    continue;
                }
                $time = Carbon::createFromFormat('j F Y - h:i A', $cells[0], 'Asia/Manila');
                [$lat, $lng, $mag] = [(float) $cells[1], (float) $cells[2], (float) $cells[4]];
                if (! $time || $mag < $cfg['quake_min_magnitude']
                    || self::km($lat, $lng, (float) $cfg['campus_lat'], (float) $cfg['campus_lng']) > $cfg['quake_radius_km']
                    || (! $cfg['fake'] && $time->lt(now()->subHours(6)))) { // same 6-hour window as the USGS query
                    continue;
                }
                $quakes[] = [
                    'id' => 'phivolcs:'.$time->format('Y-m-d\TH:i').":{$lat},{$lng}",
                    'mag' => $mag,
                    'place' => (string) preg_replace('/^0+(?=\d)/', '', $cells[5]), // "044 km N 72° E of …" → "44 km …"
                    'time' => $time,
                    'source' => 'PHIVOLCS',
                ];
            }

            return $quakes;
        } catch (Throwable $e) {
            Log::warning("PHIVOLCS feed skipped: {$e->getMessage()}");

            return [];
        }
    }

    /** @param array<string, mixed> $cfg */
    private static function rain(array $cfg): ?Alert
    {
        $data = $cfg['fake'] ? self::fixture('open-meteo.json') : Http::timeout(15)->get(self::OPEN_METEO_URL, [
            'latitude' => $cfg['campus_lat'],
            'longitude' => $cfg['campus_lng'],
            'hourly' => 'precipitation',
            'forecast_hours' => 3,
            'timezone' => config('evacuai.timezone'),
        ])->throw()->json();

        $hours = collect($data['hourly']['time'] ?? [])->combine($data['hourly']['precipitation'] ?? []);
        $peak = $hours->max();
        if ($peak === null || $peak < $cfg['rain_mm_per_hour']) {
            return null;
        }
        $when = Carbon::parse((string) $hours->search($peak));

        return self::draft('open-meteo:'.$when->toDateString(), [ // at most one rain draft per day
            'hazard_type' => 'flood',
            'severity_level' => $peak >= 30 ? 'critical' : 'high',
            'message' => sprintf('Heavy rain forecast: up to %s mm per hour around %s (Open-Meteo). Flooding is possible; stay off flood-prone ground floors and follow safety officers.',
                rtrim(rtrim(number_format($peak, 1), '0'), '.'), $when->format('g A')),
        ]);
    }

    /**
     * Highest PAGASA Tropical Cyclone Wind Signal that lists the campus province, from the bulletin page text.
     * ponytail: plain-text search between "Signal No. N" headings, since the page has no stable markup; a province named
     * later in an unrelated paragraph can be read as under the last signal. The draft is checked by an officer.
     *
     * @param  array<string, mixed>  $cfg
     */
    private static function typhoon(array $cfg): ?Alert
    {
        $province = trim((string) $cfg['pagasa_province']);
        if ($province === '') {
            return null;
        }
        try {
            $html = $cfg['fake'] ? self::fixtureText('pagasa.html') : Http::timeout(20)->get(self::PAGASA_URL)->throw()->body();
        } catch (Throwable $e) {
            Log::warning("PAGASA feed skipped: {$e->getMessage()}");

            return null;
        }
        $html = (string) preg_replace('#<(script|style)\b.*?</\1>#is', ' ', $html);
        $text = trim((string) preg_replace('/\s+/u', ' ', html_entity_decode((string) preg_replace('/<[^>]*>/', ' ', $html)))); // tags → spaces keep words apart
        if (stripos($text, 'No Active Tropical Cyclone') !== false) {
            return null;
        }

        $parts = preg_split('/(?:Wind Signal|TCWS|Signal)\s*(?:No\.?|#)\s*([1-5])/i', $text, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [];
        $signal = 0;
        for ($i = 1; $i + 1 < count($parts); $i += 2) {
            if (preg_match('/\b'.preg_quote($province, '/').'\b/i', $parts[$i + 1])) {
                $signal = max($signal, (int) $parts[$i]);
            }
        }
        if ($signal === 0) {
            return null;
        }
        $name = preg_match('/\b((?:Super )?Typhoon|(?:Severe )?Tropical Storm|Tropical Depression) "?([A-Z][a-z]+)"?/', $text, $m) ? " ({$m[1]} {$m[2]})" : '';
        $today = now()->timezone(config('evacuai.timezone'))->toDateString();

        return self::draft("pagasa:tcws:{$today}:{$province}:{$signal}", [ // a higher signal the same day is a new draft
            'hazard_type' => 'flood',
            'severity_level' => $signal >= 3 ? 'critical' : ($signal === 2 ? 'high' : 'medium'),
            'message' => "PAGASA Wind Signal No. {$signal} is raised over {$province}{$name}. Stay indoors away from windows, keep off flood-prone ground floors, and follow safety officers and official class-suspension announcements.",
        ]);
    }

    /** Great-circle distance in km. */
    private static function km(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $a = sin(deg2rad($lat2 - $lat1) / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin(deg2rad($lng2 - $lng1) / 2) ** 2;

        return 6371 * 2 * asin(min(1, sqrt($a)));
    }

    /** @param array<string, string> $attrs */
    private static function draft(string $externalId, array $attrs): ?Alert
    {
        $alert = Alert::firstOrCreate(['external_id' => $externalId], $attrs + ['status' => 'draft', 'source' => 'feed', 'verified' => false]);

        return $alert->wasRecentlyCreated ? $alert : null;
    }

    /** @return array<string, mixed> */
    private static function fixture(string $name): array
    {
        return json_decode(self::fixtureText($name), true);
    }

    private static function fixtureText(string $name): string
    {
        return (string) file_get_contents(resource_path("feeds/{$name}"));
    }
}
