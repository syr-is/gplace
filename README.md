# GPlace

A collaborative pixel canvas (r/place clone) that authenticates federated identities through a [syr](https://github.com/syr-is/syr) instance via the platform-delegation flow. SvelteKit + Prisma + Postgres + Redis, all in Docker.

User profile data (display name, avatar, banner, web profile) is **not** mirrored locally — it's fetched live from each user's home syr instance, cached in Redis with on-demand `public_hash` polling.

## How to run

Assumes a syr instance is already up and reachable from your machine (default `http://localhost:5173`).

### 1. Configure

```bash
cp .env.example .env
```

Defaults coexist with syr (5173) and syren (5174–5175):

| Var            | Default                  | Notes                                                         |
| -------------- | ------------------------ | ------------------------------------------------------------- |
| `DEV_PORT`     | `5176`                   | Vite dev server (host port)                                   |
| `STUDIO_PORT`  | `5556`                   | Prisma Studio (host port)                                     |
| `DB_PORT`      | `5476`                   | Postgres (host port)                                          |
| `REDIS_PORT`   | `6479`                   | Redis (host port)                                             |
| `APP_ORIGIN`   | `http://localhost:5176`  | Your gplace public origin — used to build the syr callback URL. **Must match** `DEV_PORT`. |
| `PUBLIC_CURRENT_BOARD` | `main`           | Board name the canvas renders. You'll create this in step 4.  |

If you change `DEV_PORT`, update `APP_ORIGIN` to match.

### 2. (First time only) Wipe any old DB volume

If you ran a previous version of gplace, the schema is incompatible — the User table dropped its `username/avatar/banner` columns. Easiest path:

```bash
docker compose down -v       # stops + removes anonymous volumes
rm -rf ./db ./redis          # bind-mounted volumes; drop them too
```

Skip this on a fresh checkout.

### 3. Bring it up

```bash
docker compose up -d
```

The dev container auto-runs `yarn install`, `zenstack generate`, `prisma db push`, `prisma generate`, then `vite dev`. First boot takes ~1 min while deps install.

Tail logs:

```bash
docker compose logs -f gplace-app
```

When you see `Local: http://localhost:5173/`, the app is live at **http://localhost:`$DEV_PORT`** (default `http://localhost:5176`).

### 4. (First time only) Sign up + bootstrap the first admin + create the board

Out of the box, gplace has no users and no board. The canvas at `/` will 500 (`"Board hasn't been set, contact admin."`) until you create the `main` board, and only admins can create boards.

1. Open `http://localhost:5176/login` and sign in with your syr instance URL (e.g. `http://localhost:5173`).
2. After consent, you'll land on `/`. The 500 page is expected.
3. Promote yourself to ADMIN by hand (one-time):

   ```bash
   docker exec -it gplace-db psql -U postgres -c "UPDATE \"User\" SET role = 'ADMIN';"
   ```

   (You're the only user, so the unconditional `UPDATE` is fine.)

4. Visit `http://localhost:5176/settings`, create a board named exactly **`main`** (matching `PUBLIC_CURRENT_BOARD`). Pick the dimensions you want (16+ in each direction). The board will be filled with the background color and is ready to paint.

### 5. Day-to-day

```bash
docker compose up -d         # start
docker compose logs -f       # follow logs
docker compose down          # stop
```

Schema changes (`app/schema.zmodel`) re-apply on container restart via `prisma db push`.

## Port reference

| Service             | Host port (default) | Container port |
| ------------------- | ------------------- | -------------- |
| gplace web (vite)   | 5176                | 5173           |
| Prisma Studio       | 5556                | 5555           |
| Postgres            | 5476                | 5432           |
| Redis               | 6479                | 6379           |

All host ports are env-overridable. Container-to-container comms always use the internal port + the `gplace-*` service hostname.

## Production deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the Dokploy + Cloudflare setup (managed Postgres/Redis, domain routing, env vars, first-deploy admin bootstrap).

## Troubleshooting

- **`prisma db push` fails on boot** with column-drop errors → step 2 (wipe the volume).
- **`/login` says "Could not reach this instance"** → syr isn't reachable at the URL you entered, or doesn't expose `/.well-known/syr`.
- **Callback redirects to `/login?error=invalid_state`** → check that `APP_ORIGIN` matches the URL you opened gplace at; mismatched origins drop the temp cookies.
- **Avatars / display names show truncated DIDs** → the syr instance is unreachable from gplace's container. Check `docker compose logs gplace-app` for fetch errors.
- **Profile changes on syr aren't showing up** → there's a 30 s `public_hash` recheck window per DID; refresh after that.
