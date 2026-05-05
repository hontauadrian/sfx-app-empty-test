---
name: env-resolution
description: How to add or change an env variable in this monorepo so the panel Envs UI surfaces it, the boilerplate's compose fallback chain still resolves correctly across worktree dev / main-branch panel preview / production, and CORS does not break. Use whenever editing .env, .env.example (root or app-scoped), docker-compose.yml environment blocks, apps/api/src/main.ts CORS, or any code that calls process.env.<NEW_VAR>.
---

# Env Variable Editing — The Rule

When adding or changing an env variable, **you MUST**:

1. **Add an entry to `.env.example` (root and/or app-scoped) with the
   key UNCOMMENTED**, even if the value is empty.

   Right: `WEB_ORIGIN=`
   Wrong: `# WEB_ORIGIN=`

   Reason: the panel `Envs` page parses `.env.example` with
   `parseDotenv` (`sfx-team-panel/src/lib/server/app-env-manager.ts`),
   which **skips lines starting with `#`**. A commented entry is
   invisible to the UI — the user cannot set it from the panel, the
   bridge cannot push it through env-requests, and the value silently
   stays at whatever compose-side fallback you wrote (or undefined).

2. **Use `${VAR:-fallback}` in `docker-compose.yml`** when a container
   reads the variable. Always the colon form (`:-`), never the bare
   form (`-`). Reason: `:-` falls back when the var is unset OR empty;
   `-` only falls back when unset, so an empty value (the panel-UI
   default after step 1) bypasses the fallback and breaks the worktree
   default.

3. **Use the per-worktree port var in the fallback** for any URL the
   container exposes. `scripts/stack-up-docker.sh:59-62` exports
   `API_PORT` (16000–16999), `NEXT_PORT` (26000–26999), `PG_PORT`
   (6000–6999), each hash-derived per worktree. Hardcoded `:3000`
   /`:3001` breaks every non-default worktree.

   Right: `${WEB_ORIGIN:-http://localhost:${NEXT_PORT:-3000}}`
   Wrong: `${WEB_ORIGIN:-http://localhost:3000}`

4. **Document the three-mode matrix** in a comment block above the
   var in `.env.example`. Mirror the existing structure for
   `NEXT_PUBLIC_API_URL` / `WEB_ORIGIN`:
   ```
   # Mode X (default):     leave unset, compose fills <fallback>
   # Mode Y (panel preview): VAR=<panel value>
   # Mode Z (production):    VAR=<prod value>
   ```

5. **Mirror to `apps/<app>/.env.example`** when an app also reads the
   var in standalone-dev mode (running `pnpm --filter ... dev` outside
   compose). Standalone-dev uses literal values; the per-app file is
   the source of truth there.

## Editing-existing-var checklist

- [ ] If the value semantic changed: update the default in
      `.env.example` and the three-mode comment block.
- [ ] If you commented it out for a "temporary" reason: don't.
      Re-uncomment with empty value before the diff lands. Panel UI
      breakage is silent.
- [ ] If you renamed it: update all of `.env.example` (root + each app
      that reads it), `docker-compose.yml` `${...:-...}` block, and
      every `process.env.<OLD>` reference in app code. Grep for the
      old name across `apps/` and `packages/`.

## Anti-patterns (forbidden)

- **Hardcoded URLs in app code.** `const API = 'http://localhost:3001'`
  breaks on every non-default worktree. Always
  `process.env.NEXT_PUBLIC_API_URL` (or whatever the var is) with a
  typed default at the call site.
- **`# VAR=` in `.env.example`.** Panel UI hidden. Use empty value.
- **`${VAR-default}`.** Empty value treated as set, fallback skipped.
  Use `${VAR:-default}`.
- **Per-app `.env` overrides that contradict the workspace `.env`.**
  Compose's service `environment` block is the merge point, not
  `apps/<app>/.env` (which is for standalone-dev only).
- **Adding a per-app var when a workspace-level var would do.**
  Workspace `.env` is shared across services and visible in the panel
  Envs page; per-app `.env` is not picked up by compose.

## Worked example: WEB_ORIGIN (the canonical case)

The CORS allowlist for the api service:

`apps/api/src/main.ts:21-25` reads it:
```ts
const webOrigin = process.env.WEB_ORIGIN;
app.enableCors({
  origin: webOrigin ? webOrigin.split(',').map((o) => o.trim()) : true,
  credentials: true,
});
```

`docker-compose.yml:90` falls back to the worktree port:
```yaml
- WEB_ORIGIN=${WEB_ORIGIN:-http://localhost:${NEXT_PORT:-3000}}
```

`.env.example` (root) — uncommented, empty, with mode matrix above:
```
# Worktree dev (default):  leave unset, fallback = http://localhost:${NEXT_PORT}
# Panel preview:            WEB_ORIGIN=http://app.localhost
# Production:               WEB_ORIGIN=https://app.example.com,https://example.com
WEB_ORIGIN=
```

`apps/api/.env.example` — uncommented, empty, for standalone-dev:
```
WEB_ORIGIN=
```

Result: panel `Envs` page shows `WEB_ORIGIN` as an empty editable
field; user sets it via UI; bridge writes `.env`; api restarts; CORS
picks up the new allowlist. Worktree workers without a `.env` value
still get `http://localhost:${NEXT_PORT}` automatically.

## Three modes the chain has to satisfy

| Mode | `.env` | What `process.env.X` resolves to |
|---|---|---|
| Worktree dev (overstory worker) | unset / empty | `${X:-http://localhost:${PORT}}` fallback |
| Main branch under panel preview | set to subdomain (e.g. `http://api.localhost`) | as set |
| Production | set to real domain (e.g. `https://api.example.com`) | as set |

Your edit must keep all three working. If you can only get one mode
green, the var is wrong. Re-read steps 1–5.

## Debugging an env var that "isn't taking effect"

1. **Panel UI doesn't show the field.** → `.env.example` entry is
   commented or missing. Fix step 1.
2. **Field is set in UI but container still sees default.** → bridge
   may not have restarted the service. `pnpm stack:debug` to verify
   bridge is alive; re-save in panel UI; or
   `docker compose -p app-$(basename $PWD) restart api`.
3. **`process.env.X` is undefined inside container.** → `docker compose
   -p app-$(basename $PWD) exec api env | grep X` to confirm. If
   missing, the `environment:` block in `docker-compose.yml` doesn't
   pass it through. Add the line.
4. **`NEXT_PUBLIC_*` change not visible in browser.** → Next.js bakes
   `NEXT_PUBLIC_*` into the bundle at build/dev-server start. HMR does
   not pick up env-var changes. Restart web:
   `docker compose -p app-$(basename $PWD) restart web`.
5. **CORS still rejecting after `WEB_ORIGIN` set.** → browser `Origin`
   header must match an entry exactly (scheme + host + port). Check
   devtools network tab. Csv entries are trimmed but case-sensitive.

## Reference points

- `.env.example` (root) — three-mode matrix doc + worked example
- `apps/api/.env.example` / `apps/web/.env.example` — standalone-dev
- `docker-compose.yml:63` — `NEXT_PUBLIC_API_URL` fallback
- `docker-compose.yml:90` — `WEB_ORIGIN` fallback
- `apps/api/src/main.ts:21-25` — CORS reads `WEB_ORIGIN`
- `scripts/stack-up-docker.sh:59-62` — port var exports
- `sfx-team-panel/src/lib/server/app-env-manager.ts:160` —
  `parseDotenv` (the function that skips `#` lines)
