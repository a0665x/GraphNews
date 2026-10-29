# 啟動、操作與環境查核

入口：[PROJECT_MAP.md](PROJECT_MAP.md)。

## 啟動

Python 3.10+，正式執行僅用標準函式庫；瀏覽器需 WebGL。Node.js 用於測試，前端不用 npm 安裝／build。

```bash
./run.sh
# 可預選 port／模式
./run.sh --port 9000 --mode tailscale --https-port 8444
# 自動化：指定 port，衝突就失敗
./run.sh --non-interactive --mode local --port 9000
# 舊的直接啟動方式仍可用
python3 server.py
```

`run.sh` → `scripts/launch.py` 提供 ←／→／Enter 模式與 port 選單、自訂輸入及最後確認。候選 port 會實際 bind/listen 探測；占用時提供其他候選，權限錯誤不誤報占用。建立 HTTPServer 後保留 socket，再初始化 DB，防止檢查與使用之間被搶占；若最後綁定失敗則重新選擇。q／Esc／Ctrl+C 會還原終端模式與游標。

Local 預設開啟 `http://127.0.0.1:8765`，程序需保持執行。Ctrl+C 停止。這是直接 Python + SQLite，不建立 Docker bridge。

| 環境變數 | 預設／用途 |
| --- | --- |
| `PORT` | 8765 |
| `NEWS_ATLAS_DB` | 專案 `data/news-atlas.sqlite3`；可指定測試或其他 DB |
| `MASSIVE_API_KEY` | 選填；請求內 key → 主機私有保存值 → 環境值；不輸出內容 |

直接 `server.py` 及 run.sh 的 Local 模式綁定 `0.0.0.0`；run.sh 的 Tailscale 模式後端只綁定 `127.0.0.1`。手機使用主機在同一網路的實際 IPv4 + port；`127.0.0.1` 在手機代表手機自己，`0.0.0.0` 不是瀏覽網址。不要把過往熱點 IP 當固定設定。

`run.sh` 的 Tailscale 模式檢查 Running／DNSName，再檢查既有 Serve（含 Foreground／Services）及 Funnel port，另外選 HTTPS port。啟動前再次檢查占用，啟動前景 `tailscale serve --https=PORT http://127.0.0.1:HTTP_PORT`；輪詢實際代理設定就緒後顯示 URL。Ctrl+C／SIGTERM／終端關閉的 SIGHUP、HTTP 啟動失敗或 proxy 異常均清理此次 proxy 與 HTTPServer；不使用 --bg、不 reset 或全域 off。實作依據：[Serve 官方文件](https://tailscale.com/docs/reference/tailscale-cli/serve)。

既有獨立 [Tailscale 腳本](../start-tailscale.sh) 檢查 tailnet 狀態、8443 未被使用及本機 8765 可達，然後建立 HTTPS 8443 代理。不是啟動 server 的腳本；自訂 PORT 需同步調整代理。服務本身沒有登入／授權層，定位是本機或受信任網路。

## 確認執行中的版本

```bash
curl -fsS http://127.0.0.1:8765/api/status
curl -fsS http://127.0.0.1:8765/api/capabilities
```

瀏覽 `/docs`、`/openapi.json`、`/api/schema`。若 status 正常而 capabilities/docs 404，可能仍在跑舊 Python 程序。**前端檔案更新可即時被讀取，但 Python module／route 要重啟才載入**。不要因新版前端可見，就宣稱後端已更新。JS URL 帶版本參數，修改跨模組合約時應一併更新相關資源版本。

重新整理只載入前端；不自動從快照還原整張圖。左側搜尋草稿保存在同 origin 的 localStorage，跨 localhost／區網 IP／Tailscale／port 不共享。瀏覽器拒絕儲存時有提示。

## DB、憑證與版本控制

DB 是跨重啟累積的單一 SQLite，不是每次搜尋一份。備份先停止 server，或使用 SQLite backup API；不能只任意複製正在寫入的主檔而忽略 WAL。詳見 [data/README.md](../data/README.md)。不要把現有使用者 DB 當測試可刪除資料。

讀取 Massive key 的測試／除錯不得列印環境或 localStorage 憑證。一般搜尋草稿不含 key，key 由獨立記住／忘記控制管理。

交付前自行確認 `git rev-parse --show-toplevel`、分支、remote、status；目前可見的 `.git` 可能只是空的唯讀目錄，不是可提交 checkout。不要假設過往 push 仍代表當前 workspace；不要改寫 `.gitignore` 加入 agent 使用痕跡。README 的遠端是 `a0665x/GraphNews`，不構成自動發布新變更的指示。

前端整頁失去互動時，先檢查 HTTP script 回應與第一個 JavaScript 例外；不要先把問題歸因於 API key 或來源。參閱 [前端資源事故及重啟驗證](references/bugfix-20261029-frontend-asset-startup.md)。塑形 profile 的後端驗證也需要重啟 Python，否則舊程序可能丟棄新欄位。

主機記住的金鑰在 `<DB所在目錄>/private/<DB檔名>.massive-key`，目錄 0700、檔案 0600，原子置換；不加密，也不由 HTTP static 路由提供。預設路徑及 key／暫存檔 pattern 均由 .gitignore 排除。DB 備份不含金鑰；清除主機保存不改環境變數。新增 key API、地區搜尋、SQLite 4 遷移需要重啟 Python。
