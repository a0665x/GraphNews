# 本地資料

啟動 `python3 server.py` 時自動建立 `news-atlas.sqlite3`。這是持續累積、跨重啟使用的單一 SQLite 資料庫，不會每次搜尋另建一份。

- `articles`：各來源文章及標準化欄位。
- `memberships`：查詢與文章的對應，避免把其他查詢的文章當成本次結果。
- `coverage`：依來源、查詢、UTC 日記錄 `complete`（API 分頁讀取完成）或 `snapshot`（RSS 快照）。
- `channels`：使用者新增的分類名稱、顏色及關鍵字規則。預設分類由程式提供。
- `snapshots`：手動儲存圖譜的名稱、時間、搜尋與顯示設定，包含時間軸篩選與當時 channel 定義。
- `snapshot_articles`：按快照與來源保存當下文章內容。
- `snapshot_relations`：按快照與來源保存當下關聯；`cross` 代表跨來源連線。
- `attempts`：抓取時間、區間、錯誤代碼與限流等待時間；不存 API key。

可能伴隨 `-wal` / `-shm` 檔案，這是 SQLite 正常的併發存取機制。若要複製檔案備份，先停止 server，或使用 SQLite backup API。`NEWS_ATLAS_DB` 可指定其他路徑。
