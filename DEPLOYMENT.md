# GPlace Production Deployment

Deploying GPlace on Dokploy (Hetzner) behind Cloudflare, talking to a remote syr instance.

---

## Architecture

```
Browser → Cloudflare → Traefik (Dokploy) → gplace-app
                                              ↓
                                   Dokploy-managed Postgres
                                   Dokploy-managed Redis
                                   ↓ (outbound HTTPS)
                                   syr instance (e.g. app.syr.is)
```

| Container          | Port | Domain          |
| ------------------ | ---- | --------------- |
| gplace-app (SvelteKit, adapter-node) | 5173 | app.gplace.ink  |
| Postgres           | —    | Dokploy-managed |
| Redis              | —    | Dokploy-managed |

Postgres and Redis are not in the prod compose. Provision them in Dokploy and inject their connection strings via `DATABASE_URL` and `REDIS_URL`.

---

## Cloudflare Setup

### DNS Records

| Type | Name      | Content       | Proxy   |
| ---- | --------- | ------------- | ------- |
| A    | `app`     | `<server-ip>` | Proxied |

If you also want a wildcard for cookie scope across subdomains (matching syr/syren's pattern), add `A *` proxied too. Not required for gplace specifically since it doesn't run S3 on a sibling subdomain.

### SSL/TLS

- **Encryption mode**: Full (Strict)
- **Edge Certificates → Always Use HTTPS**: On
- **Minimum TLS Version**: 1.2

### Security

- **Bot Fight Mode**: OFF if you'd ever want gplace's `/api/auth/callback` to be reachable in unusual server-to-server flows. For pure browser → gplace traffic it's safe to leave on.

---

## Dokploy Setup

### 1. Provision managed services

In the Dokploy UI:

- **Create a Postgres service** — note the connection string (something like `postgres://gplace:****@gplace-db.dokploy.local:5432/gplace`).
- **Create a Redis service** — note its connection string (something like `redis://default:****@gplace-redis.dokploy.local:6379`).

Both should be on the same Docker network as the gplace-app compose project so the hostnames resolve.

### 2. Compose project

- Point at the GPlace repo
- Compose file: `prod.docker-compose.yml`
- Watch paths (for auto-redeploy on push):
  ```
  app/**
  docker/prod/**
  prod.docker-compose.yml
  ```

### 3. Domain routing

| Service     | Host             | Path | Port | HTTPS |
| ----------- | ---------------- | ---- | ---- | ----- |
| gplace-app  | app.gplace.ink   | /    | 5173 | Yes   |

---

## Environment Variables

Set these on the Dokploy compose project (or `.env`):

```env
# App identity (must match the public domain — used to build the syr OAuth callback URL)
APP_ORIGIN=https://app.gplace.ink

# Internal port the SvelteKit server listens on (Traefik proxies to this).
# Must stay 5173 unless you also change the domain routing target port.
PORT=5173

# Managed services (paste from Dokploy)
DATABASE_URL=postgres://gplace:<pw>@gplace-db.dokploy.local:5432/gplace
REDIS_URL=redis://default:<pw>@gplace-redis.dokploy.local:6379

# Active board name for the canvas. Create a board with this exact name in /settings.
PUBLIC_CURRENT_BOARD=main
```

`PROD=true` and `NODE_ENV=production` are baked into the compose, no need to set them.

---

## First Deploy — Bootstrap an Admin and Create the Board

Out of the box the database is empty: no users, no board. The canvas at `/` will 500 with `"Board hasn't been set, contact admin."` until you create the `main` board, and only admins can create boards. Steps:

1. **Push the deploy.** The container will boot, run `prisma db push --skip-generate` against the managed Postgres (creating the schema), then start serving.
2. **Sign in.** Open `https://app.gplace.ink/login`, enter your syr instance URL (e.g. `https://app.syr.is`), approve consent. You'll land on `/` with a 500 — expected.
3. **Promote yourself to ADMIN.** From a Dokploy shell into the Postgres service:
   ```bash
   psql $DATABASE_URL -c "UPDATE \"User\" SET role = 'ADMIN';"
   ```
   You're the only user, so the unconditional `UPDATE` is fine.
4. **Create the board.** Visit `https://app.gplace.ink/settings`, create a board named exactly `main` (matching `PUBLIC_CURRENT_BOARD`). Pick the dimensions you want.

Done. The canvas at `/` is now usable.

---

## Schema Changes

`prisma db push --skip-generate` runs on every container start and applies additive schema changes automatically. **Destructive** changes (column drops, type changes that need data loss) will fail the boot — you'll see the container crash-loop with a Prisma error.

To handle a destructive change:

1. Roll the change out as additive first if possible (new column, backfill, then drop later).
2. Or, from a Dokploy shell into the Postgres service, manually apply the migration with `psql $DATABASE_URL`, then redeploy.
3. Or, as a nuclear option, exec into the running gplace-app container and run `./node_modules/.bin/prisma db push --skip-generate --accept-data-loss --force-reset`. This drops everything — only do this if you're OK losing all User/Pixel data.

---

## Gotchas / Lessons Learned

### Container hardening

The gplace-app container runs:

- `read_only: true` + `tmpfs: [/tmp, /app/.prisma]`
- `security_opt: [no-new-privileges:true]`
- `cap_drop: [ALL]`
- Non-root user (`sveltekit`, uid 1001)
- Direct `./node_modules/.bin/prisma` invocation (avoids npx cache writes that would fail on read-only FS)

### Healthcheck

- Hits `/`, not `/health` (no `/health` route exists; Traefik would mark unhealthy and silently drop the container from routing).
- Accepts any status `< 500` so the redirect-to-`/login` for unauthenticated visitors counts as healthy.

### Cookies (OAuth callback)

- `gplace_pending_instance`, `gplace_oauth_state`, `gplace_post_login_redirect` use `sameSite: 'none'` + `secure: true` in production (the consent flow leaves your origin and comes back). Cloudflare Full (Strict) is required for `secure` cookies to round-trip.
- `gplace_session` uses `sameSite: 'none'` + `secure: true` in production. If you change `APP_ORIGIN` after the user logs in, their session cookie scopes break — they'll need to log in again.

### `APP_ORIGIN`

- **Must match the URL the browser uses** (i.e. the Cloudflare-fronted domain, not the internal Traefik port). The OAuth callback URL is built from this. Mismatches cause syr to reject the callback with `invalid_state` or hang at the consent screen.

### Don't use `container_name`

- Dokploy manages container naming. Setting `container_name` in compose breaks redeploys when the previous container is still being torn down.

### Profile fetches go out via Cloudflare

- gplace's server-side `getProfile` makes outbound HTTPS calls to each user's syr instance. If you have egress firewall rules on the Hetzner server, ensure HTTPS to syr instances is allowed.

### Schema regen

- gplace ships a generated `prisma/schema.prisma` from `schema.zmodel`. `zenstack generate` runs in the Docker build stage. If you edit `schema.zmodel` and forget to commit the regenerated `prisma/schema.prisma`, the build will pick up only the new zmodel and regenerate fine — but local devs may see drift if they don't run `npx zenstack generate` after pulling.

### Stuck containers

- If `docker rm` hangs after a failed deploy: `systemctl restart docker`, then `docker rm -f $(docker ps -a --filter "name=gplace" -q)`, then redeploy.
