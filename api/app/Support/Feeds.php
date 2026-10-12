<?php

namespace App\Support;

use App\Enums\Role;
use App\Models\Alert;
use App\Models\User;
use App\Notifications\DraftAlertFromFeed;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use RuntimeException;

/**
 * External hazard feeds → DRAFT alerts (never broadcast automatically; an officer publishes or discards them).
 * USGS: earthquakes within the radius above the magnitude. Open-Meteo: forecast rainfall above the threshold.
 * ponytail: PHIVOLCS/PAGASA have no stable public API (scraping breaks); officers post those as "official advisory".
 */
class Feeds
{
    public const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

    public const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

    /** @return list<Alert> drafts created by this poll */
    public static function poll(): array
    {
        $cfg = config('evacuai.feeds');
        if ($cfg['campus_lat'] === null || $cfg['campus_lng'] === null) {
            throw new RuntimeException('Set CAMPUS_LAT and CAMPUS_LNG to use the external feeds.');
        }
        $drafts = array_values(array_filter([...self::earthquakes($cfg), self::rain($cfg)]));
        if ($drafts) {
            Notification::send(
                User::whereIn('role', [Role::Admin, Role::SafetyOfficer])->where('is_active', true)->get(),
                new DraftAlertFromFeed(count($drafts)),
            );
        }

        return $drafts;
    }

    /**
     * @param  array<string, mixed>  $cfg
     * @return list<Alert|null>
     */
    private static function earthquakes(array $cfg): array
    {
        $data = $cfg['fake'] ? self::fixture('usgs.geojson') : Http::timeout(15)->get(self::USGS_URL, [
            'format' => 'geojson',
            'latitude' => $cfg['campus_lat'],
            'longitude' => $cfg['campus_lng'],
            'maxradiuskm' => $cfg['quake_radius_km'],
            'minmagnitude' => $cfg['quake_min_magnitude'],
            'starttime' => now()->subHours(6)->toIso8601ZuluString(),
        ])->throw()->json();

        return array_map(function (array $f) {
            $mag = (float) $f['properties']['mag'];
            $at = Carbon::createFromTimestampMs($f['properties']['time'])->timezone(config('evacuai.timezone'))->format('g:i A');

            return self::draft("usgs:{$f['id']}", [
                'hazard_type' => 'earthquake',
                'severity_level' => $mag >= 6 ? 'critical' : ($mag >= 5 ? 'high' : 'medium'),
                'message' => sprintf('Magnitude %.1f earthquake %s at %s (USGS). Drop, cover and hold on; after the shaking, check for damage and follow safety officers.',
                    $mag, $f['properties']['place'] ?? 'near campus', $at),
            ]);
        }, $data['features'] ?? []);
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

    /** @param array<string, string> $attrs */
    private static function draft(string $externalId, array $attrs): ?Alert
    {
        $alert = Alert::firstOrCreate(['external_id' => $externalId], $attrs + ['status' => 'draft', 'source' => 'feed', 'verified' => false]);

        return $alert->wasRecentlyCreated ? $alert : null;
    }

    /** @return array<string, mixed> */
    private static function fixture(string $name): array
    {
        return json_decode((string) file_get_contents(resource_path("feeds/{$name}")), true);
    }
}
