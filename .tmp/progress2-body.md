Two more fixes since the last update:

- commit a270f9a: drop SSR-noop branch in `active-brand-store.ts` (added `'use client'` directive and let `createJSONStorage(() => localStorage)` run unconditionally — same shape as the existing `app-store.ts`). Pushes web coverage from 89.77% functions to 95.18%, clearing the global 90% threshold.
- commit 5adf513: moved the api integration suite to `apps/api/src/modules/brand-profile/__integration__/` and added an MSW-backed web integration test at `apps/web/src/features/brand-profile/__integration__/brands-dashboard.integration-test.tsx`. Both run green via `pnpm test:integration`.

Current state (commit a270f9a):
- `pnpm typecheck`: green
- `pnpm lint`: green
- `pnpm test`: 152 web + 58 api pass
- `pnpm test:coverage`: green (web all-files 91.43% lines, 95.18% functions; api 100%)
- `pnpm test:integration`: api 4/4, web 2/2

Still blocked on the probe contract-coverage gap (auth/me 200 + brands 200). Same root cause as documented in msg-rgbbtkwp5sic: probe's contract-coverage tracker does not credit curated `special_flows` (the 20 lead-authored flows for this task run+pass on every probe run), and the API has no in-tree credential surface so the auto endpoint-happy chain cannot be generated. The auth/me half is pre-existing on master.

Still standing by. Will not retry worker_done until the coverage gap is resolved.
