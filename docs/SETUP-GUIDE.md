# EvacuAI Setup Guide

EvacuAI warns people on campus about emergencies, shows each person a safe way out, and gives safety officers a live
picture of who is safe and who needs help. This guide gets the whole system running on **your own computer**. When it
runs, follow the [Walkthrough](WALKTHROUGH.md) to try every function step by step.

This guide covers, in order:

1. [What you need](#1-what-you-need)
2. [Install Docker Desktop](#2-install-docker-desktop)
3. [Get the code](#3-get-the-code)
4. [Start EvacuAI](#4-start-evacuai)
5. [Open it and sign in](#5-open-it-and-sign-in)
6. [Use a real phone (optional)](#6-use-a-real-phone-optional)
7. [Sample data and simulations](#7-sample-data-and-simulations)
8. [Stop, update and reset](#8-stop-update-and-reset)
9. [Optional features](#9-optional-features)
10. [Privacy and data](#10-privacy-and-data)
11. [Troubleshooting](#11-troubleshooting)

**Where each person works**

| Who | Where | Address once it runs |
|---|---|---|
| Students, faculty, staff | The **EvacuAI app** (phone, or its web version) | http://localhost:8081 |
| Safety officers | The **Command Center** (web), and **Responder mode** in the app | http://localhost:8000/command |
| Admins | The **Admin panel**: accounts, activity log, class schedules, QR stickers | http://localhost:8000/admin |

---

## 1. What you need

- A computer with **8 GB of RAM** or more (Windows 10/11, macOS or Linux) and about **15 GB of free disk space**.
- **Docker Desktop** (next section). It runs everything: you do **not** need PHP, Node.js or a database.
- Chrome, Edge or Firefox.
- An internet connection for the first start (it downloads the building blocks once).
- Optional: an Android phone on the same Wi-Fi as the computer (section 6).

## 2. Install Docker Desktop

1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/ and run the installer.
2. **Windows:** keep **Use WSL 2** ticked. If the installer or Docker asks you to update WSL, open **PowerShell** and
   run the command below, then restart the computer:

   ```powershell
   wsl --update
   ```

3. Start **Docker Desktop** and wait until the whale icon says **Docker Desktop is running** (the first start can take
   a few minutes). You can skip signing in to Docker.

> **Windows tip (slow computer):** Docker can take most of your memory. To cap it, create the file
> `C:\Users\<your name>\.wslconfig` containing the two lines below, run `wsl --shutdown` in PowerShell, then start
> Docker Desktop again.
>
> ```ini
> [wsl2]
> memory=4GB
> ```

## 3. Get the code

**Option A, without git:** open https://github.com/marhkm/evacuai-v2, click the green **Code** button, then
**Download ZIP**. Unzip it, for example to `Documents\evacuai-v2`.

**Option B, with git:**

```bash
git clone https://github.com/marhkm/evacuai-v2.git
```

Then make the settings file: in the `docker` folder, **copy** `.env.example` and name the copy `.env`. The defaults
work as they are.

- **Windows File Explorer:** first turn on **View → Show → File name extensions**, so the file is really named `.env`
  and not `.env.txt`.
- **Terminal (Git Bash, macOS, Linux):**

  ```bash
  cp docker/.env.example docker/.env
  ```

## 4. Start EvacuAI

Open a terminal **in the project folder** (Windows: open the folder in File Explorer, right-click an empty space,
choose **Open in Terminal**). Then run:

```bash
docker compose -f docker/compose.yml up -d --build
```

The **first start takes 10 to 20 minutes**: it builds the app, the Command Center and the phone app's web version,
creates the database, imports the UCLM campus map (Basic Ed and Annex 1) and creates the demo accounts. Later starts
take seconds.

Check that everything is running:

```bash
docker compose -f docker/compose.yml ps
```

You should see `app`, `reverb`, `queue`, `scheduler`, `postgres`, `mailpit` and `mobile-web`, each **Up**, and `app`
marked **healthy**. If `app` is still **starting**, wait a minute and check again.

## 5. Open it and sign in

| What | Address |
|---|---|
| EvacuAI app (web version of the phone app) | http://localhost:8081 |
| Command Center (safety officers) | http://localhost:8000/command |
| Admin panel (admins) | http://localhost:8000/admin |
| Test mailbox (sign-up and password codes) | http://localhost:8025 |

Tip: to make the app look like a phone in Chrome or Edge, press **F12**, click the phone/tablet icon at the top left of
the panel that opens, and choose a phone such as **Pixel 7**.

**Demo accounts** (password for all of them: **`evacuai-demo`**). They exist only on test setups, never in
production.

| Role | Email | Opens on |
|---|---|---|
| Student | student@evacuai.test | The app's student home |
| Faculty | faculty@evacuai.test | The app's student home |
| Staff | staff@evacuai.test | The app's student home |
| Safety officer | safety_officer@evacuai.test | Command Center (web), Responder mode (app) |
| Admin | admin@evacuai.test | Admin panel, Command Center and Responder mode |

You can also create your own account in the app (**Create an account**). The 6-digit code arrives in the test mailbox
at http://localhost:8025. New accounts are always students; an admin can change the role in the Admin panel
(**Users**).

## 6. Use a real phone (optional)

The Android app talks to EvacuAI running on your computer, over Wi-Fi. A phone adds QR sticker scanning, camera photos,
floor tracking with the barometer, GPS check-in and **push notifications**.

1. **Install the app.** Open the EvacuAI APK link your teacher shares (or scan its QR code) on the Android phone,
   download it and tap it to install. Android asks once to allow installing apps from your browser or files app:
   allow it. You do not need an Expo, Firebase or Google Play account.
2. **Start EvacuAI on your computer** (section 4).
3. **Put the phone and the computer on the same Wi-Fi.** School and café networks often block devices from reaching
   each other; a phone hotspot that the computer joins always works.
4. **Find your computer's address.** Windows: run `ipconfig` in PowerShell and copy the **IPv4 Address** of the Wi-Fi
   adapter (for example `192.168.1.5`). macOS: System Settings → Wi-Fi → Details.
5. **Windows only: let the phone through the firewall** (once). Open PowerShell **as administrator** and run:

   ```powershell
   New-NetFirewallRule -DisplayName "EvacuAI test stack" -Direction Inbound -Protocol TCP -LocalPort 8000,8080,8081 -Action Allow -Profile Private
   ```

   Also make sure Windows treats the Wi-Fi as a **Private** network (Settings → Network & internet → Wi-Fi → your
   network → **Private network**).
6. **Point the app at your computer.** Open EvacuAI on the phone, tap **Server: …** under the **Sign in** button, enter
   `http://<your computer's address>:8000` (for example `http://192.168.1.5:8000`), tap **Save server**, and sign in.

**Check:** the phone's browser should open `http://<your computer's address>:8000/up`. If it does not, the phone cannot
reach the computer: check step 3 and step 5.

Push notifications need internet on the computer (they go through Expo's push service). Allow notifications when the
app asks.

Officers can also open the Command Center from another computer or tablet on the same Wi-Fi at
`http://<your computer's address>:8000/command`.

## 7. Sample data and simulations

You cannot easily be twenty students and an officer at once, so EvacuAI includes sample data and simulations. They
work only on test setups.

### 7.1 The sample drill

Every fresh setup already contains a finished **sample earthquake drill** from two days ago, so the officer screens have
data from the start:

- 12 sample people (**Sample Student 01–12**). They have no password, so nobody can sign in as them.
- 9 checked in safe, 1 needed help (with a resolved SOS and a short chat) and 2 never checked in.
- Where each person was during the drill, plus three feedback ratings.

See it in the Command Center: **Safety** (choose the sample drill under **Alert**), **Replay** (choose it and press
**Play**) and **Feedback**.

### 7.2 Simulation commands

Run these in a terminal in the project folder while the app and the Command Center are open. Each one prints what to
look at.

| Command | What happens | Where to look |
|---|---|---|
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate drill` | A drill alert goes out. Over 90 seconds, sample people are seen in their rooms, move to the stairs and check in; one needs help and sends an SOS. The drill is resolved at the end. | App banner; Command Center **Live Ops**, **Safety**, **SOS** |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate reports` | Three sample people report a fire on the same floor. The 3-report rule broadcasts an **UNVERIFIED** alert. | App banner; Command Center **Reports** and **Alerts** (Confirm or Retract) |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate sos` | A sample student sends an SOS from a room. | Command Center **SOS**; app **Responder → SOS inbox** |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate block` | The first open stair is blocked. | An open evacuation route re-routes; Command Center **Paths** |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate reopen` | Every blocked or congested path is opened again. | Command Center **Paths** |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate feed` | Sample earthquake, heavy-rain and wind-signal events become **draft** alerts. | Command Center **Alerts** (status **draft**: Publish or Discard) |

Options for `drill`: `--people=20` (up to 50), `--seconds=180`, and `--keep` (leave the drill active so you can check in,
answer the SOS and resolve it yourself). Option for `reports`: `--hazard=flood` (or earthquake, structural_damage,
other).

## 8. Stop, update and reset

Stop (keeps your data):

```bash
docker compose -f docker/compose.yml down
```

Start again later:

```bash
docker compose -f docker/compose.yml up -d
```

Update after downloading new code (new ZIP or `git pull`):

```bash
docker compose -f docker/compose.yml up -d --build
```

Reset everything: deletes the database, accounts you made and uploaded photos. The next start creates a fresh setup.

```bash
docker compose -f docker/compose.yml down -v
```

## 9. Optional features

These are off until they are set in `docker/.env`. After changing that file, run
`docker compose -f docker/compose.yml up -d --build`.

| Feature | Settings in `docker/.env` | Notes |
|---|---|---|
| Hazard feeds | `FEEDS_ENABLED=true`, `CAMPUS_LAT`, `CAMPUS_LNG` | Every 5 minutes, turns nearby earthquakes (PHIVOLCS, USGS), heavy-rain forecasts (Open-Meteo) and PAGASA wind signals into **draft** alerts for officers to publish or discard. `FEEDS_FAKE=true` uses built-in samples without internet. |
| AI assist | `GEMINI_API_KEY` and/or `GROQ_API_KEY`, or `OLLAMA_URL` | Adds **Translate with AI** to the alert form and **Summarize** to Reports. Free AI tiers may keep what you send: never type names or phone numbers in alerts. |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client (Web application) with `http://localhost:8081` as authorized origin and redirect URI. In Testing mode, add each student's Google email as a test user. |
| Microsoft 365 sign-in | `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID` | Entra ID "Single-page application" registration with redirect `http://localhost:8081`. Only accounts of that school can sign in. |
| SMS alerts | `SEMAPHORE_API_KEY` | Sends alerts by SMS (paid per message) to users with a mobile number. |

**Building the Android app (teachers only).** Testers install the APK from a link and never build it. It is built on
Expo's servers from the `mobile` folder by the Expo account that owns the project:

```bash
cd mobile
```

```bash
npx eas-cli@latest build --platform android --profile preview
```

After 15–40 minutes the build page on expo.dev shows the download link and a QR code to share. Build again after app
changes (for example new fonts or screens); the new APK installs over the old one.

## 10. Privacy and data

EvacuAI follows the Data Privacy Act of 2012 (RA 10173):

- Location is used only during an emergency (route, SOS, check-in), kept only for an active alert, and deleted after
  30 days.
- Report photos are re-saved without hidden data (GPS position, phone model, time), are visible only to safety officers
  and admins, and are deleted 30 days after the report is closed.
- The officer's list of missing people is never saved on officers' phones.
- IP addresses in the activity log are cleared after 30 days. Deleting your account deletes your reports and photos.
- AI translation and summaries send only the alert or report text, never names or contact details.
- The 30-day period is `PRIVACY_RETENTION_DAYS` in `docker/.env`. Before a pilot with real users, check the setup with
  the UCLM Data Protection Officer.

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `docker` is not recognized | Docker Desktop is not installed or not running. Start it and wait until it says **running**, then open a new terminal. |
| "port is already allocated" | Another program uses port 8000, 8080, 8081, 5432, 8025 or 1025. Close it, or stop the other Docker project. |
| The first start seems stuck | It downloads a lot once. Wait, then check `docker compose -f docker/compose.yml logs app`. |
| The computer becomes very slow | Cap Docker's memory (tip in section 2), close other programs, and build one part at a time: `docker compose -f docker/compose.yml build app`, then `docker compose -f docker/compose.yml build mobile-web`, then `up -d`. |
| http://localhost:8000/command says "Command Center not built" | Rebuild: `docker compose -f docker/compose.yml up -d --build`. |
| The app says "Cannot reach the server" | Check that `app` is running (`docker compose -f docker/compose.yml ps`). On a phone, check the server address, the Wi-Fi and the firewall (section 6). |
| No sign-up code arrives | Open http://localhost:8025. On a test setup all emails go there. |
| Alerts or chat do not update live | Check that `reverb` is running. The Command Center shows **RECONNECTING** and refreshes every 15 seconds meanwhile. |
| "This browser cannot show 3D" | Turn on hardware acceleration in the browser settings, or use **Floor plan** or **All floors**. |
| A safety officer cannot open the Admin panel | Correct: the Admin panel is for admins. Officers use the Command Center at http://localhost:8000/command. |
| A student cannot open the Command Center | Correct: only safety officers and admins can. An admin can change the role in **Users**. |
| Start over completely | `docker compose -f docker/compose.yml down -v`, then `docker compose -f docker/compose.yml up -d --build`. |

Found a bug? Write down the steps you took, what you expected, what happened, and add a screenshot. Then open a GitHub
issue or give it to your teacher.
