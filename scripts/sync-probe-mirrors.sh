#!/usr/bin/env bash
# Mirror derive-test-matrix probe from builder profile to lead/merger/reviewer.
# Plan: runtime-verification-plan/impl/02-impl.md §11.
# Run after every edit to the builder probe until upstream extracts the
# canonical location into sfx-overstory.
set -euo pipefail

SRC=.overstory/claude-profiles/builder/hooks/probes
if [[ ! -d "$SRC" ]]; then
  echo "error: missing source $SRC (run from repo root)" >&2
  exit 1
fi

for dst in lead merger reviewer; do
  DST=".overstory/claude-profiles/$dst/hooks/probes"
  mkdir -p "$DST"
  rsync -a --delete "$SRC/" "$DST/"
done

echo "synced probes to lead/merger/reviewer"
