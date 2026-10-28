# 文件盤點與維護分工

上層：[PROJECT_MAP.md](../PROJECT_MAP.md)。盤點基準：2026-10-28 的本地檔案。

## 既有文件：保留原位

| 文件 | 類型 | 與 spec 的關係 |
| --- | --- | --- |
| [README.md](../../README.md) | 使用者安裝、操作與功能說明 | spec 連結，不搬移或複製整篇 |
| [docs/API.md](../../docs/API.md) | 完整功能表、schema 流程、20 操作、MCP 規劃 | spec/API 提供開發定位，細表留此 |
| [data/README.md](../../data/README.md) | SQLite 內容及備份 | spec/DATA_MODEL 說語義；操作可回此 |
| [schema/news-atlas.schema.json](../../schema/news-atlas.schema.json) | 機器可讀合約 | 不用 Markdown 敘述取代 |
| [dist/vendor/README.txt](../../dist/vendor/README.txt) | Swagger vendor 來源／版本 | 連同 LICENSE/NOTICE 留在 vendor |

本次新增 spec 是開發 onboarding，不改動上述文件的所有權；README 增加入口連結。沒有重寫 `.gitignore`、移動 DB、提交新聞、更新 vendor 或執行部署。

## 尚未實作／不可推定

- 新聞全文抓取／抽取／全文索引。
- 台灣 Yahoo 綜合新聞來源；現行 Yahoo 僅美國 Finance。
- 向量語意檢索、LLM 因果推論、跨語言文章翻譯。
- 整個 DB 的 UI 圖內搜尋；目前只查可見 runtime graph。
- MCP transport、公開部署的認證／授權。
- 跨 origin／跨裝置瀏覽器偏好同步。
- 按節點重要性調本體大小；目前只有可關閉的日期距離大小焦點。

以上是能力邊界，不代表使用者已要求立即實作所有項目。每次新任務應依當下指示決定範圍。

## 如何更新 spec

行為變更先改最相關 Level 2／reference，再確認入口仍可找到；不要把每次 session 日誌堆到 PROJECT_MAP。記錄可驗證結論、程式入口及測試方式，避免只記「已完成」。執行中 server、GitHub 分支、IP 與瀏覽器快取均是暫態，需重新查核。

本次使用的 onboarding 技能主文件可讀，但其 references/spec-authoring.md 與 scripts/spec_inventory.sh 不在安裝目錄，搜尋也未找到；以 rg、原始碼與本地連結檢查替代盤點，並遵循主文件的三級結構。專案本身不依賴該技能安裝路徑。
