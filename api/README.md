# EvacuAI API

The Laravel 13 backend for EvacuAI. It provides:

- the REST API for the mobile app (`/api/*`);
- the officer API used by the Command Center and the app's Responder mode (`/api/officer/*`);
- the admin panel (Filament, `/admin`);
- realtime events (Reverb), queued push and SMS, and scheduled hazard feeds.

Students run everything with Docker; see the repository README. Developers run the tests locally:

```bash
php artisan test
```

```bash
vendor/bin/phpstan analyse --memory-limit=1G
```

```bash
vendor/bin/pint --test
```

The tests use PostgreSQL (`evacuai_test` on `127.0.0.1:5432`). Start it with `docker compose -f docker/compose.yml up -d postgres`.

## Officer API

**Access:** Sanctum token or session. Only active safety officers and admins can use these routes; everyone else gets 404.

**Errors:**
- validation: 422 with field errors;
- an action that doesn't fit the current status: 422 `{message}`.

**Rate limits:** mutating routes allow 60 requests per minute; SOS chat allows 30 per minute.

**Pagination:** the report and SOS lists return 50 items per page (`?page=`), with a `meta` block giving `current_page`, `last_page`, `per_page` and `total`.

| Method and path | Purpose |
|---|---|
| `GET /api/officer/overview` | Dashboard numbers and the active alert |
| `GET /api/officer/alerts?status=` | Alerts, including drafts from hazard feeds |
| `POST /api/officer/alerts` | Broadcast. Fewer than 3 matching reports (not a drill) returns `needs_confirmation` until `confirm: true` is sent |
| `POST /api/officer/alerts/{id}/publish` | Publish a feed draft `{message}` |
| `POST /api/officer/alerts/{id}/discard\|confirm\|resolve\|retract` | Change an alert's status |
| `POST /api/officer/alerts/translate` | AI translation `{message}` → `{ceb, fil, provider}` (404 without an LLM, 503 if every provider fails) |
| `GET /api/officer/alerts/{id}/report.csv` | Drill report (CSV) |
| `GET /api/officer/reports?status=` | Hazard reports, with same-floor reporter counts |
| `POST /api/officer/reports/{id}/verify\|dismiss\|resolve` | Review a report |
| `POST /api/officer/reports/{id}/summary` | AI summary of the matching reports |
| `GET /api/officer/reports/{id}/photo` | Report photo (private) |
| `GET /api/officer/paths?building=&level=` | Path segments and their status |
| `PATCH /api/officer/paths/{id}` | `{status: open\|congested\|blocked}` (URL-encode the id) |
| `GET /api/officer/sos?open=1` | SOS requests |
| `GET /api/officer/sos/{id}` | One SOS with its chat |
| `POST /api/officer/sos/{id}/acknowledge\|resolve` | Respond to an SOS |
| `POST /api/officer/sos/{id}/messages` | Chat `{body}` |
| `GET /api/officer/safety?alert=` | Safe / needs help / unknown per alert, people, and assembly-point counts |
| `GET /api/officer/feedback` | Feedback and average rating |
| `GET /api/officer/live?alert=` / `GET /api/officer/replay?alert=` | 3D live overlay and drill replay |

**Realtime:**
- **Private channel `officers`** (active officers and admins only) carries `.sos.updated`, `.report.submitted` and `.checkin.updated`.
- **Public channel `alerts`** carries `.alert.updated`.
- **Public channel `campus`** carries path changes.

**Push:** officers' phones get a push for every new SOS and for every unverified alert raised by reports.
