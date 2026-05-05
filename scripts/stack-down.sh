#!/usr/bin/env bash
# Counterpart to stack-up.sh — tear down whatever stack-up.sh booted.
# Env-aware: inside the SFX panel container (Docker-out-of-Docker), delegate
# to stack-down-docker.sh which mirrors stack-up-docker.sh's per-worktree
# compose project naming. On host shells, fall back to worktree-stack.sh stop
# which kills the local pg_ctl + node processes.
#
# Used by overstory's worktrees.preTeardown hook (.overstory/config.yaml) so
# `ov worktree clean` and `ov clean --agent` always reclaim the per-worktree
# stack before the worktree directory is removed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [ -f "/.dockerenv" ] || [ "${SFX_PLATFORM:-}" = "1" ]; then
  exec bash "$SCRIPT_DIR/stack-down-docker.sh" "$@"
fi

exec bash "$SCRIPT_DIR/worktree-stack.sh" stop "$@"
