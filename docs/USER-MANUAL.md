# EvacuAI User Manual

EvacuAI warns people on campus about emergencies, shows each person a safe way out of the building, and gives safety
officers a live picture of who is safe and who needs help.

This manual walks through everything, in order:

1. [Run EvacuAI on your computer (Docker)](#1-run-evacuai-on-your-computer-docker)
2. [The mobile app](#2-the-mobile-app)
3. [The admin dashboard (web)](#3-the-admin-dashboard-web)
4. [A complete drill, start to finish](#4-a-complete-drill-start-to-finish)
5. [Sample data and simulations](#5-sample-data-and-simulations)
6. [Optional features](#6-optional-features)
7. [Privacy and data](#7-privacy-and-data)
8. [Troubleshooting](#8-troubleshooting)

**Who uses what**

| Role | Uses | Can do |
|---|---|---|
| Student, faculty, staff | Mobile app | Receive alerts, find the evacuation route, report hazards, send SOS, check in safe |
| Safety officer | Admin dashboard (and the app) | Everything above, plus broadcast alerts, verify reports, block paths, answer SOS, monitor the evacuation |
| Admin | Admin dashboard | Everything a safety officer can do, plus manage users and roles and read the activity log |

New accounts are always students. Only an admin can make someone a safety officer or admin.

---

## 1. Run EvacuAI on your computer (Docker)

### 1.1 What you need

- A computer with 8 GB of RAM or more (Windows 10/11, macOS or Linux).
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/ (on Windows, accept the WSL 2 option during setup).
- A modern browser (Chrome, Edge or Firefox).
- Optional: an Android phone on the same Wi-Fi.

You do not need PHP, Node.js or a database. Docker runs everything.

> **Windows tip:** Docker uses WSL 2, which can take most of your memory. To cap it, create `C:\Users\<you>\.wslconfig`
> with these lines, then run `wsl --shutdown` and restart Docker Desktop:
>
> ```ini
> [wsl2]
> memory=4GB
> ```

### 1.2 Get the code

Either download the repository as a ZIP from GitHub (green **Code** button, then **Download ZIP**) and unzip it, or use git:

```bash
git clone https://github.com/marhkm/evacuai-v2.git
```

### 1.3 Configure

In the `docker` folder, copy `.env.example` to a new file named `.env`. The defaults work as they are for local testing.

```bash
cp docker/.env.example docker/.env
```

(On Windows without git bash: copy and rename the file in File Explorer.)

### 1.4 Start

Open Docker Desktop and wait until it says it is running. Then, in a terminal in the repository folder:

```bash
docker compose -f docker/compose.yml up -d --build
```

The first start takes several minutes: it builds the images, creates the database, imports the campus map and creates
the demo accounts. Later starts take seconds.

Check that everything is up:

```bash
docker compose -f docker/compose.yml ps
```

All services should show `running` (and `app` should show `healthy`).

### 1.5 Open it

| What | Address |
|---|---|
| Mobile app (web version) | http://localhost:8081 |
| Admin dashboard | http://localhost:8000/admin |
| Test mailbox (verification and reset codes) | http://localhost:8025 |

Tip: open the mobile app in your browser's phone view (press F12, then the phone/tablet icon) so it looks like a phone.

### 1.6 Demo accounts

All demo accounts use the password **`evacuai-demo`**. They exist only on test setups (`SEED_DEMO=true`) and never
in production.

| Role | Email |
|---|---|
| Admin | admin@evacuai.test |
| Safety officer | safety_officer@evacuai.test |
| Student | student@evacuai.test |
| Faculty | faculty@evacuai.test |
| Staff | staff@evacuai.test |

### 1.7 Stop, update, reset

Stop (keeps your data):

```bash
docker compose -f docker/compose.yml down
```

Update after pulling new code:

```bash
docker compose -f docker/compose.yml up -d --build
```

Reset everything (deletes the database and uploaded photos, then starts fresh on the next `up`):

```bash
docker compose -f docker/compose.yml down -v
```

### 1.8 Use a real phone (optional)

The web version runs on your PC. To use a phone on the same Wi-Fi:

1. Find your PC's local IP address (Windows: run `ipconfig` and look for the IPv4 address, e.g. `192.168.1.5`).
2. Install the EvacuAI test APK on the phone (when available).
3. On the sign-in screen, tap **Server: …**, enter `http://<your-PC-IP>:8000`, then tap **Save server**.

The phone app adds the camera (QR stickers, hazard photos), the barometer (floor tracking), GPS check-in and push
notifications. If Windows Firewall asks, allow Docker on private networks.

---

## 2. The mobile app

Open http://localhost:8081 (or the app on your phone).

### 2.1 Create an account and sign in

**Sign in:** enter your email and password, then tap **Sign in**.

**Create an account:**

1. Tap **Create an account**.
2. Enter your full name, email and a password (8 characters or more) twice, then tap **Create account**.
3. A 6-digit code is emailed to you. On a test setup, open http://localhost:8025 to read it.
4. Enter the code and tap **Verify**. (**Send a new code** if it expired.)

**Forgot password:** tap **Forgot password?**, enter your email, read the code (Mailpit on a test setup), then set a new
password.

**Google or Microsoft 365:** the **Continue with Google** and **Continue with Microsoft 365** buttons appear only when
the instructor has set them up (see [6. Optional features](#6-optional-features)).

**Privacy notice:** the first time you sign in, read the notice and tap **I agree**. The app only uses your location
during an emergency (route, SOS, check-in).

### 2.2 Home screen

The home screen shows any **active alert** at the top (red for real alerts, amber for drills), your name, and these
buttons:

| Button | What it does |
|---|---|
| **SOS** | Ask safety officers for help (always available) |
| **Check in safe** | Tell officers you are safe (shown only while an alert is active) |
| **Evacuation route** | Step-by-step way out from where you are |
| **Report a hazard** | Report fire, smoke, flooding, damage and more |
| **Campus map** | Floor plans, all floors at once, and 3D |
| **Alerts** | Current and past alerts |
| **Profile** | Your details, password, sign out, delete account |
| **Send feedback** | Rate the app |

### 2.3 Alerts

- New alerts appear on the home screen within seconds, even without refreshing. On a phone they also arrive as push
  notifications.
- Labels tell you what kind of alert it is: **[DRILL]** means practice; **UNVERIFIED** means several people reported
  it but an officer has not confirmed it yet.
- If the officer added Cebuano or Filipino translations, they appear under the English message.
- **Alerts** lists the active alerts first, then the last 30 days, with their status (active, resolved, retracted).

### 2.4 Report a hazard

1. Tap **Report a hazard**.
2. Choose what it is: **Fire**, **Earthquake**, **Flood**, **Structural damage** or **Other**.
3. Choose the building (if there are several) and the floor. Optionally choose the room or area.
4. Optionally describe what you see (up to 500 characters).
5. Optionally add a photo: **Take photo** (phone) or **Choose photo**. Tap **Remove photo** to drop it.
6. Tap **Send report**.

Safety officers see the report right away. When **three different people** report the same hazard on the same floor
within 10 minutes, everyone automatically gets an **UNVERIFIED** alert while an officer checks it.

Do not put people's names or faces in reports if you can avoid it.

### 2.5 Evacuation route

You should never have to scan anything in an emergency. In most cases the route is ready the moment the screen opens.

1. Tap **Evacuation route**, or simply tap the alert notification on your phone, which opens this screen directly.
2. **What is happening?** If an alert is active, the app already knows (e.g. "Routing for: fire"). Otherwise choose
   **Earthquake**, **Fire** or **Flood**. Each hazard has its own rules: fire avoids smoky paths, flood leads upstairs,
   and elevators are never used.
3. **Where you are.** The app works this out by itself when it can, and shows it as "Starting from …":
   - **Your class now:** during class time it starts from your classroom (from the class schedule), with no tap.
   - **Earlier today:** a room you picked or a sticker you scanned earlier today is remembered on your phone (even
     after closing the app) until your next class starts.
   - **Floor tracking:** if you went up or down the stairs, it starts from that floor's stair landing.

   If it is wrong, or it does not know yet, tap **Pick my room** and choose the building, floor and room. Scanning
   the QR sticker by the door (**Scan QR sticker instead**) is optional: it is the most exact, and it is best done in
   calm times, for example when you enter a room that has no scheduled class.
4. The app shows **"N m to safety"**, numbered steps (e.g. "Exit BE301", "Take Stairs Left down to Ground",
   "Go to Exit North") and the route drawn on the floor plan, with your position and the destination. Use the floor
   buttons to see each floor of the route.

While you follow the route:

- **It updates itself.** If an officer blocks a path (for example a smoky stairway), the route changes within a few
  seconds.
- **Floor tracking (phones with a barometer):** when you go up or down the stairs, the app moves your starting point to
  that floor's stair landing and recalculates. The source shows as "floor change detected". Confirm your exact spot
  with a sticker or **Pick my room** when you can.
- **Offline:** the last downloaded map is kept on the phone, so routing still works without a connection. The app says
  when it is offline.
- If there is **no safe way out**, the app tells you to stay where you are if it is safe, call for help, and follow
  safety officers. Use **SOS**.

### 2.6 Campus map

Tap **Campus map**. If there are several buildings, choose one at the top. Then choose a view:

- **Floor plan:** one floor at a time (choose the floor). Blocked paths are red and dashed; congested paths are orange;
  rooms with a reported hazard are red. Exits and assembly points are green dots; stairs are blue dots. The text below
  says how many paths are blocked on that floor.
- **All floors:** every floor stacked, ground floor at the bottom, with hazard and blocked-path counts per floor.
  Works on every phone.
- **3D:** drag to turn, pinch or scroll to zoom, tap a room to see its name. Shown only on phones with enough memory
  (3 GB or more) and on computers. When a new alert starts, the map switches back to the plain floor plan.

### 2.7 SOS

Use SOS when you are hurt, trapped or in danger.

1. Tap **SOS**.
2. Check where the app thinks you are ("Your location: …"). If it is missing or wrong, tap **Pick my room** (or,
   optionally, **Scan QR sticker instead**). The app remembers what you set on the route screen.
3. Optionally write what happened.
4. Tap **Send SOS**.

Then:

- The screen shows **Waiting for a safety officer…**, then **<Officer> is responding.**
- **Chat:** type in **Message** and tap **Send message**. Officer replies appear within seconds.
- **Cancel SOS (I'm safe now):** possible only until an officer responds. After that, tell them in the chat.
- Pressing SOS again while one is open does not create a second request.

### 2.8 Check in safe

During an active alert, when you reach a safe place:

1. Tap **Check in safe** on the home screen.
2. Choose one:
   - **Check in safe at <assembly point>**: shown when your phone's GPS says you are at an assembly point (one tap).
   - **Scan assembly point QR** (phone): scan the sticker at the assembly point.
   - **I'm safe (not at an assembly point)**: for example if you left campus.
   - **I need help**: officers see you as needing help; then tap **Send SOS** to talk to them.
3. The screen confirms, e.g. "You checked in safe at Field, 9:42 AM". You can change your answer at any time during
   the alert.

### 2.9 Feedback

Tap **Send feedback**, choose 1 to 5 stars, optionally add comments, and tap **Send feedback**.

### 2.10 Profile

- **Full name**, **Department**, **Mobile number** (format 09XXXXXXXXX): edit and tap **Save profile**.
- **Change password:** current password (if you have one), new password twice, then **Update password**.
- **Sign out.**
- **Delete my account:** enter your password and confirm. This removes your account, reports and photos permanently.
- **Record pressure trace (test builds):** for students helping tune floor tracking. Stand still, tap
  **Start recording**, walk the stairs written in the note, stand still, **Stop recording**, then **Share trace**.

---

## 3. The admin dashboard (web)

Open http://localhost:8000/admin and sign in as a safety officer or admin (e.g. `safety_officer@evacuai.test`). Other
accounts cannot open the dashboard.

The bell icon (top right) shows notifications: new SOS requests, unverified alerts from reports, and new draft alerts
from hazard feeds.

### 3.1 Dashboard

Live numbers (refresh every 10 seconds):

- **Registered people**, **Pending hazard reports**, **Open SOS**, **Blocked / congested paths**.
- **SOS response (30 days):** average time until an officer acknowledges an SOS.
- **Feedback:** average rating.
- For the current or latest alert: **Checked in** (safe / need help / unknown and the check-in rate) and
  **Evacuation time (median)** with the slowest time.

### 3.2 SOS

The SOS list shows open requests first, with the person, their location, message, number of chat messages, status and
the responding officer. It refreshes every 5 seconds.

- **Acknowledge:** tells the person an officer is on it.
- **Resolve:** closes the request.
- Click a row to open the **chat**: see the person's location, phone number and messages, then type a reply and press
  **Send**. Replying also acknowledges the SOS.

### 3.3 Safety Monitor

For the current alert (or a past one chosen under **Alert**):

- Totals: **Safe**, **Needs help**, **Unknown** (no check-in yet), **Open SOS**, **People**, plus how many people
  checked in at each assembly point.
- A list of everyone with their status, where they are (assembly point or last known location), last update and
  phone. People who need help or have an open SOS are listed first, then unknown, then safe.
- Filter by status, or search by name.
- **Drill report (CSV):** downloads a spreadsheet for the selected alert (see 3.5).

### 3.4 Campus 3D

A live 3D view of the campus, updated every 2 seconds:

- Red tubes: blocked paths. Orange: congested paths.
- Red rooms: hazard reported. Yellow to dark orange rooms: people still inside (from their last known location;
  people who checked in safe are not counted).
- Red pins: open SOS. Green pins: assembly points with people checked in.

Drag to rotate, scroll to zoom, click a room or pin for details. **Floors → Up to <floor>** hides the floors above, so
you can look inside.

**Replay:** choose a past alert or drill under **Replay**, then press **Play** or drag the time slider to watch how
people moved and checked in. People are numbered, not named. Choose **Live (now)** to go back.

### 3.5 Alerts

**Broadcast an alert:**

1. **Alerts → Broadcast alert**.
2. Choose the **hazard type** and **severity**, the **building** (or leave it campus-wide), and write the **message**:
   what happened, where, and what to do (e.g. "Fire at BE 2F. Use Stairs Left to Exit North.").
3. Optional: fill in **Cebuano** and **Filipino** translations, or click **Translate with AI** (only if configured)
   and check its text.
4. Turn on **This is a drill** for practice.
5. If fewer than three people reported it, tick **I verified this incident directly**.
6. Click **Create**. Everyone gets it within seconds (in the app, by push on phones, and by SMS if configured).

**Manage alerts** in the list:

- **Confirm:** marks an unverified, report-based alert as verified.
- **Resolve:** the emergency is over.
- **Retract:** false alarm.
- **Drill report:** downloads the CSV report: a summary (people, safe, needs help, unknown, check-in rate, median and
  slowest evacuation time, SOS count and response time) and one row per person. It opens in Excel or Google Sheets.
- **Drafts from hazard feeds** (if enabled) show as "Draft": **Publish** (you can edit the message first) or
  **Discard**. Drafts are never sent to anyone until published. Filter by status **Draft (from feeds)** to find them.

### 3.6 Hazard Reports

Reports from the app, newest first, refreshing every 5 seconds. The **Same-floor reporters (10 min)** column turns red
at three reporters.

- **View photo:** opens the reporter's photo (officers only).
- **Verify:** confirms the hazard. Verified rooms are avoided by everyone's evacuation route.
- **Dismiss:** not a real hazard.
- **Resolve:** the hazard is cleared.
- **Broadcast alert** (top right): opens the alert form.

### 3.7 Paths

Every path segment of the campus map (corridors, doors, stairs, outdoor paths). Set **Status** to **Open**,
**Congested** or **Blocked** right in the list. Open apps re-route within seconds. Filter by status, building or type.
The menu badge shows how many paths are blocked.

### 3.8 Users

- Create, edit or delete accounts. Set **Role** (student, faculty, staff, safety officer, admin), department, phone and
  **Active**. Turning **Active** off stops that person from signing in.
- You cannot change your own role or deactivate yourself.
- Every role change is recorded in the activity log.

### 3.9 Import class schedules

Upload a CSV from the registrar with the columns `email, subject, room_code, days, time_start, time_end`, for example
`juan@uclm.edu.ph, IT 101, BE203, MWF, 08:00, 09:30`. Day codes: M, T, W, TH, F, S, SU and combinations like MWF or
TTH. Each listed student's previous schedule is replaced; problems are listed by row. During class time the app then starts the
evacuation route from the student's classroom automatically.

### 3.10 QR stickers

A printable sheet with one QR sticker per room, stair landing, exit and assembly point. Choose a building, then print
(or save as PDF from the print dialog). Put stickers inside every room door, at each stairwell landing on every floor,
at exits and at assembly points.

Scanning is optional for everyone: the app finds people from their class schedule, earlier picks and floor tracking,
and **Pick my room** always works. The stickers make locations exact when scanned in calm times, and the printed room
name helps people tell officers where they are.

### 3.11 Reports: Feedback and Activity log

- **Feedback:** every rating and comment, with the average.
- **Activity log** (admins only): sign-ins, registrations, account deletions, role changes, alerts issued and updated,
  path changes, SOS sent/acknowledged/resolved, check-ins, hazard reports and feedback. Filter by activity type.

---

## 4. A complete drill, start to finish

Use two browser windows side by side: the app at http://localhost:8081 signed in as `student@evacuai.test`, and the
dashboard at http://localhost:8000/admin signed in as `safety_officer@evacuai.test`.

1. **Dashboard:** open **Campus 3D** in a tab to watch.
2. **Dashboard → Alerts → Broadcast alert:** Earthquake, high, campus-wide, message "Earthquake drill. Drop, cover and
   hold on. Then evacuate to the field.", **This is a drill** on, **Create**.
3. **App:** the amber **[DRILL] EARTHQUAKE ALERT** banner appears within seconds.
4. **App → Evacuation route → Pick my room →** Third → BE301. Read the steps.
5. **Dashboard → Paths:** set the first stair on that route to **Blocked**. The app's route changes by itself within a
   few seconds. Campus 3D shows the red stair.
6. **App → SOS:** pick your room, write "Twisted ankle on the stairs", **Send SOS**.
7. **Dashboard → SOS:** open it, reply "Stay where you are, we are coming." The app shows the reply.
   **Resolve** it.
8. **App → Check in safe → I'm safe (not at an assembly point)** (or scan the assembly point sticker on a phone).
9. **Dashboard → Safety Monitor:** the student is Safe; the others are Unknown. Click **Drill report (CSV)**.
10. **Dashboard → Alerts:** **Resolve** the drill. Set the stair back to **Open** in **Paths**.
11. **Dashboard → Campus 3D → Replay:** choose the drill and press **Play**.

---

## 5. Sample data and simulations

Testing alone, you cannot easily be twenty students and an officer at once. EvacuAI comes with sample data and
simulation commands for that. They exist only on test setups and refuse to run in production.

### 5.1 The sample drill

Every fresh test stack includes a finished **sample earthquake drill** from two days ago, so every dashboard screen has
data from the start:

- 12 sample people (**Sample Student 01–12**). They have no password, so nobody can sign in as them.
- 9 checked in safe, 1 needed help (with a resolved SOS and a short chat), and 2 never checked in.
- Where each person was seen during the drill, plus three feedback ratings.

Try it:

- **Safety Monitor** → **Alert** → choose the sample drill.
- **Campus 3D** → **Replay** → choose the sample drill → **Play**.
- **Alerts** → **Drill report** on the sample drill.
- **SOS** (filter **Resolved**) and **Reports → Feedback**.

The sample people also appear as **Unknown** in your own drills; that is expected.

### 5.2 Simulation commands

Run these in a terminal in the repository folder while the app and the dashboard are open. Each prints what to look
at.

| Command | What happens | Where to look |
|---|---|---|
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate drill` | A drill alert goes out. Over 90 seconds, sample people are seen in their rooms, move to the stairs and check in; one needs help and sends an SOS. The drill is resolved at the end. | App banner, Dashboard, Safety Monitor, Campus 3D, SOS |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate reports` | Three sample people report a fire on the same floor, two seconds apart. The 3-report rule broadcasts an **UNVERIFIED** alert. | App banner, Hazard Reports, bell, Alerts (Confirm or Retract) |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate sos` | A sample student sends an SOS from a room. | SOS desk, bell (reply in the chat) |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate block` | The first open stair is blocked. | Your open evacuation route re-routes; Paths; Campus 3D |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate reopen` | Every blocked or congested path is opened again. | Paths, Campus 3D |
| `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate feed` | Sample earthquake and heavy-rain events become **draft** alerts. | Alerts → filter **Draft (from feeds)** → Publish or Discard |

Options for `drill`:

- `--people=20`: how many sample people take part (up to 50).
- `--seconds=180`: how long the drill runs.
- `--keep`: leave the drill active at the end, so you can check in yourself, answer the SOS and resolve it in the
  dashboard.

Options for `reports`: `--hazard=flood` (or earthquake, structural_damage, other).

Tip: start an evacuation route in the app as **student@evacuai.test**, then run `drill --keep` and `block` to watch the
banner, the re-route and the dashboards react together.

---

## 6. Optional features

These are off until the instructor sets them in `docker/.env`, then restarts with
`docker compose -f docker/compose.yml up -d` (add `--build` for the Google and Microsoft buttons).

| Feature | Settings in `docker/.env` | Notes |
|---|---|---|
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client of type Web application; add `http://localhost:8081` as an authorized origin and redirect URI. While in Testing mode, add each student's Google email as a test user. |
| Microsoft 365 sign-in | `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID` | Entra ID "Single-page application" registration with redirect `http://localhost:8081`. Only accounts from that school tenant can sign in. |
| Hazard feeds | `FEEDS_ENABLED=true`, `CAMPUS_LAT`, `CAMPUS_LNG` | Checks USGS earthquakes (magnitude 4.5+ within 100 km) and Open-Meteo rain forecasts (15 mm/h+) every 5 minutes and creates **draft** alerts for officers. `FEEDS_FAKE=true` uses built-in samples without internet. |
| AI translation | `GEMINI_API_KEY` and/or `GROQ_API_KEY`, or `OLLAMA_URL` | Adds **Translate with AI** to the alert form. Tries Gemini, then Groq, then a local Ollama model (`docker compose -f docker/compose.yml --profile ai-local up -d`, then `OLLAMA_URL=http://ollama:11434`). |
| SMS alerts | `SEMAPHORE_API_KEY` | Sends alerts by SMS (Semaphore, paid per message) to users with a mobile number. |

---

## 7. Privacy and data

EvacuAI follows the Data Privacy Act of 2012 (RA 10173):

- Location is used only during an emergency: on the route screen, for SOS and for check-in. Location history is kept
  only for an active alert and deleted after 30 days.
- Report photos are re-saved without their hidden data (GPS position, phone model, time), are visible only to safety
  officers and admins, and are deleted 30 days after the report is closed.
- IP addresses in the activity log are cleared after 30 days.
- Deleting your account deletes your reports and photos.
- The AI translation sends only the alert text, never names or contact details. Do not type names or phone numbers in
  alert messages.
- The 30-day period is `PRIVACY_RETENTION_DAYS` in `docker/.env`. Before a pilot with real users, check the setup with
  the UCLM Data Protection Officer.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `docker compose` says the port is already in use | Another program uses port 8000, 8080, 8081, 5432, 8025 or 1025. Close it, or stop the other Docker project. |
| The first start seems stuck | The first build downloads a lot. Wait, then check `docker compose -f docker/compose.yml logs app`. |
| The PC becomes very slow | Cap WSL memory (see 1.1) and build images one at a time: `docker compose -f docker/compose.yml build app`, then `... build mobile-web`. |
| The app says "Cannot reach the server" | Make sure `app` is running (`docker compose -f docker/compose.yml ps`). On a phone, check the server address and that the phone and PC are on the same Wi-Fi. |
| No verification email | Open http://localhost:8025 (Mailpit). Real emails are only sent when SMTP is configured. |
| Alerts or chat do not update live | Check that `reverb` is running. The app still catches up when you reopen a screen. |
| "This browser cannot show 3D" | Turn on hardware acceleration in the browser settings, or use **All floors** instead. |
| The admin dashboard refuses a student account | Correct: only safety officers and admins can use it. An admin can change the role in **Users**. |
| Start over completely | `docker compose -f docker/compose.yml down -v`, then `up -d --build`. |

Found a bug? Open a GitHub issue with the steps you took, what you expected, what happened, and a screenshot.
