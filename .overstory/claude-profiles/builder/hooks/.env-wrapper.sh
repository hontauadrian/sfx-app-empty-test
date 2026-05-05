#!/usr/bin/env sh
# Plan 06 Layer E — env-wrapper.sh
#
# Strips orchestration env vars before exec'ing a child. Hooks that spawn
# subprocesses (pnpm test, playwright, http-smoke, etc.) invoke through this
# wrapper so the child cannot see OVERSTORY_*/HOOK_*/PROBE_* context.
#
# Never to be exposed to the agent (path is deny-listed via the leading-dot
# glob in Layer A settings).
unset OVERSTORY_TASK_ID OVERSTORY_AGENT_NAME OVERSTORY_WORKTREE_PATH 2>/dev/null
# shellcheck disable=SC2046
unset $(env | awk -F= '/^OVERSTORY_|^HOOK_|^PROBE_|^ML_/{print $1}') 2>/dev/null
exec "$@"
