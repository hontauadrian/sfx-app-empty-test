#!/usr/bin/env bash
# Registers the custom merge driver referenced in .gitattributes and points
# git at the versioned hooks directory so the post-merge reconcile runs.
#
# Run automatically via the root `prepare` script on `pnpm install`.

set -euo pipefail

# Only run inside a git repo (skip on shallow CI without .git, tarball installs, etc.)
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

# `true` exits 0 without touching the working-tree file, so git keeps the
# current branch's version of the conflicted file (i.e. main on merge-in).
git config merge.ours.driver true

# Point git at the versioned hooks directory so every clone gets the same
# post-merge reconcile behavior. Relative paths are resolved from the repo
# root, so this works for worktrees too.
git config core.hooksPath scripts/git-hooks

echo "[setup-git-merge-drivers] registered merge.ours.driver + core.hooksPath"
