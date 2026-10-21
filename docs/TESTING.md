# Testing EvacuAI locally (students)

You only need **Docker Desktop** (Windows: with WSL2) and about 8 GB of RAM.

## Start

1. Get the repository (zip download or `git clone`).
2. Copy `docker/.env.example` to `docker/.env`.
3. From the repository root, run:

   ```bash
   docker compose -f docker/compose.yml up -d --build
   ```

   The first start takes a few minutes. It creates the database, imports the campus map and creates the demo accounts.

## Open

| What | Address |
|---|---|
| Mobile app (web build) | http://localhost:8081 |
| Command Center (safety officers) | http://localhost:8000/command |
| Admin dashboard | http://localhost:8000/admin |
| Emails (verification, password reset) | http://localhost:8025 |

## Demo accounts

All demo accounts use the password `evacuai-demo`. They exist only when `SEED_DEMO=true` and never in production.

| Role | Email |
|---|---|
| Admin | admin@evacuai.test |
| Safety officer | safety_officer@evacuai.test |
| Student | student@evacuai.test |
| Faculty | faculty@evacuai.test |
| Staff | staff@evacuai.test |

Only the admin and safety officer accounts can open the admin dashboard.

## Create your own account

1. Open http://localhost:8081 and choose **Create an account**.
2. Open http://localhost:8025 (Mailpit), find the email with the 6-digit code, and enter it in the app.
3. Agree to the privacy notice. New accounts are always students; an admin can promote them in the dashboard (**Users**).

Forgot password works the same way: request a code, read it in Mailpit, set a new password.

## Test scenarios

Use two browser windows: the app as **student** (or your own account) and the dashboard as **safety officer**.
Mark drills as drills ("This is a drill") so everyone knows it is practice.

1. **Alert.** Dashboard → **Alerts** → **Broadcast alert**. The app shows the banner within a few seconds. Optionally
   fill in the Cebuano and Filipino boxes; the app shows them under the English message.
2. **Hazard reports.** Three different verified accounts report the same hazard on the same floor within 10 minutes.
   The dashboard bell shows an **Unverified** alert; confirm or retract it in **Alerts**.
3. **Evacuation route.** App → **Evacuation route** → **Pick my room** (scanning a sticker is optional).
   The route, steps and distance appear. Dashboard → **Paths**: set a stair on the route to **Blocked**. The app
   re-routes by itself within a few seconds. Set it back to **Open** afterwards.
4. **SOS.** App → **SOS** → pick your room → **Send SOS**. Dashboard → **SOS** → open it and reply. The app shows the
   officer's reply live. Resolve it from the dashboard.
5. **Check-in Safe.** With an active alert, app → **Check in safe** (scan the assembly-point sticker on a phone, or tap
   **I'm safe**). Dashboard → **Safety Monitor** shows who is Safe, Needs help or Unknown.
6. **Drill report.** **Safety Monitor** → **Drill report (CSV)** opens in Excel or Google Sheets. The **Dashboard**
   shows the check-in rate and evacuation times of the latest alert.
7. **3D.** App → **Campus map** → **All floors** or **3D**. Dashboard → **Campus 3D**: blocked paths, hazards, people
   still inside and SOS pins update every 2 seconds; choose an alert under **Replay** and press **Play**.
8. **Feedback.** App → **Send feedback**. Dashboard → **Reports** → **Feedback** (admins also see the **Activity log**).
9. **Responder mode.** Sign in to the app as `safety_officer@evacuai.test`: it opens on **Responder**. From another
   window, send an SOS as a student: it appears in **SOS inbox** within seconds. Open it, **Acknowledge** and reply;
   the student sees the reply live. Also try **Paths**, **Alerts** and **Who's missing** (during an active drill).

## Testing alone: sample data and simulations

A fresh stack already contains a finished sample drill (Safety Monitor, Campus 3D replay, drill report). To make other
"people" act while you watch, run a simulation, for example:

```bash
docker compose -f docker/compose.yml exec app php artisan evacuai:simulate drill
```

Other scenarios: `reports`, `sos`, `block`, `reopen`, `feed`. See section 5 of the [user manual](USER-MANUAL.md).

## Automated browser tests

With the stack running, from the repository root (needs Node.js; Docker-only testers can skip this):

```bash
npm ci
```

```bash
npx playwright install chromium
```

```bash
npm run e2e
```

The app and admin tests only read data. The Command Center tests create a drill alert and an SOS from the demo student and briefly block one path, then resolve and reopen them, so run them on your own stack, not a shared one.

## Using a real phone

The Android app works with the stack on your PC. You need no Expo, Firebase or Play Store account.

1. **Install the app.** Open the EvacuAI APK download link (or scan its QR code) on the Android phone,
   download it and tap it to install. Android asks once to allow installing apps from your browser or files app:
   allow it. You do not need an Expo, Firebase or Google Play account.
2. **Start the stack on your PC** (`docker compose -f docker/compose.yml up -d`).
3. **Put the phone and the PC on the same Wi-Fi.** School or café networks often block devices from reaching each
   other; a phone hotspot that the PC joins always works.
4. **Find your PC's address.** Windows: run `ipconfig` and copy the **IPv4 Address** of the Wi-Fi adapter (for
   example `192.168.1.5`). macOS: System Settings → Wi-Fi → Details.
5. **Allow the phone through the Windows firewall** (once, in PowerShell **as administrator**):

   ```powershell
   New-NetFirewallRule -DisplayName "EvacuAI test stack" -Direction Inbound -Protocol TCP -LocalPort 8000,8080 -Action Allow -Profile Private
   ```

   Also make sure Windows calls the Wi-Fi a **Private** network (Settings → Network & internet → Wi-Fi → your
   network).
6. **Point the app at your PC.** Open EvacuAI, tap **Server: …** under the sign-in button, enter
   `http://<your-PC-address>:8000` (for example `http://192.168.1.5:8000`), tap **Save server**, then sign in with a
   demo account or your own.

Check it worked: the phone browser should open `http://<your-PC-address>:8000/up`. If it does not, the phone cannot
reach the PC (step 3 or 5).

What the phone adds over the web version: scanning QR stickers, photos from the camera, floor tracking with the
barometer, GPS check-in, and **push notifications** (alerts arrive even when the app is closed; tapping one opens
the evacuation route). Push needs internet on the PC, because alerts go through Expo's push service; allow
notifications when the app asks.

## Google sign-in (optional setup)

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Add `http://localhost:8081` to **Authorized JavaScript origins** and **Authorized redirect URIs**.
3. Put its ID and secret in `docker/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then rebuild:
   `docker compose -f docker/compose.yml up -d --build`.
4. While the consent screen is in "Testing", add each student's Google email as a test user (up to 100).

The **Continue with Google** button only appears when `GOOGLE_CLIENT_ID` is set. Google sign-in on the phone APK comes
with the APK build.

## Optional extras

All are off until configured in `docker/.env`; restart with `docker compose -f docker/compose.yml up -d` (rebuild with
`--build` for the Microsoft button).

| Extra | Settings | Notes |
|---|---|---|
| Hazard feeds (PHIVOLCS and USGS earthquakes, Open-Meteo rain, PAGASA wind signals) | `FEEDS_ENABLED=true`, `CAMPUS_LAT`, `CAMPUS_LNG` | Creates **draft** alerts only; an officer publishes or discards them. `FEEDS_FAKE=true` uses built-in sample events (no internet). |
| AI assist | `GEMINI_API_KEY` and/or `GROQ_API_KEY` | Adds **Translate with AI** to the alert form and **Summarize** to Hazard Reports. Free tiers may use prompts for training: never type names or phone numbers in alerts. Local model: `docker compose -f docker/compose.yml --profile ai-local up -d`, then `OLLAMA_URL=http://ollama:11434`. |
| Microsoft 365 sign-in | `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID` | Entra "Single-page application" registration with redirect `http://localhost:8081`. Only accounts from that tenant can sign in. |

## Reset everything

```bash
docker compose -f docker/compose.yml down -v
```

This deletes the database. The next `up` starts fresh.

## Report a bug

Open a GitHub issue with the steps you took, what you expected, and what happened. Add a screenshot if you can.
