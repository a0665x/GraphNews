# 2026-10-29：新增曲線模組讓整頁失去互動

## 一分鐘判斷

症狀是搜尋、語言切換、Massive 問號同時失效。原因是 `/time-lens.js` 沒有登記到 Python 的靜態路由，404 後 `app.js` 在事件註冊前發生 `ReferenceError: AtlasTimeLens is not defined`。不是新聞來源或金鑰故障，也沒有證據顯示是 run.sh 的 port 選單造成。

預期：新曲線正常載入；即使可選曲線模組缺失，搜尋、語言與 API 說明仍可操作。

## 證據與排查 log

| 步驟 | 實際觀察 | 結論 |
| --- | --- | --- |
| 檢查使用者回報 | 三項互不相干的 UI 操作同時失效 | 優先查初始化，而非逐一改 provider |
| GET `/time-lens.js?v=20261029-startup2` | 當時執行中的 localhost:8765 回 HTTP 404 | HTML 引用不代表伺服器可提供檔案 |
| 修復前執行首頁全部 script 路由測試 | 缺少 time-lens 路由，測試失敗 | 精確定位靜態路由遺漏 |
| 修復前用實際 Handler 回應建立 browser startup | language/help/search 全 false；`AtlasTimeLens is not defined` | 證明 404 → 初始化中止 → 多項 UI 失效 |
| 比對舊 browser replay | 直接從磁碟讀 JS 再嵌入 HTML | 測試繞過正式路由，造成假信心 |
| 修復後只重新整理舊 server | 路由仍 404 | Python handler 已載入記憶體，必須重啟 |

以上修復前結果記錄自本次事故排查；目前程式已修正，不會再以正常設定重現舊失敗。產生器仍可透過 omit 參數重現模組缺失。

## 修復與保護

- [server.py](../../server.py)：補 `/time-lens.js` 路由；靜態檔保留 `Cache-Control: no-cache`。
- [app.js](../../dist/app.js)：檢查可選模組可用性，缺失時停用時間控制並顯示重啟／刷新提示，其餘初始化繼續。
- [test_server.py](../../tests/test_server.py)：從首頁抽取所有 script src，逐一檢查 HTTP 200、JavaScript MIME、非空內容，含版本 query。
- [browser_startup.py](../../tests/browser_startup.py)：取得實際 Handler 的 HTML／JS 回應，檢查搜尋送出、語言、問號、關閉對話框與 Dashboard 連結；加入缺模組情境。
- [browser_runtime_search.py](../../tests/browser_runtime_search.py)：改用相同 Handler 資源路徑，不再直接從磁碟嵌入前端 JS。

## 驗證紀錄（2026-10-29，含本次塑形變更）

```text
python3 -m unittest discover -s tests -q
Ran 70 tests ... OK

for test in tests/*.cjs; do node "$test" || exit; done
14 個測試檔全部退出 0

python3 tests/browser_startup.py /tmp/graphnews-startup.html
assets: 10, failed: []

python3 tests/browser_startup.py /tmp/graphnews-startup-degraded.html /time-lens.js
刻意讓 time-lens.js 回 404
```

兩份產物用 Chrome headless、WebGL 與 3000 ms virtual-time-budget 開啟，讀 `document.body.dataset.qa`：

```text
正常：PASS; language=true, help=true, helpClose=true, search=true; errors=[]
缺模組：PASS; 上述項目全部 true, degradedNotice=true; errors=[]
```

這是實際 Handler 回應＋真實瀏覽器執行，不需要監聽 socket；搜尋使用隔離的空結果串流，不是上游 API 連線驗證。未使用或輸出 Massive key，未改寫正式新聞 DB。

## 部署與下次先查什麼

1. 新增 JS 要同時查 HTML、server 靜態路由、載入順序、跨模組版本與 i18n。
2. 查瀏覽器 Network 的第一個失敗資源及 Console 的第一個例外，不要從最後連鎖症狀倒猜。
3. 測試不得繞過本次可能出錯的邊界。磁碟檔存在／node 語法通過，不等於 HTTP 可載入。
4. Python module、route、snapshot validator 變更須重啟 server；前端改檔與重新整理不能更新記憶體中的 Python。
5. 使用者主機停止原程序，再 `./run.sh`，選原本需要的模式／port，瀏覽器強制重新整理。查 `/time-lens.js` 是否回 200，再驗證三項基本 UI。不要為此清空 DB／草稿／金鑰或殺掉其他專案。
6. 工作區測試、執行中 server、GitHub main 是三個獨立狀態；必須分別確認。這次未宣稱已重啟使用者服務或推送 GitHub。

相關：[啟動文件](../RUNTIME.md)、[驗收命令](../TESTING.md)、[變更 log](../CHANGELOG.md)。
