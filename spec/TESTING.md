# 測試與驗收

入口：[PROJECT_MAP.md](PROJECT_MAP.md)。測試使用隔離 fixture／暫存 DB，不應改寫使用者的 data/news-atlas.sqlite3。

## 命令

```bash
python3 -m unittest discover -s tests -v
for test in tests/*.cjs; do node "$test" || exit; done
node --check dist/app.js
python3 spec/scripts/verify_docs.py
```

一般單元測試不需網路／Massive key。部分 Python API parity 測試呼叫 Node，因此完整測試需要 Node。不要把通過 mock 測試宣稱為 Massive 帳號實際授權成功。

## 依改動選測試

| 變更 | 優先檔案 |
| --- | --- |
| 標準化／來源／快取／HTTP | [test_server.py](../tests/test_server.py)、[test_source_workflow.py](../tests/test_source_workflow.py) |
| Swagger／API／排名一致性 | [test_api.py](../tests/test_api.py) |
| 分類及快照欄位 | [test_channels.py](../tests/test_channels.py)、test_api.py |
| 混合／分組／來源切換 | [test_graph_view.cjs](../tests/test_graph_view.cjs)、[test_stream.cjs](../tests/test_stream.cjs) |
| 深度、排名、多樹 | [test_exploration.cjs](../tests/test_exploration.cjs)、test_api.py |
| 光暈／材質／同步 | [test_glow.cjs](../tests/test_glow.cjs)、[test_glow_sync.cjs](../tests/test_glow_sync.cjs)、[test_presentation.cjs](../tests/test_presentation.cjs) |
| 吸附／拖拉／Ctrl 平移 | [test_interaction.cjs](../tests/test_interaction.cjs)、[test_sticky.cjs](../tests/test_sticky.cjs) |
| 時間軸／日期 | [test_timeline.cjs](../tests/test_timeline.cjs)、[test_dates.cjs](../tests/test_dates.cjs) |
| 輸入與偏好保存 | [test_search_draft.cjs](../tests/test_search_draft.cjs)、test_stream.cjs |
| 篩選框拖曳／收合 | [test_source_panel.cjs](../tests/test_source_panel.cjs) |

## 真實快取瀏覽器回放

```bash
python3 tests/browser_runtime_search.py /tmp/graphnews-runtime-regression.html
```

[產生器](../tests/browser_runtime_search.py) 只讀目前本地 NVDA memberships，各來源最多取 800，再以真實快取建立離線 HTML；需要 DB 及已有 NVDA 資料，不自造替代資料。用 WebGL 瀏覽器開啟，檢查 `document.body.dataset.qa`。

目前腳本實際測 IPO、三來源、800 節點限制、spinner／成功提示、零筆命中、Enter 隔離、無網路／graphData 寫入及光暈像素、實際 WebGL 半徑變化、12 個月刻度、相機不變、密度格／逐篇同步森林。腳本開頭部分描述可能仍寫 robot，應以實際測試程式為準。日期目前固定為 2025-10-28 至 2026-10-28；跨日期／資料環境需明確更新測試條件，不能無條件把它當 live search 驗證。

回放會在 /tmp 產生含真實新聞的檔案，不要提交這些 HTML 或 DB。先前 session 的 /tmp 其他 QA 腳本不是專案依賴，不保證存在。

## 互動驗收的判定

除了截圖，還要核對操作前後節點 ID／數量／物件、graphData setter 次數、來源選擇、相機、draft 值及網路請求。尤其圖內搜尋不能觸發左側取得搜尋。實際重整檢查 localStorage 還原，不能只用同一頁變數假裝 reload。

文件修改只需本地連結／結構及內容查核；不必為純 spec 更新跑 live provider、改 DB 或重啟服務。

日期大小與時間軸森林：`node tests/test_time_focus.cjs` 檢查 UTC 距離、未知日期、月刻度、跨分類 trace、兩種 SVG renderer 的深度漸層；`test_stream.cjs` 檢查 runtime 物件保留、開關及 hidden-root 快照還原；`test_source_workflow.py` 檢查日期設定 DB roundtrip 及非法輸入。

鐘形增益：`node tests/test_time_lens.cjs` 驗證舊 Gaussian 相容、局部塑形不改另一側、倍率界限、profile 還原、復原／重設、拖曳偏移／反向／取消／鍵盤、投影遠近補償及 geometry 保留。真實快取 browser replay 也測任意曲線段、localStorage 保存、已移除參數滑桿、快照 profile、畫面投影半徑一致及原 graph/camera 不變。

啟動器：`bash -n run.sh`、`python3 -m unittest discover -s tests -p test_launcher.py -v`。包含真實 PTY 左右鍵／Enter、模擬 port 占用、取消不綁定、競態重新選擇、Tailscale 狀態／巢狀 Serve／Funnel 解析、代理 URL 與失敗／中斷清理。單元測試不更改真實 tailnet；實際 TCP/Tailscale 連線需在允許監聽 socket 的主機驗證。

首頁初始化回歸：

```bash
python3 -m unittest discover -s tests -p test_server.py -k every_script -v
python3 tests/browser_startup.py /tmp/graphnews-startup.html
# 模擬時間曲線資源缺失，搜尋／語言／問號仍必須可用
python3 tests/browser_startup.py /tmp/graphnews-startup-degraded.html /time-lens.js
```

用 WebGL 瀏覽器開啟產物，檢查 body.dataset.qa。HTML／JS 由實際 HTTP Handler 取得（無需 socket）；搜尋供應商以空結果串流隔離，這是初始化／事件回歸，不代表即時上游新聞可用性。真實快取回放也使用相同 Handler 載入資源，不再從檔案直接嵌入 JS 繞過靜態路由。

測試不能只記「通過」：變更摘要寫入 [CHANGELOG.md](CHANGELOG.md)，事故的失敗證據、修復、實測與未驗證項目寫入 [啟動事故紀錄](references/bugfix-20261029-frontend-asset-startup.md) 等 references。新 JS 必須跑實際 Handler 資源檢查與正常／缺模組兩種瀏覽器啟動情境。

本輪追加：`test_regions.py` 測共享版區／cache key、同 URL 跨地區與併發 origins、SQLite 3→4 相容；`test_credentials.py` 測重啟沿用、權限、錯誤輸入、HTTP/DB 不洩漏；`test_key_persistence.cjs` 測在途保存與忘記順序。browser_startup 同時量測兩面板收合 36px、移動／展開、不同寬度下圓點比例、Quick range、地區標示／提交。真實快取 replay 包含純水平調寬且另一側不變，以及收合兩面板不改 graph。
