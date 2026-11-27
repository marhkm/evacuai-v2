# Earthquake alert latency

How long after an earthquake does a phone get the EvacuAI push? EvacuAI checks PHIVOLCS and USGS every minute. A quake
within `FEEDS_QUAKE_RADIUS_KM` (100 km) at or above `FEEDS_QUAKE_MIN_MAGNITUDE` (4.5) that happened in the last hour is
broadcast to everyone at once, through the same push and live banner as an officer broadcast.

`php artisan evacuai:quake-latency` lists the recent earthquake alerts from the feeds:

| Column | Meaning |
|---|---|
| Quake (origin) | When the earthquake happened (origin time from USGS or PHIVOLCS) |
| Alert created | When EvacuAI created and broadcast the alert |
| Push to Expo | When Expo accepted the first push for that alert (`alert_notifications.sent_at`) |
| Quake → alert (s) | Agency publishing delay plus our one-minute polling |
| Alert → push (s) | Queue and Expo request time |
| Quake → push (s) | The total |

Times are in campus time (`CAMPUS_TIMEZONE`, Asia/Manila). "Push to Expo" stays `-` when no phone was signed in.
When the phone actually showed the notification is not recorded; note it by hand in the table below.

## Running the experiment

M4.5 quakes within 100 km of campus are rare, so lower the magnitude for a test run to catch small local quakes.

1. On the test server, in `.env`, set (temporarily):
   ```
   FEEDS_ENABLED=true
   FEEDS_QUAKE_MIN_MAGNITUDE=2.5
   ```
   `CAMPUS_LAT` and `CAMPUS_LNG` must be set too (the feeds stop with an error without them).
2. Restart: `docker compose up -d` (the `scheduler` container runs the poll every minute).
3. Keep at least one phone signed in with notifications allowed. Every M2.5+ quake within 100 km now pushes to
   **every** user, so tell testers first.
4. Wait for quakes (PHIVOLCS lists several small Cebu/Bohol quakes most days). Note the time each phone shows the push.
5. Run `docker compose exec api php artisan evacuai:quake-latency` (add `--limit=50` for more rows) and copy the rows below.
6. Set `FEEDS_QUAKE_MIN_MAGNITUDE` back to 4.5 (or remove the line) and restart.

## Results

| Date | Feed id | Magnitude | Quake (origin) | Alert created | Push to Expo | Phone showed it | Quake → alert (s) | Alert → push (s) | Quake → push (s) |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |
