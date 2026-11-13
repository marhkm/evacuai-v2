#!/usr/bin/env bash
# EvacuAI test server: gets the code, writes the settings with new secrets, builds and starts the stack.
#   bash setup-test-server.sh 203.0.113.5     plain http on the IP (ports 8000, 8080, 8081)
#   bash setup-test-server.sh evacuai.tech    https with a domain: needs DNS for evacuai.tech and app.evacuai.tech
#                                             pointing here, and ports 80 and 443 open
# Safe to run again: secrets are only made the first time (the database keeps its first password).
set -euo pipefail
HOST="${1:?usage: setup-test-server.sh <server IP or domain>}"

command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
cd /root
[ -d evacuai-v2 ] || git clone https://github.com/marhkm/evacuai-v2.git
cd evacuai-v2
git pull --ff-only
cd docker
[ -f .env ] || cp .env.example .env

set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }

if ! grep -q '^# evacuai-test-server secrets made' .env; then
  read -rsp "Demo password for the testers (8+ letters and numbers): " DEMO; echo
  [[ "$DEMO" =~ ^[A-Za-z0-9]{8,}$ ]] || { echo "Use at least 8 letters and numbers only, then run this again."; exit 1; }
  KEY=$(openssl rand -hex 16)
  set_env DEMO_PASSWORD "$DEMO"
  set_env APP_KEY "base64:$(openssl rand -base64 32)"
  set_env REVERB_APP_KEY "$KEY"
  set_env VITE_REVERB_APP_KEY "$KEY"
  set_env REVERB_APP_SECRET "$(openssl rand -hex 16)"
  set_env DB_PASSWORD "$(openssl rand -hex 16)"
  echo "# evacuai-test-server secrets made $(date -u +%F)" >> .env
fi
set_env APP_DEBUG false

if [[ "$HOST" =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
  BASE="http://$HOST:8000"; WEB="http://$HOST:8081"
  set_env APP_URL "$BASE"
  set_env PUBLIC_API_URL "$BASE"
  set_env VITE_REVERB_PORT 8080
  set_env VITE_REVERB_SCHEME http
  set_env TRUSTED_PROXIES ""
  set_env SESSION_SECURE_COOKIE false
  set_env COMPOSE_PROFILES ai-local    # the local AI photo check (Ollama)
else
  # Let's Encrypt refuses (and soon rate-limits) a domain that does not point here: check DNS first.
  ME=$(curl -fs https://api.ipify.org || true)
  for name in "$HOST" "app.$HOST"; do
    GOT=$(getent ahostsv4 "$name" | awk 'NR==1 {print $1}' || true)
    if [ -z "$ME" ] || [ "$GOT" != "$ME" ]; then
      echo "DNS: $name points to '${GOT:-nothing}', this server is '${ME:-unknown}'."
      echo "Add an A record for $name -> $ME in the domain's DNS, wait a few minutes, then run this again."
      exit 1
    fi
  done
  BASE="https://$HOST"; WEB="https://app.$HOST"
  set_env EVACUAI_DOMAIN "$HOST"
  set_env APP_URL "$BASE"
  set_env PUBLIC_API_URL "$BASE"
  set_env VITE_REVERB_PORT 443        # live updates go through Caddy on the same address (path /app/...)
  set_env VITE_REVERB_SCHEME https
  set_env TRUSTED_PROXIES "*"         # only Caddy is in front; it sets X-Forwarded-Proto
  set_env SESSION_SECURE_COOKIE true
  set_env COMPOSE_PROFILES https,ai-local  # `docker compose up` always includes Caddy and the local AI
  set_env MAILPIT_WEBROOT /mail/          # the test inbox at https://<domain>/mail/
  set_env MAILPIT_UI_AUTH "tester:$(grep '^DEMO_PASSWORD=' .env | cut -d= -f2-)"  # login: tester + the demo password
fi
# Hazard-photo check by a local vision model: photos never leave this server.
set_env OLLAMA_URL http://ollama:11434
set_env OLLAMA_VISION_MODEL moondream
chmod 600 .env

echo "Settings:"; grep -E "^(APP_DEBUG|APP_URL|PUBLIC_API_URL|VITE_REVERB_PORT|VITE_REVERB_SCHEME|COMPOSE_PROFILES)=" .env
echo "Building and starting EvacuAI (15-25 minutes the first time)..."
docker compose up -d --build
echo "Getting the AI photo-check model (about 1.7 GB, once)..."
docker compose exec -T ollama ollama pull moondream || echo "Could not get the model now; reports still work, the AI check shows 'not available'."

echo "Waiting for the API..."
for _ in $(seq 1 60); do
  if curl -fsk "$BASE/api/health" >/dev/null 2>&1 || curl -fs http://localhost:8000/api/health >/dev/null; then
    echo "EvacuAI is up:"
    echo "  Command Center  $BASE/command"
    echo "  Admin panel     $BASE/admin"
    echo "  Web app         $WEB"
    [[ "$BASE" == https://* ]] && echo "  Test inbox      $BASE/mail/  (user: tester, password: the demo password)"
    exit 0
  fi
  sleep 10
done
echo "The API did not answer after 10 minutes. Show me: docker compose ps   and   docker compose logs app --tail 50"
exit 1
