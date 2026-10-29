# WebGL 不可用：保留診斷並降級到時間軸

## 症狀與已確認原因

2026-10-29：Tailscale HTTPS 網頁有新聞／數量，但 Chrome 的 3D 空白，重設視角無效。使用者 Console 回報 `Error creating WebGL context`、`GL_VENDOR = Disabled`、`GL_RENDERER = Disabled`、`BindToCurrentSequence failed`；chrome://gpu 顯示 WebGL／WebGL2 Disabled，其他圖形功能亦停用。

直接原因是用戶端無法建立 WebGL context，尚未確定其圖形加速被停用的底層原因（設定、政策、啟動參數、GPU process 或驅動）。不可把 Disabled 推論成某個特定設定，也不能以伺服器 GPU 正常證明客戶端 GPU 正常。

## 排查證據

- HTTPS 首頁、10 個 JS 與 API 可讀，線上 JS 與工作區相同；不是舊資源路由事故。
- 最新真實 Meta 快照僅讀回放：782 節點，全部有限座標、投影可見，WebGL framebuffer 有非背景像素，無 JS 例外。
- Chrome `--disable-webgl` 同資料回放：782 篇仍在，但原程式 `graph === null`，初始化錯誤被 catch 丟棄；rebuild 又把訊息改成「目前來源沒有可顯示新聞」。這是應用程式的獨立錯誤。
- 測試用的 Chrome 軟體渲染警告不能當成使用者的故障證據；使用者後來提供的 Console／chrome://gpu 才確認其 WebGL 初始化失敗。

## 修正

- app.js 保存初始化失敗原因並輸出有前綴的 `[GraphNews 3D]` 錯誤，不再吞錯誤。
- WebGL 不可用時，自動切到既有 SVG／DOM 時間軸，停用 3D 模式按鈕；可展開的提示顯示錯誤與 Chrome 排查路徑。
- 搜尋、來源篩選、分類、多 roots 召回／關聯高亮及快照仍可用。載入 network 快照也遵守降級，不重設左側草稿、不重抓新聞、不刪 DB。
- 使用途中 context lost 時保留資料並降級。收到 context restored 後解除提示、啟用 3D 按鈕；保持時間軸，避免打斷操作，讓使用者自行返回。
- 中英文訊息及靜態資源版本同步更新。沒有強制打開 Chrome 的 GPU、安全開關或軟體渲染開關。

## 驗證

- `node tests/test_graph_failure.cjs`：先在舊程式重現原始錯誤訊息遺失；再增加「應自動切時間軸」斷言，修正前失敗、修正後通過。
- `node tests/test_stream.cjs`：實際 app 的 context lost／restored 事件路徑、模式鎖定與恢復、資料物件保留。
- `for test in tests/*.cjs; do node "$test" || exit; done`：16 個測試檔通過。
- `python3 -m unittest discover -s tests -q`：77 tests 通過。
- `python3 tests/browser_startup.py /tmp/graphnews-startup-fixed.html` 加 headless Chrome：10 個實際 Handler 資源皆 200；搜尋、語言、說明、地區、日期、浮動面板通過。
- 使用暫存真實快照／頁面回放：正常 WebGL 渲染 782 節點；停用 WebGL 自動顯示時間軸，保留 782 篇，Meta 搜尋召回 3 roots，無未捕捉例外。已檢視降級畫面。
- 快照、瀏覽器回放及截圖留在暫存區，未寫入 repo；測試不呼叫新聞來源、不改正式 DB。

## 部署與後續排查

本次只有前端，原 Python 靜態路由已支援。已透過實際 HTTPS GET 比對新版 app.js；刷新頁面即可載入，不需重啟 Python。尚未推送 GitHub，亦未聲稱使用者 Chrome 的 GPU 已恢復。

要恢復 3D，先確認 chrome://settings/system 的圖形加速，重新啟動 Chrome；仍失敗再讀 chrome://gpu 的 Graphics Feature Status、Problems Detected，以及 chrome://version 的啟動參數。網頁無法保證 WebGL 可用，也無法代替用戶端開啟 GPU。參考 [Chrome 官方 GPU 診斷](https://developer.chrome.com/blog/supercharge-web-ai-testing) 及 [Chromium GPU fallback 文件](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/browser/gpu/fallback.md)。
