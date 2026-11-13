# EvacuAI Walkthrough and Test Scenarios

This walkthrough takes you through every part of EvacuAI, one role at a time, as a set of test scenarios. Each scenario
has **Steps** to follow and an **Expected result** with check boxes: tick a box when you see that result. If something
is different, write it in the [results table](#7-results) at the end.

Before you start, EvacuAI must be running on your computer (see the [Setup Guide](SETUP-GUIDE.md)).

1. [Before you start](#1-before-you-start)
2. [Student: the EvacuAI app](#2-student-the-evacuai-app)
3. [Safety officer: the Command Center](#3-safety-officer-the-command-center)
4. [Safety officer on the phone: Responder mode](#4-safety-officer-on-the-phone-responder-mode)
5. [Admin: the Admin panel](#5-admin-the-admin-panel)
6. [Full drills, start to finish](#6-full-drills-start-to-finish)
7. [Results](#7-results)

---

## 1. Before you start

**Use two browser windows side by side**, so you can watch one role react to the other:

| Window | Address | Sign in as |
|---|---|---|
| Left: the app (phone view: press F12, then the phone icon) | http://localhost:8081 | `student@evacuai.test` |
| Right: the Command Center | http://localhost:8000/command | `safety_officer@evacuai.test` |

The password of every demo account is **`evacuai-demo`**. Use a **private/incognito window** when you need a second
person in the app at the same time (each window keeps its own sign-in).

**Drills are practice.** Always tick **Drill** when you broadcast a test alert, so everyone can tell it is not real.
Resolve your drills when you finish a scenario, so the next one starts clean.

**On a shared test server** (`http://<server IP>`), use the password your teacher gives you instead of `evacuai-demo`, and use the APK for QR scans and GPS check-in: browsers only allow the camera and location on `https://` or `localhost`.

**Colours mean the same everywhere** (like the safety signs on campus): red is danger and SOS, green is the way out and
safe, amber is a warning or a drill, and blue is information.

---

## 2. Student: the EvacuAI app

![The app's home during a drill: the alert band, EVACUATE NOW, SOS and Check in safe](images/app-home.jpg)

### S1. Create an account

**Steps**

1. Open http://localhost:8081 and tap **Create an account**.
2. Enter your full name, an email (any address, for example `juan.test@example.com`) and a password of 8 characters or
   more, twice. Tap **Create account**.
3. Open the test mailbox at http://localhost:8025, open the newest email and copy the 6-digit code.
4. Back in the app, enter the code and tap **Verify**.
5. Read the privacy notice and tap **I agree**.

**Expected result**

- [ ] The code email arrives in the test mailbox within seconds.
- [ ] After **I agree**, the home screen says **Welcome, <your name>**.
- [ ] With no alert active, the home shows a green **All clear** card.

### S2. Sign in, sign out, forgot password

**Steps**

1. Tap **Profile**, then **Sign out**.
2. Sign in as `student@evacuai.test` / `evacuai-demo`. Before tapping **Sign in**, tap **Show** next to the password,
   then **Hide**.
3. Sign out again, tap **Forgot password?**, enter the email of the account from S1, read the code at
   http://localhost:8025 and set a new password. Sign in with it.

**Expected result**

- [ ] Signing in opens the home screen.
- [ ] **Show** reveals the typed password and **Hide** hides it again (every password box in the app has it).
- [ ] A wrong password shows an error and does not sign in.
- [ ] The new password works; the old one no longer does.

### S3. Find the way out (no alert)

**Steps**

1. Sign in as `student@evacuai.test`. Tap **Evacuation route**.
2. Under **What is happening?** choose **Fire**.
3. Tap **Pick my room**, then **Basic Education Building**, **Third**, **BE301**.
4. Read the steps. Tap the floor buttons (**Ground**, **Second**, **Third**) under the steps.
5. Go back, pick **Annex 1**, a floor and a room, and look at its route.

**Expected result**

- [ ] A green panel shows **"… m to safety"** and numbered steps such as "Exit BE301" and "Take Stairs Left down to …".
- [ ] The floor plan shows red arrows along the route and a green figure where you are.
- [ ] Annex 1 is drawn like the official evacuation posters (walls, doors, stairs, blue room names), and the route
      ends with an **Exit to …** badge.

![Evacuation route: distance, numbered steps and the poster-style floor plan](images/app-route.jpg)

### S4. Campus map and the 3D building

**Steps**

1. Go home and tap **Campus map**. Choose a building (**Annex 1** or **Basic Education Building**).
2. Switch between **Floor plan**, **All floors** and **3D**.
3. In **3D**:
   - Drag to turn and pinch (or scroll) to zoom.
   - Under the view, tap a floor (for example **Third**), then **Whole building**.
   - Tap **Top**, then **Front**, then **3D**.
   - Drag **Explode floors** to the right.
   - Tap **Reset**, then **Full screen**.
4. In 3D, tap a room on a floor you picked.
5. On **Floor plan**, tap **Legend**.

**Expected result**

- [ ] **3D** shows only the chosen building, as a model: full-height walls, tinted rooms, glass stair cores, and the
      building's name.
- [ ] Picking a floor flies the camera to it and shows its room names; floors above disappear, floors below fade.
      **Whole building** shows them all again.
- [ ] **Top** looks straight down like a plan; **Explode floors** pulls the floors apart so every floor is visible.
- [ ] Tapping a room opens a sheet with its name, floor and how many people are inside, with **Route from here**.
- [ ] **Full screen** opens the 3D view on its own screen; **Close** goes back.
- [ ] The legend explains the route arrows, your location, blocked and congested paths and stairs.

![The 3D building on the phone, with its native controls](images/app-3d.jpg)

### S5. Report a hazard with a photo

**Steps**

1. Go home and tap **Report a hazard**.
2. Under **What is it?** choose **Fire**. Choose the building and floor, and optionally a room.
3. Under **What do you see?** write "Smoke coming from the hallway".
4. Tap **Take photo** and take a picture (a photo is required, and only the camera works: no gallery). Tap
   **Send report**.
5. In the Command Center window, open **Reports**.
6. Try **Send report** without a photo, and with a photo taken more than 10 minutes ago.

**Expected result**

- [ ] The app says **Report sent. Safety officers have been notified.**
- [ ] The report appears in the Command Center **Reports** list within seconds, with **View photo**.
- [ ] The report shows what the checks found: an **AI** chip (**looks like fire**, **doesn't look like fire**,
      **unclear**, or **not available** when the server's AI is off), and **Location matches**, **Reporter was
      elsewhere (…)** or **Location unknown**.
- [ ] Without a photo the app says **Take a photo of the hazard.**; an old photo is refused with **Take a new photo of
      the hazard (photos older than 10 minutes are not accepted).**

### S6. Send an SOS and chat with an officer

**Steps**

1. In the app, tap the red **SOS** button once. There is no form: it sends straight away and opens the SOS chat.
2. Tap SOS again from home on another try, and within 10 seconds tap **Cancel (sent by mistake)**.
3. Tap **SOS** once more. If the app asks **We sent your class room… Are you there?**, answer **Yes** (or **No, change**
   to pick another room). If it says **Location unknown**, tap **Pick my room** and choose your room.
4. In the Command Center, open **SOS**, click the request, click **Acknowledge** and reply "Stay where you are, we are
   coming." with **Send**.
5. In the app, reply "Thank you" with **Send message**.
6. In the Command Center, click **Resolve** and confirm.

**Expected result**

- [ ] One tap sends the SOS: the app shows **Waiting for a safety officer…** at once, then **<officer> is responding**
      after Acknowledge.
- [ ] **Cancel (sent by mistake)** shows for 10 seconds only; after that the button reads **Cancel SOS (I'm safe now)**.
- [ ] The Command Center shows where the place came from: **from class schedule** (you have a class now),
      **from GPS** (no class, the admin set the building's corners in A4, and you are inside it), **approximate (last
      known)** (a room you picked or scanned earlier today), or **Location unknown**.
- [ ] Picking a room updates the place in the Command Center within seconds.
- [ ] Messages show their time, with **Today** above the first one.
- [ ] Messages appear on the other side within seconds, without refreshing.
- [ ] The Command Center's **SOS** menu shows a red count while the SOS is open.
- [ ] After Resolve, the app says your last SOS was resolved.

![SOS in the app](images/app-sos.jpg)

### S7. Alerts and check-in (needs an active drill)

**Steps**

1. In the Command Center, open **Alerts**. Choose **Fire**, severity **high**, tick **Drill**, write the message "Fire
   drill. Leave the building by the nearest stairs." and click **Broadcast**.
2. Watch the app's home screen.
3. In the app, tap **EVACUATE NOW**, then go back and tap **Check in safe**. Under **I'm safe at a safe zone**, tap
   **Open ground · …** (or **Scan safe zone QR**, or **I'm safe (not at a safe zone)**).
4. Tap **Open ground · …** again.
5. Tap **Scan safe zone QR**, then **Close scanner**. Open it again and tap **Close** on the camera. Open it once more
   and go back to the home screen.
6. Tap **Alerts** on the home screen.

**Expected result**

- [ ] Within seconds, the app shows an amber striped **[DRILL] FIRE ALERT** band, without refreshing.
- [ ] The home then leads with a big green **EVACUATE NOW** button, with **SOS** and **Check in safe** under it.
- [ ] **EVACUATE NOW** opens the evacuation route already set for fire.
- [ ] Each safe zone shows how many people are there, for example **Open ground · 1 of 300** (or **· 1 here** when an
      admin has not set a capacity, A6).
- [ ] Check-in confirms **You checked in safe at … Open ground.** There is no **I need help** button: SOS is the way
      to ask for help.
- [ ] Checking in again asks **You already checked in at … Update your status?** **Keep** changes nothing; **Update**
      changes it, and **Earlier check-ins** lists the first one.
- [ ] The camera closes with **Close scanner**, with **Close**, after a good scan, and when you leave the screen.
- [ ] **Alerts** lists the drill as active.

Leave the drill active for section 3, or resolve it in the Command Center (**Alerts → Resolve**).

### S8. Feedback, profile and dark mode

**Steps**

1. Tap **Send feedback**, choose a rating, add a comment and tap **Send feedback**.
2. Tap **Profile**: change your department and tap **Save profile**.
3. Under **Class schedule**, tap **Download template**. In the file, keep the header row, replace the example row with
   one class (a room code from the **Rooms** sheet, days such as `MWF`, times such as `08:00`), save it and tap
   **Upload schedule**. Then upload a copy with a made-up room code.
4. Switch your phone or computer to **dark mode** (Windows: Settings → Personalization → Colors → Dark).

**Expected result**

- [ ] The feedback shows up in the Command Center **Feedback** page.
- [ ] The profile change is kept after signing out and in again.
- [ ] The uploaded class is listed under **Class schedule**; during that class, **Evacuation route** starts from its
      room by itself. The file with a made-up room is refused with **Row 2: unknown room code …** and nothing changes.
- [ ] **Remove schedule** asks first, then shows **No schedule uploaded**.
- [ ] The app switches to dark colours and stays easy to read.

---

## 3. Safety officer: the Command Center

Open http://localhost:8000/command. It is a dark control-room screen: the top bar shows **LIVE** (green) while updates
arrive instantly, the time, and the active alert. The menu on the left opens each tool.

![Command Center, Live Ops](images/command-live-ops.jpg)

![Live Ops in 3D: one floor with its room names](images/command-3d-floor.jpg)

![Live Ops in 3D: floors exploded apart](images/command-3d-exploded.jpg)

### O1. Sign in, and only officers get in

**Steps**

1. Sign in as `student@evacuai.test`.
2. Sign in as `safety_officer@evacuai.test`.

**Expected result**

- [ ] The student is refused: "Those details don't match an officer account."
- [ ] The officer opens on **Live Ops**, and the top bar shows **LIVE**.

### O2. Live Ops

**Steps**

1. Choose **Annex 1** and a floor, then the other building. Click **3D**.
2. In the bar under the 3D view: pick a floor (**3** = Third), then **All**; drag **Explode**; click **Top**, **Front**,
   **3D** and **Reset**. Click a room. Then click **2D**.
3. Keep Live Ops open while a student sends an SOS (S6) or reports a hazard (S5).

**Expected result**

- [ ] The floor plan changes with the building and floor.
- [ ] **3D** shows one building as a model with its own control bar: a floor shows its room names, **Explode** spreads the
      floors, **Top** looks straight down, and clicking a room shows a card with people inside, hazard and SOS.
- [ ] New SOS requests appear on the left and new reports on the right, within seconds.
- [ ] The counters on the right show **Safe**, **Needs help** and **Unknown** for the active alert.

### O3. Broadcast and manage alerts

![Command Center, Alerts](images/command-alerts.jpg)

**Steps**

1. Open **Alerts**. Choose **Earthquake**, **high**, leave **Drill** unticked, write a message, and click
   **Broadcast**.
2. When it asks you to confirm (there are fewer than 3 matching reports), click **Cancel**.
3. Tick **Drill** and **Broadcast** again.
4. In the list, click **Resolve** on that drill and confirm.

**Expected result**

- [ ] Without **Drill**, the Command Center asks you to confirm that you checked the incident directly; **Cancel**
      sends nothing.
- [ ] The drill goes out and the app shows its band within seconds.
- [ ] **Resolve** asks first; then the app's band disappears.

### O4. Block a path and watch the app re-route

**Steps**

1. In the app, open an evacuation route (S3) and keep it open.
2. In the Command Center, open **Paths**, choose the same building and floor, and click a path on the route (a line on
   the plan). In the panel, click **Blocked**.
3. Click the same path and set it back to **Open**.

**Expected result**

- [ ] The blocked path shows as a dark dashed line with ✕ on the plan.
- [ ] Within seconds, the app's route changes by itself to avoid it.
- [ ] After **Open**, the original route comes back.

### O5. Hazard reports and the 3-report rule

**Steps**

1. In a terminal in the project folder, run:

   ```bash
   docker compose -f docker/compose.yml exec app php artisan evacuai:simulate reports
   ```

2. Watch the app and the Command Center **Reports** and **Alerts** pages.
3. In **Reports**, click **Verify** on one report, **Dismiss** on another and **Reject as false** on a third (it asks
   first). In **Alerts**, click **Confirm** (or **Retract**) on the new alert.

**Expected result**

- [ ] Three fire reports on the same floor arrive, each with a red matching badge (**3**).
- [ ] An **UNVERIFIED** alert goes out to the app by itself.
- [ ] **Confirm** marks it verified; **Retract** removes it from the app.
- [ ] **Reject as false** counts against the student: after 3 in 30 days their reports show **Often false** and no
      longer count. **Dismiss** does not count against anyone.
- [ ] During an active alert, when three different students on that floor (**Location matches**) send different photos
      of the same hazard and the AI says yes to at least two, the reports turn **verified** by themselves
      (**Auto-verified**) and the hazard shows on the maps. The same photo sent twice shows **Same photo as #…** and
      does not count.
- [ ] **Dismiss** or **Reject as false** on one auto-verified report takes the whole group off the maps, and it does
      not verify itself again; only the rejected report counts against its student.

### O6. Who is safe: the Safety board

![Command Center, Safety](images/command-safety.jpg)

**Steps**

1. With a drill active (S7, or run `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate drill`), open
   **Safety**.
2. Click the filters **SOS**, **Unknown**, **Safe** and **Everyone**.
3. Click **Drill report (CSV)** and open the file in Excel or Google Sheets.

**Expected result**

- [ ] The counters and the list change as people check in.
- [ ] Each filter shows only those people. Someone who checked in "needs help" on an older app counts as **SOS**.
- [ ] The **Safe zones** bars show each zone's count, as **count / capacity** with **Full** when an admin has set a
      capacity (A6).
- [ ] The CSV has a summary (check-in rate, evacuation times, SOS) and one row per person.

### O7. Replay and feedback

**Steps**

1. Open **Replay**, choose the sample drill under **Alert**, and press **Play** (or drag the slider).
2. Open **Feedback**.

**Expected result**

- [ ] The 3D campus shows rooms filling and emptying and assembly points filling up as time passes (people are counted, never named).
- [ ] **Feedback** shows the average rating and the comments, including yours from S8.

---

## 4. Safety officer on the phone: Responder mode

Officers can do the urgent jobs from the app as well. Sign in to the app (http://localhost:8081, or the phone) as
`safety_officer@evacuai.test`.

![Responder home](images/app-responder.jpg)

### R1. Responder home and Student view

**Steps**

1. Sign in to the app as `safety_officer@evacuai.test`.
2. Tap **Student view**, then **Responder mode**.

**Expected result**

- [ ] The app opens on **Responder** with counts for open SOS, new reports and blocked paths.
- [ ] **Student view** shows the normal home (with a **Responder mode** button); **Responder mode** goes back.
- [ ] A student who signs in never sees the Responder screens.

### R2. SOS inbox

**Steps**

1. In a private window, sign in to the app as `student@evacuai.test` and send an SOS (S6 steps 1–3), or run
   `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate sos`.
2. In the officer's app, tap **SOS inbox**, then the request. Tap **Acknowledge**, type a **Message**, tap **Send**, then
   **Resolve** and confirm.

**Expected result**

- [ ] The request appears in the inbox within seconds, with the person and the place.
- [ ] The student sees the reply live.
- [ ] **Resolve** asks first, then closes the SOS.

### R3. Who's missing, Paths and Alerts

**Steps**

1. Start a drill (S7 step 1, or `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate drill --keep`).
2. Tap **Who's missing**.
3. Go back, tap **Paths**, pick a building and floor, and set one path to **Blocked**, then back to **Open**.
4. Go back, tap **Alerts**, and **Resolve** the drill.

**Expected result**

- [ ] **Who's missing** lists only people with an SOS, who need help, or who have not checked in, with their last place.
- [ ] Blocking a path re-routes a student's open evacuation route within seconds.
- [ ] **Resolve** ends the drill for everyone.

---

## 5. Admin: the Admin panel

The Admin panel at http://localhost:8000/admin is for **admins only**: accounts, the activity log, class schedules and
QR stickers. Emergencies are handled in the Command Center (there is a **Command Center** link in its menu).

![Admin panel, Users](images/admin-users.jpg)

### A1. Only admins get in

**Steps**

1. Open http://localhost:8000/admin and sign in as `safety_officer@evacuai.test`.
2. Sign in as `admin@evacuai.test`.

**Expected result**

- [ ] The safety officer cannot sign in to the Admin panel.
- [ ] The admin sees **Users**, **Building GPS**, **QR stickers**, **Activity log** and **Command Center**. There is
      no schedule import: students upload their own (S8).

### A2. Make someone a safety officer

**Steps**

1. Open **Users** and find the account you created in S1. Click **Edit**, set **Role** to the safety officer role, and save.
2. In the app, sign in with that account.
3. Set the role back to **student**.

**Expected result**

- [ ] The account now opens on **Responder** in the app and can sign in to the Command Center.
- [ ] As a student again, it opens on the normal home and the Command Center refuses it.

### A3. Activity log

**Steps**

1. Open **Activity log**.

**Expected result**

- [ ] It lists your sign-ins, the role changes from A2, alerts, path changes, SOS, check-ins and reports, with times.

### A4. Building GPS

**Steps**

1. Open **Building GPS**.
2. For one building, open Google Maps (Satellite), right-click each corner of its roof, click the coordinates to copy
   them, and paste one corner per line (4 lines for a rectangle). Click **Save**.
3. Type only two lines for another building, or a line like `10.3, 500`, and click **Save**.
4. Stand inside that building with a phone, with no class scheduled now, and send an SOS (S6).

**Expected result**

- [ ] **Building GPS saved** appears and the corners stay after a reload.
- [ ] Fewer than 3 corners, or a number that is not a GPS point, is refused with a message.
- [ ] The Command Center shows the SOS as **<building> · from GPS** within a few seconds.

### A5. QR stickers

**Steps**

1. Open **QR stickers**, choose a building, and print (or **Save as PDF**).
2. Optional, on a phone: scan one sticker in the app (**Evacuation route → Scan QR sticker instead**).

**Expected result**

- [ ] There is one sticker for every room, stair landing, exit and assembly point, each with its name.
- [ ] Scanning a sticker sets your location to that place.

---

## 6. Full drills, start to finish

Each drill uses both windows (and a phone if you have one). Resolve it at the end.

### A6. Safe zone capacity

**Steps**

1. In the **Admin panel**, open **Safe zones**.
2. Type **300** for **Open ground**, leave **Off-campus assembly area** blank, and click **Save**.
3. During a drill, open the app's **Check in safe** screen.

**Expected result**

- [ ] **Safe zone capacities saved** appears, and the numbers are still there after a reload.
- [ ] The app shows **Open ground · … of 300**, and **Off-campus assembly area · … here** (no limit).
- [ ] With a capacity smaller than the people checked in, the zone shows **Full**, and checking in there suggests the
      other zone.

### A7. Report rules and false reports

**Steps**

1. In the **Admin panel**, open **Report rules**. Set **Different students needed** to **4** and **Within (minutes)** to
   **15**, and click **Save**.
2. Try **1** student or **90** minutes.
3. Open **Users**. Find a student marked **Often false** (O5: reject three of their reports as false) and click
   **Clear false reports**.

**Expected result**

- [ ] **Report rules saved** appears; the numbers stay after a reload, and the Command Center's Reports page follows
      them.
- [ ] 1 student or 90 minutes is refused (2–10 students, 5–60 minutes).
- [ ] After **Clear false reports**, the **Often false** mark is gone and the student's reports count again.

### D1. Fire drill

**Steps**

1. **Command Center → Alerts:** **Fire**, **high**, tick **Drill**, message "Fire drill at the Basic Ed building. Use
   the nearest stairs to the field.", **Broadcast**.
2. **App (student):** tap **EVACUATE NOW**, **Pick my room** → Basic Education Building → Third → BE301. Read the steps.
3. **Command Center → Paths:** block the first stair on that route. Watch the app re-route.
4. **App:** send an SOS: "Twisted ankle on the stairs". **Command Center → SOS:** acknowledge it, reply, resolve it.
5. **App:** **Check in safe → I'm safe (not at an assembly point)**.
6. **Command Center → Safety:** the student is **Safe**; download the **Drill report (CSV)**.
7. **Command Center → Alerts:** **Resolve** the drill. **Paths:** set the stair back to **Open**.
8. **Command Center → Replay:** choose this drill and press **Play**.

**Expected result**

- [ ] Every step reaches the other window within seconds, without refreshing.
- [ ] The re-route avoids the blocked stair, and the CSV shows the student as safe.

### D2. A fire reported by students (no officer yet)

**Steps**

1. Run `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate reports`.
2. Watch the app (student) and the Command Center.
3. In the Command Center, **Confirm** the alert in **Alerts**, then **Resolve** it.

**Expected result**

- [ ] After three matching reports, an **UNVERIFIED** fire alert reaches the app by itself.
- [ ] The officer can confirm it (it is no longer marked unverified) and then resolve it.

### D3. A whole drill with simulated people

**Steps**

1. Open the Command Center **Live Ops** and **Safety** (in two tabs), and the app as a student.
2. Run `docker compose -f docker/compose.yml exec app php artisan evacuai:simulate drill --keep`.
3. Answer the SOS that appears (Command Center **SOS**, or the officer's app **SOS inbox**).
4. Resolve the drill in **Alerts**, then replay it in **Replay**.

**Expected result**

- [ ] Over about 90 seconds, people show up in rooms on Live Ops, move, and check in on **Safety**.
- [ ] One person needs help and sends an SOS, which you can answer and resolve.
- [ ] **Replay** shows the whole drill.

---

## 7. Results

Copy this table into your report and fill it in. Use **Pass**, **Fail** or **Skipped**, and describe any problem in
**Notes** (what you did, what you expected, what happened).

| Scenario | Result | Notes |
|---|---|---|
| S1 Create an account | | |
| S2 Sign in, sign out, forgot password | | |
| S3 Find the way out | | |
| S4 Campus map and the 3D building | | |
| S5 Report a hazard with a photo | | |
| S6 SOS and chat | | |
| S7 Alerts and check-in | | |
| S8 Feedback, profile and dark mode | | |
| O1 Command Center sign-in | | |
| O2 Live Ops | | |
| O3 Broadcast and manage alerts | | |
| O4 Block a path, app re-routes | | |
| O5 Hazard reports and the 3-report rule | | |
| O6 Safety board and drill report | | |
| O7 Replay and feedback | | |
| R1 Responder home and Student view | | |
| R2 SOS inbox | | |
| R3 Who's missing, Paths and Alerts | | |
| A1 Only admins get in | | |
| A2 Make someone a safety officer | | |
| A3 Activity log | | |
| A4 Building GPS | | |
| A5 QR stickers | | |
| A6 Safe zone capacity | | |
| A7 Report rules and false reports | | |
| D1 Fire drill | | |
| D2 Fire reported by students | | |
| D3 Drill with simulated people | | |

Device and browser used: ____________________  Date: ____________  Tester: ____________________
