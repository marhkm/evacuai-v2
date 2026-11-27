# Testers' Round 3 Implementation Plan

> Executed natively (items 1, 2 and 5) plus two background agents (items 4 and 6). Ledger:
> `.superpowers/sdd/2026-11-27-testers-round3/progress.md`.

**Spec:** `docs/superpowers/specs/2026-11-27-testers-round3-design.md`

## Global Constraints

- **Test-first:** every change has a test seen failing first.
- **Pest:** runs with Herd PHP against a throwaway Postgres on port 5433 (`$env:DB_PORT='5433'`). Each agent uses its
  own database name so runs don't clash.
- **Commits:** none, and no AI attribution. The user asks to commit and push.
- **Copy:** plain English. Button labels exactly as in the spec.
- **Docs:** only the lead updates `docs/WALKTHROUGH.md` and the HTML guides, at the end, so agents don't conflict.

## Tasks

1. **Item 2, check at submission:**
   - Server: `ReportPhotoCheck::run()` is shared by the job and the controller.
   - The controller handles match (UNVERIFIED alert), no_match (422 `photo_rejected` / `send_anyway`) and timeout
     (pending).
   - App: "Checking photo…", with **Retake** and **Send anyway**.
   - `evacuai:evaluate-photos` gives the F1 table.
2. **Item 1, flood:**
   - Reports name an outdoor area (safe zone node).
   - Verified flood places become `hazardNodeIds` in the snapshot, and `findRoute` avoids them.
   - Floods skip the AI check.
   - The app reports outdoor areas, and the route screen explains the destination.
3. **Item 5, SOS notifications:**
   - Per-officer seen-message ids, "New · n" in the Command Center and Responder.
   - Push to the student on an officer reply, and an in-app banner.
   - Nothing after Resolve.
4. **Item 4, 3D labels (agent):** zoom-gated, floor-scoped, short codes, landmarks always shown, overlap culling.
5. **Item 6, earthquake broadcast (agent):** one-minute poll; strong nearby quakes broadcast; latency log command;
   `FEEDS_ENABLED=true` on the test server.
6. **Docs, full verification and final review.**
