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

## Using a real phone

The web build runs on your PC. To use the app on a phone on the same Wi-Fi, install the test APK (when available) and,
on the sign-in screen, tap **Server** and enter `http://<your-PC-LAN-IP>:8000`.

## Google sign-in (optional, instructor setup)

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Add `http://localhost:8081` to **Authorized JavaScript origins** and **Authorized redirect URIs**.
3. Put its ID and secret in `docker/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then rebuild:
   `docker compose -f docker/compose.yml up -d --build`.
4. While the consent screen is in "Testing", add each student's Google email as a test user (up to 100).

The **Continue with Google** button only appears when `GOOGLE_CLIENT_ID` is set. Google sign-in on the phone APK comes
with the APK build.

## Reset everything

```bash
docker compose -f docker/compose.yml down -v
```

This deletes the database. The next `up` starts fresh.

## Report a bug

Open a GitHub issue with the steps you took, what you expected, and what happened. Add a screenshot if you can.
