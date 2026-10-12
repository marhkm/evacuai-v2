#!/bin/sh
set -e
php artisan optimize >/dev/null
# Only the web role touches the schema, so the other roles never race it.
if [ "$1" = "frankenphp" ]; then
  php artisan migrate --force
  php artisan db:seed --class=CampusSeeder --force # idempotent; keeps live edge status
  if [ "$SEED_DEMO" = "true" ]; then php artisan db:seed --class=DemoSeeder --force; fi
fi
exec "$@"
