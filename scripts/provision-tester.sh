#!/usr/bin/env bash
# Owner-only. Supply intended numeric Twitch ID on stdin; never put it in shell arguments/history.
set +x
set -euo pipefail
exec python3 scripts/provision-tester-runtime.py "$@"
