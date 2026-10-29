#!/usr/bin/env bash
set -euo pipefail
atlas_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v python3 >/dev/null || { echo '需要 Python 3.10 以上版本。' >&2; exit 1; }
exec python3 "$atlas_root/scripts/launch.py" "$@"
