#!/usr/bin/env bash
# Runs the contract probe; if the loader emits any diagnostic listed in
# scripts/flow-diagnostic-remediations.json (path-boundary issues the
# builder cannot self-resolve), auto-mails the lead with `--type
# flow_mismatch` and blocks future probe runs until the lead replies.
#
# Data flow:
#   1. Run probe via `node + @swc-node/register`, capture exit + stderr.
#   2. Parse `.claude/hooks/.http-smoke.json -> loaderDiagnostics[]` (the
#      probe's TS code writes this field — see probes/smoke-report.ts).
#   3. For each diagnostic whose `code` has an entry in
#      flow-diagnostic-remediations.json, render the entry into a mail body
#      and `ov mail send --type flow_mismatch` to $OVERSTORY_PARENT_AGENT.
#   4. Dedupe per (agent, sha256-of-diagnostic-codes) so a probe loop never
#      spams the lead.
#
# Why structured JSON instead of grepping stdout:
#   - The probe's loader emits each error with a stable `code` string.
#     Stdout text format can change; JSON shape is the contract.
#   - New diagnostic codes need only an entry added to
#     flow-diagnostic-remediations.json — no shell edit required.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$PROJECT_DIR"

# Source `.env.runtime` so dynamic OAuth/port values that
# `scripts/probe-bootstrap.sh` writes survive into THIS subshell — pnpm
# chains its scripts through `&&` (probe-bootstrap.sh && pnpm openapi:check
# && this script), and each segment runs in its own bash process. The
# bootstrap step's `export`s die at the first `&&`. Without sourcing
# `.env.runtime` here, `${env:OAUTH_ISSUER_URL}` placeholders in
# `.overstory/runtime-contract.flows/_shared.json` resolve to empty strings,
# the bearer-in-body login URL collapses to `/protocol/openid-connect/token`
# (a relative path), and every authenticated actor fails to bootstrap with
# `[contract-flows-bootstrap-FAIL] reason='login network error: fetch failed'`.
# This is the architectural counterpart to `probe-bootstrap.sh`'s own
# `. "$runtime_env_file"` after the heredoc finishes — but for the next
# pipeline segment, not the current one.
if [ -f .env.runtime ]; then
  set -a
  # shellcheck disable=SC1091
  . .env.runtime
  set +a
fi

PROFILE="${PROBE_PROFILE:-builder}"
ENTRY=".overstory/claude-profiles/${PROFILE}/hooks/probes/index.ts"
MATRIX=".claude/hooks/.matrix.json"
REPORT=".claude/hooks/.http-smoke.json"
HUMAN_REPORT=".claude/hooks/.http-smoke.md"
REMEDIATIONS="scripts/flow-diagnostic-remediations.json"

set +e
TS_NODE_PROJECT=apps/api/tsconfig.json node -r @swc-node/register -r reflect-metadata "$ENTRY" \
  --matrix "$MATRIX" \
  --report "$REPORT" \
  --human-report "$HUMAN_REPORT" \
  "$@"
probe_exit=$?
set -e

agent_name="${OVERSTORY_AGENT_NAME:-}"
parent_agent="${OVERSTORY_PARENT_AGENT:-}"
if [ -z "$agent_name" ] || [ -z "$parent_agent" ]; then
  exit "$probe_exit"
fi
if [ ! -f "$REPORT" ]; then
  exit "$probe_exit"
fi
if [ ! -f "$REMEDIATIONS" ]; then
  printf '[flow-ownership] %s missing — cannot auto-route lead mail.\n' "$REMEDIATIONS" >&2
  exit "$probe_exit"
fi

# Parse loaderDiagnostics + render mail body via inline python (jq isn't
# guaranteed in every worktree, python3 is).
mail_payload="$(python3 - "$REPORT" "$REMEDIATIONS" <<'PYEOF'
import json, sys, hashlib
report_path, remed_path = sys.argv[1], sys.argv[2]
try:
    report = json.load(open(report_path))
except Exception as exc:
    print(json.dumps({"error": f"report unreadable: {exc}"}))
    sys.exit(0)
remed = json.load(open(remed_path))
# Combine loader diagnostics (path-boundary, lead-fix) AND generator
# diagnostics (missing controller decorators, code-layer fix). Both classes
# share the same remediation lookup table — each entry decides which agent
# owns the fix via its own text.
loader_diags = report.get("loaderDiagnostics") or []
gen_diags = report.get("generatorDiagnostics") or []
all_diags = [{**d, "_source": "loader"} for d in loader_diags] + \
            [{**d, "_source": "generator"} for d in gen_diags]
matched = [d for d in all_diags if d.get("code") in remed]
if not matched:
    print(json.dumps({"matched": []}))
    sys.exit(0)
lines = ["Probe emitted diagnostics that block close-gate. Some require lead edits to `.overstory/runtime-contract.flows/` (hook-protected); others require code edits in the controller layer (builder-owned). The remediation block under each code states which.", ""]
for d in matched:
    code = d["code"]
    src = d.get("_source","?")
    file = d.get("file", d.get("endpoint", "(no file)"))
    msg = d.get("message", "")
    lines.append(f"### {code}  (source: {src})")
    lines.append(f"target: {file}")
    if msg:
        lines.append(f"detail: {msg}")
    lines.append("")
    lines.append("REMEDIATION:")
    lines.append(remed[code])
    lines.append("")
lines.append("After applying the fix, reply with flow_update (lead) or worker_done (builder). The runner is BLOCKED on probe re-run until the diagnostic clears.")
body = "\n".join(lines)
codes_hash = hashlib.sha256("|".join(sorted(d["code"] + ":" + str(d.get("file", d.get("endpoint",""))) for d in matched)).encode()).hexdigest()
print(json.dumps({"body": body, "hash": codes_hash, "codes": [d["code"] for d in matched]}))
PYEOF
)"

# Extract fields
mail_body="$(printf '%s' "$mail_payload" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('body',''))")"
diag_hash="$(printf '%s' "$mail_payload" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('hash',''))")"
diag_codes="$(printf '%s' "$mail_payload" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(','.join(d.get('codes',[])))")"

if [ -z "$diag_hash" ] || [ -z "$mail_body" ]; then
  exit "$probe_exit"
fi

state_dir="${TMPDIR:-/tmp}/overstory-flow-ownership"
mkdir -p "$state_dir"
state_file="$state_dir/${agent_name}.notified"

if [ -f "$state_file" ] && grep -qE "^${diag_hash} " "$state_file"; then
  prior_msg="$(awk -v h="$diag_hash" '$1==h { print $2; exit }' "$state_file")"
  printf '[flow-ownership] BLOCKED until lead %s processes %s — DO NOT re-run probe. Diagnostics: %s. Same diagnostic already mailed.\n' "$parent_agent" "${prior_msg:-the prior flow_mismatch mail}" "$diag_codes" >&2
  exit "$probe_exit"
fi

if ! command -v ov >/dev/null 2>&1; then
  printf '[flow-ownership] ov CLI not on PATH — cannot auto-mail lead. Diagnostics: %s\n' "$diag_codes" >&2
  exit "$probe_exit"
fi

mail_output="$(ov mail send \
  --to "$parent_agent" \
  --from "$agent_name" \
  --type flow_mismatch \
  --priority high \
  --subject "Probe diagnostics block close-gate — needs lead or builder fix (see body)" \
  --body "$mail_body" 2>&1)" || {
    printf '%s\n' "$mail_output" >&2
    printf '[flow-ownership] ov mail send failed — state not marked; next probe run retries.\n' >&2
    exit "$probe_exit"
  }
printf '%s\n' "$mail_output" >&2
msg_id="$(printf '%s' "$mail_output" | grep -oE 'msg-[a-z0-9]+' | head -1)"
printf '%s %s\n' "$diag_hash" "${msg_id:-unknown}" >> "$state_file"
printf '[flow-ownership] BLOCKED until lead %s processes %s — DO NOT re-run probe. Diagnostics: %s. Wait for flow_update reply.\n' "$parent_agent" "${msg_id:-the flow_mismatch mail}" "$diag_codes" >&2

exit "$probe_exit"
