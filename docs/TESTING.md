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

## Reset everything

```bash
docker compose -f docker/compose.yml down -v
```

This deletes the database. The next `up` starts fresh.

## Report a bug

Open a GitHub issue with the steps you took, what you expected, and what happened. Add a screenshot if you can.
