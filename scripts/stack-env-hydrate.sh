#!/usr/bin/env bash
# Copy panel-managed env files from the canonical project root into a fresh
# worktree so `pnpm stack:up` (and any per-app boot script) finds the values
# it needs without the agent having to author .env files turn-by-turn.
#
# Wired as overstory's worktrees.postCreate hook in .overstory/config.yaml.
# Overstory injects:
#   OVERSTORY_PROJECT_ROOT   — canonical repo root (panel writes env files here)
#   OVERSTORY_WORKTREE_PATH  — destination worktree (cwd when this runs)
#
# Source of truth for which files to copy is `panel.config.json` `env.files[].path`,
# so the panel and the worktree hydration stay in sync automatically — adding
# a new env file in panel.config.json picks it up here without a script edit.
#
# When invoked outside an overstory hook (manual debugging) the script falls
# back to assuming cwd is the worktree and the parent of the worktree's
# git common dir is the project root.

set -euo pipefail

PROJECT_ROOT="${OVERSTORY_PROJECT_ROOT:-}"
WORKTREE_PATH="${OVERSTORY_WORKTREE_PATH:-$PWD}"

if [ -z "$PROJECT_ROOT" ]; then
  if git -C "$WORKTREE_PATH" rev-parse --git-common-dir >/dev/null 2>&1; then
    common_dir="$(git -C "$WORKTREE_PATH" rev-parse --git-common-dir)"
    case "$common_dir" in
      /*) PROJECT_ROOT="$(cd "$(dirname "$common_dir")" && pwd)" ;;
      *)  PROJECT_ROOT="$(cd "$WORKTREE_PATH/$(dirname "$common_dir")" && pwd)" ;;
    esac
  else
    PROJECT_ROOT="$(cd "$WORKTREE_PATH/.." && pwd)"
  fi
fi

PANEL_CONFIG="$PROJECT_ROOT/panel.config.json"
ENV_FILES=()
if [ -f "$PANEL_CONFIG" ]; then
  # Parse panel.config.json env.files[].path with node (always available
  # inside the panel container; on host shells assume node is on PATH).
  while IFS= read -r path; do
    [ -n "$path" ] && ENV_FILES+=("$path")
  done < <(node -e '
    const cfg = require(process.argv[1]);
    const files = (cfg.env && cfg.env.files) || [];
    for (const entry of files) {
      const p = typeof entry === "string" ? entry : entry && entry.path;
      if (typeof p === "string" && p.length > 0) console.log(p);
    }
  ' "$PANEL_CONFIG" 2>/dev/null)
fi

# Hard-coded fallback if panel.config.json is missing or unreadable, so a
# fresh worktree still gets the canonical SFX webapp set.
if [ ${#ENV_FILES[@]} -eq 0 ]; then
  ENV_FILES=(
    ".env"
    "apps/api/.env"
    "apps/web/.env.local"
  )
fi

copied=0
skipped=0
for rel in "${ENV_FILES[@]}"; do
  src="$PROJECT_ROOT/$rel"
  dst="$WORKTREE_PATH/$rel"
  if [ ! -f "$src" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  mkdir -p "$(dirname "$dst")"
  cp -p "$src" "$dst"
  copied=$((copied + 1))
done

echo "[stack-env-hydrate] copied=$copied skipped=$skipped from=$PROJECT_ROOT to=$WORKTREE_PATH"
