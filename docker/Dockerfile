# One PHP image for every backend role: app (FrankenPHP), reverb, queue, scheduler.
# Build context: repository root (docker compose -f docker/compose.yml build).
FROM dunglas/frankenphp:1-php8.5 AS base
RUN install-php-extensions pdo_pgsql intl zip bcmath pcntl gd exif opcache
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app

# The Command Center (React, command/) for officers at /command. Not committed; built here so `docker compose up` has it.
FROM node:26-alpine AS command
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY command/ command/
# npm needs every workspace's manifest to read the lockfile; only command's dependencies are installed.
COPY mobile/package.json mobile/
RUN npm ci -w command --no-audit --no-fund && npm run build -w command

FROM base AS app
COPY api/composer.json api/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction
COPY api/ ./
COPY --from=command /repo/api/public/command public/command
COPY campus-data/ /campus-data/
RUN composer dump-autoload --optimize --no-dev \
 && php artisan package:discover \
 && php artisan filament:assets \
 && chown -R www-data:www-data storage bootstrap/cache
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
# Strip CRs in case the script was checked out with Windows line endings.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint && chmod +x /usr/local/bin/entrypoint
ENV CAMPUS_DATA_PATH=/campus-data
EXPOSE 8000
ENTRYPOINT ["entrypoint"]
CMD ["frankenphp", "php-server", "--root", "public/", "--listen", ":8000"]
