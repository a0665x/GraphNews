# 本地資料

啟動 `python3 server.py` 時自動建立 `news-atlas.sqlite3`。這是持續累積、跨重啟使用的單一 SQLite 資料庫，不會每次搜尋另建一份。

- `articles`：各來源文章及標準化欄位。
- `memberships`：查詢與文章的對應，避免把其他查詢的文章當成本次結果。
- `coverage`：依來源、查詢、UTC 日記錄 `complete`（API 分頁讀取完成）或 `snapshot`（RSS 快照）。
- `channels`：使用者新增的分類名稱、顏色及關鍵字規則。預設分類由程式提供。
- `snapshots`：手動儲存圖譜的名稱、時間、搜尋與顯示設定，包含時間軸篩選／密度格模式、關聯門檻／延伸／光暈設定與當時 channel 定義。
- `snapshot_articles`：按快照與來源保存當下文章內容。
- `snapshot_relations`：按快照與來源保存當下關聯；`cross` 代表跨來源連線。
- `membership_origins`：依查詢保存 source 國別／語言／網站限制，防止同網址跨地區互相覆寫。
- `attempts`：抓取時間、區間、錯誤代碼與限流等待時間；不存 API key。

可能伴隨 `-wal` / `-shm` 檔案，這是 SQLite 正常的併發存取機制。若要複製檔案備份，先停止 server，或使用 SQLite backup API。`NEWS_ATLAS_DB` 可指定其他路徑。

介面語言與面板偏好保存在瀏覽器。選擇記住的 Massive key 另保存於瀏覽器及 `private/<DB檔名>.massive-key`（目錄 0700／檔案 0600）；重啟或換 port 可沿用。這個私有檔不在 SQLite／DB 備份／匯出內，也不會被版本控制或 HTTP 提供。按「忘記」移除保存值，環境變數不受影響。SQLite 4 的新表會在啟動時自動建立，不清除既有新聞或快照。
