# HTTP Smoke Probe

Runtime-verification gate. Boots the real dev stack, hits every matrix entry,
executes generated runtime-contract flows, and fails closed on any contract
violation. Consumed by every profile's Stop hook.

## Flow

1. Read `.claude/hooks/.matrix.json` (emitted by plan 02 `derive-test-matrix`).
2. Merge `.runtime-contract.overlay.json` + `runtime-contract.compiled.json`
   (plan 05) — Priority 0 when present.
3. Boot the stack via the matrix's `bootPlan.driver`, or reuse a healthy
   already-running stack (`.stack.json` guest mode).
4. Bootstrap a smoke user via `authDetection.registerSurface` / `loginSurface`.
5. Exercise every page + API endpoint + generated flow. Emit a structured
   report under `.claude/hooks/.http-smoke.json` and a human-readable copy
   under `.claude/hook-reports/http-smoke-<ts>.md`.
6. Tear down the stack (owner mode only) unless `HTTP_SMOKE_KEEP_STACK=1`.

## Overlay

The overlay (`.runtime-contract.overlay.json`) provides non-code hints only:

- **`routes`** — token expectations and success status overrides for pages.
- **`endpoints`** — sample payloads and success status overrides for API endpoints.
- **`ignore`** — framework-internals-only paths (e.g. `/_next/**`, `/api/health`).
  Ignore entries must NOT cover matrix paths; they exist solely for paths that
  the framework emits but that have no contract (build artifacts, health checks).
- **`global.mustNotContain`** — strings that must not appear on any page.

### Flows are generated

Flows are **not** declared in the overlay. They are generated automatically from
code annotations (Zod schemas, `@UseGuards`, `@ApiResponse`, Next.js `metadata`,
middleware matchers) and written to `.claude/hooks/.flows.generated.json` by the
flows-generator. The overlay schema actively rejects a `flows` key — if present,
`validateOverlay` emits `OVERLAY_FLOWS_RETIRED`.

To influence what flows are generated, change code annotations — not the overlay.

## Invocation

```bash
pnpm exec tsx .overstory/claude-profiles/builder/hooks/probes/http-smoke.ts \
  --matrix .claude/hooks/.matrix.json \
  --report .claude/hooks/.http-smoke.json
```

Flags:
- `--full` — full-scope sweep (merger post-merge).
- `--read-only` — skip mutating happy-paths (reviewer).
- `--strict` — unknown routes block (lead).
- `--only pages|api|auth|forms|flows|all` — narrow focus.
- `--keep-stack` — leave the dev stack running after the probe exits.
- `--no-reuse` — force a fresh boot even when `.stack.json` is present.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | all cases passed |
| 1 | app-under-test failure(s) |
| 2 | boot or probe-internal failure |
| 3 | matrix invalid |
| 4 | config error (missing required file, unreadable overlay) |

## Block codes

Canonical short form: `<FAIL_CODE>:<subject>:<detail>`.

| Code | Description |
|---|---|
| `STACK_BOOT_FAILED` | stack did not come up, or `.stack.json` missing after start |
| `STACK_UNHEALTHY` | driver returned 0 but health probes failed |
| `STACK_PORT_CONFLICT` | expected ports not bound |
| `PAGE_ERROR_OVERLAY` | HTML contained a runtime error marker |
| `PAGE_MISSING_TOKEN` | 200 but none of the expected tokens rendered |
| `PAGE_UNEXPECTED_REDIRECT` | guard:public route redirected |
| `PAGE_UNEXPECTED_STATUS` | status differed from contract |
| `AUTH_CONTRACT_VIOLATION` | guard:authenticated route returned 200 unauth |
| `AUTH_PERSISTENCE` | session did not survive refresh simulation |
| `AUTH_BOOTSTRAP_INCONSISTENT` | register succeeded but login failed |
| `AUTH_UNBOOTSTRAPPABLE` | no register/login surface discoverable |
| `API_500_RESPONSE` | any endpoint returned 500 (never allowed) |
| `API_BAD_INPUT_NOT_4XX` | empty-body POST returned non-4xx |
| `API_AUTH_BOUNDARY_LEAK` | authed endpoint returned 200 without auth header |
| `API_UNEXPECTED_STATUS` | status differed from manifest-declared success |
| `API_DUPLICATE_CONFLICT_NOT_4XX` | duplicate register returned non-4xx |
| `FLOW_STEP_FAILED` | generated flow step did not satisfy its expect |
| `UNKNOWN_ROUTE` | matrix route returned 404 |
| `SLOW_ENDPOINT` | any HTTP call > 10s |
| `UNRESOLVABLE_PARAM` | route param had no seeded value |
| `PROBE_INTERNAL_ERROR` | probe bug (non-deterministic) |

## Opacity (plan 06)

- Human-readable failure details land in `.claude/hook-reports/http-smoke-<ts>.md`.
- Inline shell output stays minimal — just summary and block reason.
- Stack logs are teed to `.claude/hooks/.smoke-logs/` with 7-day rotation.

## Do-not-do

- Do NOT retry failing probes.
- Do NOT downgrade 500 to warning.
- Do NOT duplicate `worktree-stack.sh` logic — the driver is authoritative.
- Do NOT hardcode ports, service names, or host URLs.
- Do NOT skip the probe on "trivial" changes; an empty matrix is the only skip.
- Do NOT ship http-smoke to builder alone — every profile needs the gate.
