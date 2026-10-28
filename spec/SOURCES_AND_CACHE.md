# 來源、搜尋與日期覆蓋

入口：[PROJECT_MAP.md](PROJECT_MAP.md)。原始碼：[providers.py](../news_atlas/providers.py)、[search.py](../news_atlas/search.py)、[storage.py](../news_atlas/storage.py)。

## 來源合約

| provider | 取得方式 | 實際限制 |
| --- | --- | --- |
| google | Google News RSS，zh-TW／TW | 搜尋索引快照，不保證完整歷史 |
| yahoo | Google News RSS，en-US／US，`site:finance.yahoo.com` | 不是 Yahoo 官方 API；不涵蓋 `tw.news.yahoo.com` |
| massive | `api.massive.com/v2/reference/news` | 明確 ticker、帳號 key／授權；歷史範圍依帳號 |

取得 `description` 作 summary；不另抓文章全文、不依操作者所在地自動切換新聞語系。NVDA 的查詢不能保證召回每篇 NVIDIA 產品報導。

`normalize_request`：query 最長 200、ticker 最長 20，ticker upper-case；query 空白時用 ticker。Massive 不從任意 query 推測 ticker。單選 Massive 無 ticker 會拒絕；混合來源缺 ticker 時以該來源錯誤事件略過，其他來源仍可工作。

## 時間與預算

UI/API 請求 end 含當日，內部正規化為 UTC `[start, end_exclusive)`。預設最近 7 日，每次最多 366 日、不得超過今天。快速 3/6/9/12 月依日曆月回推；不是來源保證的歷史長度。

每來源單次補抓最多 12 requests／約 90 秒 budget；每次網路讀取 timeout 15 秒，回應上限 8,000,000 bytes。不是一次保證抓完全年。Massive 頁面最多 1000、next_url 驗證目的地及 path；不得把 key 轉送任意網址。RSS ≥100 篇時拆日期窗口，一天仍達上限則不標覆蓋。

## 快取與缺口

鍵包含 provider、adapter／locale version、query：Google `rss-v2:zh-TW:`，Yahoo `rss-v3:en-US:`，Massive `massive-v2:`。改來源範圍／語系要考慮換版本，不可把舊覆蓋用作新來源已讀完的證明。

- `memberships` 決定查詢有哪些文章；不能把同 provider 的全部 DB 混當查詢命中。
- `coverage` 按 UTC 日保存 `complete` 或 `snapshot`，依成功請求的窗口建立，**不能從文章日期推算覆蓋**。
- Massive 當時可存取分頁讀完，包括零篇，才可標 complete；不是世界上所有新聞完整。
- RSS 是 snapshot；最新日／RSS 新鮮度 300 秒，較早 complete 日 86400 秒。
- 過期日或未知日形成 missing_ranges；只補缺口。force_refresh 覆寫補抓範圍，但不繞過限流。
- 分頁／預算／授權錯誤仍保存已取得的好資料與已完成窗口。attempts 記錄錯誤碼／retry_until。
- 手動 save snapshot 不修改 acquisition coverage。

## 搜不到新聞的排查順序

1. 查看左側 query／ticker、來源語系和日期；區分 Yahoo Finance 與台灣 Yahoo。
2. 查看各來源 error、warnings、missing_ranges、cached/new，而非只看 HTTP 200 或完成比例。
3. 區分各來源筆數、總 DB 筆數與目前圖上最多 800 節點。
4. 確認文章是否已取得，關鍵字是否在標題／摘要；未抓取的全文不能被本地匹配。
5. 需要特定產品時可用左側產品名稱搜尋取得資料；圖內 Search 不補搜。

Microduck 案例（2026-10-28 查核）：提供的新聞屬台灣 Yahoo；當時本地標題／摘要沒有 Microduck／機器鴨。這是歷史觀察，不是永遠零筆的系統規則。台灣 Yahoo 擴充與全文擷取均尚未實作。
