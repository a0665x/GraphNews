# 變更與驗證 log

入口：[PROJECT_MAP.md](PROJECT_MAP.md)。只記錄已完成的工作區變更；不表示執行中的 server 或 GitHub main 已同步。新增紀錄置頂，事故證據放 references；不記錄金鑰、完整 localStorage 或新聞 DB 內容。

## 2026-10-29 — main 發布整理

- 以遠端 `6b156ef` 為基準，整理曲線塑形／寬度與透視補償、浮動小圖示、RSS 版區與 SQLite 4 來源背景、獨立本機金鑰、互動式 run.sh，以及首頁初始化修復。
- 在乾淨 checkout 驗證：77 個 Python tests、15 個 CJS 檔、spec 本地連結、run.sh 語法與 diff whitespace 檢查通過。
- 發布內容僅包含程式、測試、README、schema 與 spec；不包含新聞 DB、私有金鑰、瀏覽器回放／截圖或暫存產物。
- 下載更新後須重啟 Python 並刷新頁面，才會載入新增 API 與 DB 遷移；遠端發布狀態以 GitHub commit 歷史為準。

## 2026-10-29 — 水平調寬、可搬動小圖示、RSS 地區與常駐金鑰

- 曲線增加水平單側／雙側寬度操作，控制點以畫面尺寸保持圓形；保留局部塑形、復原及原圖狀態。
- 來源與時間焦點都支援 36px 小圖示、拖動、點擊展開、▽ 收合、↺ 歸位。
- Google/Yahoo 共用地區下拉，TW／US／HK／JP／GB；國別／語系／網站背景進 source JSON、快照與 SQLite query context。SQLite 4 自動新增表及索引，舊資料不刪、不硬補國別。
- key 由瀏覽器與主機私有檔沿用；新增兩個 write-only 設定 API，OpenAPI 共 22 操作。Quick range 立即同步起訖，重複點選也更新。
- 驗證：77 Python tests、15 CJS 測試檔、正常／缺模組 browser startup 及真實快取 800 節點回放通過，已檢視精簡面板截圖；台灣 Yahoo RSS 實測回傳 82 個真實索引 item。完整證據與未驗證範圍見下方紀錄。
- 新後端與 DB migration 需要重啟 `./run.sh`；本次未推送 GitHub。
- [本輪 red→green、遷移與避坑紀錄](references/bugfix-20261029-floating-regions-persistence.md)。

## 2026-10-29 — 直接塑形曲線、補齊事故紀錄

- 移除波峰／波寬滑桿，改成抓取曲線任意段上下拖曳，局部平滑塑形；提供日期／倍率提示、鍵盤、復原與重設。
- 自訂曲線跟隨日期焦點，保存於瀏覽器、JSON 與分來源圖譜快照的 `view.time_focus.profile`；舊 Gaussian 快照相容。
- 同步前後端驗證、標準 schema、API capabilities、i18n、README 與 spec。
- 檢查：70 Python tests、14 CJS 檔、正常／缺模組瀏覽器初始化、真實快取 800 節點回放與截圖通過。測試不改正式 DB，不以 mock 通過宣稱上游來源可用。
- 部署：新 snapshot validator 需要重啟 Python，前端刷新；本次未推送 GitHub，也未代替使用者重啟現有 server。最後由本執行環境探測預設 `127.0.0.1:8765/time-lens.js` 得到 curl exit 7（無法連線）；不能推斷使用者是否改用其他 port，亦不宣稱 live 驗收通過。
- 詳細：[曲線塑形的設計修正與驗證](references/lesson-20261029-curve-sculpting.md)。

## 2026-10-29 — 修正首頁全部互動失效

- 根因：新增 time-lens.js 漏登記 HTTP 路由，app 初始化在事件註冊前中止，連帶讓搜尋／語言／Massive 說明失效。
- 修復：補靜態路由、缺可選模組時保留基本功能；首頁資源自動遍歷及瀏覽器 smoke 改走實際 Handler。
- 避坑：直接從磁碟嵌入 JS 的測試無法驗證部署資源路由；只刷新頁面不會更新 Python 記憶體中的路由。
- 詳細：[失敗證據、修復、測試及部署注意事項](references/bugfix-20261029-frontend-asset-startup.md)。
