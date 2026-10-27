#!/usr/bin/env bash
set -euo pipefail
atlas_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v tailscale >/dev/null || { echo '請先在這台 Linux 主機安裝並登入 Tailscale。'; exit 1; }
command -v python3 >/dev/null || { echo '需要 Python 3 檢查目前的 Tailscale 狀態。'; exit 1; }
tailscale status --json | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("BackendState")=="Running" else "Tailscale 尚未連線，請先在主機完成登入。")'
tailscale serve status --json | python3 -c 'import sys,json; d=json.load(sys.stdin) or {}; used="8443" in (d.get("TCP") or {}) or any(k.endswith(":8443") for k in (d.get("Web") or {})); sys.exit("8443 已有 Serve 設定，為避免覆蓋已停止。請先檢查 tailscale serve status。" if used else 0)'
python3 -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8765/", timeout=3)' >/dev/null || { echo '請先在另一個終端執行 python3 server.py，並保持服務執行。'; exit 1; }
echo '啟用 News Atlas；將 HTTPS 8443 代理到本機 8765。'
tailscale serve --bg --https=8443 http://127.0.0.1:8765
echo '請使用上面 Tailscale 回傳的實際網址；手機需連上同一 tailnet，並具有存取權。'
echo '停止此服務：tailscale serve --https=8443 off'
