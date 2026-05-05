# Plan 03 — Stop-hook correlator fixture suite

Run:

```bash
node .overstory/claude-profiles/builder/hooks/__tests__/run-fixtures.js
```

The runner spawns the real Stop hook (`e2e-test-on-stop.js`) with
`HOOK_TEST_PROJECT_ROOT` pointed at a throwaway tmp dir, seeds the
evidence log / matrix / session-files / overlay from each fixture's
`.jsonl`/`.json` inputs, then asserts the hook's stdout+exit match the
fixture's `.expected.json`.

Each fixture consists of up to four files:

| suffix | required | purpose |
|--------|----------|---------|
| `.session.jsonl` | yes | lines of MCP evidence records to pre-seed |
| `.matrix.json` | yes | plan-02 matrix.json |
| `.sessionfiles.json` | yes | `{ files: [...] }` list of edited files |
| `.overlay.json` | no | plan-05 overlay when the scenario needs contract data |
| `.expected.json` | yes | assertion: `{exitCode:0,stdoutEmpty:true}` or `{decision:"block",reasonContains:[...]}` |

Fixtures are intentionally synthetic and self-contained — no external
services, no real MCP server. The harness skips `ensurePlaywrightReady()`
via `HOOK_SKIP_PLAYWRIGHT_SETUP=1` so runs finish in well under 3s.

Keep the builder and merger fixture trees byte-identical:

```bash
diff -r .overstory/claude-profiles/builder/hooks/__tests__ \
        .overstory/claude-profiles/merger/hooks/__tests__
# must be empty
```
