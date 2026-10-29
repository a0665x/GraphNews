# 2026-10-29：曲線寬度、精簡面板、RSS 版區與設定沿用

## 症狀與預期

曲線原先只有垂直塑形；綠點因 SVG 非等比例縮放變橢圓；來源收合後仍是長標題列，時間焦點不能獨立搬動。使用者也要求記住的 key 持續沿用、Google/Yahoo 共用國家選擇、DB 保存地區背景、Quick range 同步起訖日期。

## 排查與 red → green log

| 命令／邊界 | 修復前證據 | 修復 |
| --- | --- | --- |
| `node tests/test_time_lens.cjs` | `Pure horizontal drag must change width` 失敗 | 計入水平位移；從按下時 profile 做單側／中央雙側伸縮，垂直筆觸仍可同時塑形 |
| SVG 螢幕幾何 | viewBox 1000×100 使用 preserveAspectRatio=none，circle 受不同 x/y 比例拉伸 | 依實際 rect 反算 ellipse rx/ry，畫面直徑維持 16px；描邊 non-scaling，尺寸改變重算 |
| `node tests/test_dates.cjs` | 跨日後再次點 Quick range 仍為 2026-10-28，預期 29 | 即使已在 quick 模式也 refresh；同時保留獨立 custom 草稿 |
| `node tests/test_exploration.cjs` | 暫時清空 key 欄把 massiveKey 刪成 null | 空值不刪歷史；明確 forget／opt-out 才清除 |
| `test_regions.py -k selection` | normalize_request 不保留 rss_region | 驗證 TW／US／HK／JP／GB，傳到 cache warm-read、補抓、provider 和保存 |
| `test_credentials.py -k recorded` | 主機保存端點回 404 | 明確記住／忘記 API，主機私有檔，跨重啟／port 沿用 |
| `test_regions.py -k existing` | 舊查詢無 source.country，後來同網址被 US 抓取後變成 US | 更新共享 payload 前，先將舊 source 凍結到各舊 membership 的背景記錄，不能捏造舊版區 |

首輪 UI 回放另出現 `collapsing tools retains graph`：測試把早先切換 timeline/network 的合法 graphData 寫入也計入折疊操作。改為記錄折疊**前**的 setter 次數及 node 物件，再比較前後；不能以跨階段累計值誤判產品回歸。

## 最終行為

- 曲線上下改局部增益；肩部往外／內拉改該側寬度，中央左右拉調雙側。每筆從原形計算，支援反向、取消、復原；Shift＋左右鍵也可調寬。最高倍率與遠近補償仍由 profile 決定。
- 來源與時間焦點共用 `initFloatingPanel`。▽ 收成 36×36 圖示，圖示可拖動、點擊展開；↺ 歸位，方向鍵移動。來源選擇／文字／graph 不重建，兩面板各自保存位置及折疊狀態。
- RSS 地區由 UI 明確選擇，Google/Yahoo 同步；來源背景為 `source.country/language/sites`，不是出版者國籍、事件所在地或文章語言偵測。Massive 不受影響。
- SQLite user_version=4 新增 membership_origins 及文章反查索引。文章來源 origins 累積全部版區；read 回傳該 query 當時的 source。BEGIN IMMEDIATE 防止兩版區同時保存同 URL 遺失 origins。舊快照／新聞不刪除，沒有地區證據就維持未標記。
- 明確記住 key 保存到瀏覽器及 `<DB目錄>/private/<DB檔名>.massive-key`，目錄 0700／檔案 0600，原子置換、不加密。主機 API 永不回 key，只回 configured。優先序：本次輸入 → 主機記住 → 環境變數。主機私有 key 供連回該服務的搜尋沿用；瀏覽器草稿仍是同 origin 的偏好。
- key 保存／清除請求序列化，避免剛忘記又被舊的在途保存寫回。失敗有 UI 提示；不清空新聞 DB，不把 key 寫進 payload、日誌或文件。

## 驗證紀錄

```text
python3 -m unittest discover -s tests -q
Ran 77 tests ... OK
for test in tests/*.cjs; do node "$test" || exit; done
15 個 CJS 檔通過
python3 -m unittest discover -s tests -p test_regions.py -q
5 tests ... OK（含舊 DB 遷移、同 URL 五地區並行保存）
```

正常與刻意缺 `/time-lens.js` 的 browser_startup 都 PASS。經實際 Handler 取得首頁與 10 個 scripts，檢查搜尋、語言、Massive 問號、地區標示／請求、Quick range、兩面板小圖示／拖動／展開、310/480px 寬度下的圓點比例；沒有 JavaScript error。

真實快取回放使用本地已有 NVDA、指定 2025-10-28 至 2026-10-28（SQL 排除區間外文章且去掉多版區 membership 重複），不合成新聞、不改正式 DB。驗證純水平拖曳會加寬且另一側不變、增益／透視／geometry、roots、時間軸與面板操作不改圖。

最終 `body.dataset.qa` 為 PASS：800 個節點、3 個 IPO roots 保留，水平寬度／透視／時間軸／精簡面板檢查全過。已檢視回放截圖，兩面板只占各一個小圖示。回放截圖在 `/tmp/graphnews-compact-runtime.png`，不提交含真實新聞的測試 HTML／截圖。

實際外網唯讀探測：Google RSS 搜尋 `(NVIDIA) site:tw.news.yahoo.com`，hl=zh-TW、gl=TW、ceid=TW:zh-Hant，curl exit 0，回傳 RSS、82 個 item。未寫 DB、未用 key；未宣稱每個版區／每段日期或 Massive 帳號都已 live 驗證。RSS 並不保證完整收錄。

參考：[Google News 語言／地區設定](https://support.google.com/googlenews/answer/7688469?hl=en)、[Yahoo 香港](https://hk.news.yahoo.com/)、[版區對照原始碼](../../news_atlas/regions.py)。

## 部署與避免再犯

1. **必須重啟 Python**，才有新 credentials endpoints、rss_region 路徑及 DB 遷移；前端改檔即時可見不代表後端已更新。之後強制刷新。沒有刪 DB 或要求重填歷史 key。
2. 同一資料跨查詢／國家時，共享文章 payload 不能代替 query-specific provenance；cache key 分國家還不夠，連 source 背景也要分開保存。
3. 憑證常駐與 localStorage 是不同需求：換 port／IP 是不同 origin。主機只提供「已配置」與後端沿用，不把 key 送回其他瀏覽器。
4. SVG 形狀須量測螢幕尺寸，不能因原始 tag 是 circle 就宣稱畫面為圓。面板測試量測收合後的寬高及展開／拖動，不只測 hidden boolean。
5. 不可將「垂直拖曳通過」當成二維操作通過；要單獨送純水平位移，檢查兩側及保存結果。
6. Quick mode 每次選擇／月份／submit 要一致更新 visible inputs、summary、request，保留自訂日期草稿。
7. 這次未推送 GitHub，未聲稱使用者執行中的服務已重啟。預設私有檔及任意路徑下的 key／暫存檔 pattern 已加入普通 .gitignore 規則。

相關：[測試入口](../TESTING.md)、[來源快取](../SOURCES_AND_CACHE.md)、[UI](../UI.md)、[資料模型](../DATA_MODEL.md)、[變更 log](../CHANGELOG.md)。
