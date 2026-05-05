#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  ports)
    echo '{"web": 3100, "api": 3101, "pg": 5432}'
    ;;
  start) echo '{"started": true}';;
  stop)  echo '{"stopped": true}';;
  *) echo "usage: worktree-stack.sh {start|stop|ports}" >&2; exit 1;;
esac
