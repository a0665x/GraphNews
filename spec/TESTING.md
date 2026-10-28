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
