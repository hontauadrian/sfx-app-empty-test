#!/usr/bin/env bash
# Mirror probes from builder profile to lead/merger/reviewer/scout.
# Plan: runtime-verification-plan/impl/02-impl.md §11.
#
# TODO(smell): this script papers over a duplication problem. The probe
# code lives in 5 sibling profile directories
# (.overstory/claude-profiles/{builder,lead,merger,reviewer,scout}/hooks/probes/),
# all kept identical via rsync. Edit one → re-sync the other four.
# Long-term fix: extract the canonical location into sfx-overstory and
# have profiles symlink/reference instead of carrying a full copy. Until
# that refactor lands, run this script after every edit to the builder
# probe to keep the mirrors aligned.
set -euo pipefail

SRC=.overstory/claude-profiles/builder/hooks/probes
if [[ ! -d "$SRC" ]]; then
  echo "error: missing source $SRC (run from repo root)" >&2
  exit 1
fi

for dst in lead merger reviewer scout; do
  DST=".overstory/claude-profiles/$dst/hooks/probes"
  mkdir -p "$DST"
  rsync -a --delete "$SRC/" "$DST/"
done

echo "synced probes to lead/merger/reviewer/scout"
