# 2026-10-29：拖動曲線必須真的改變局部形狀

後續已加入水平調寬與等比例控制點，見 [浮動面板與沿用修正](bugfix-20261029-floating-regions-persistence.md)。以下保留第一版局部塑形的驗證歷史。

## 問題與改正

原本把「拖曳曲線」做成任意位置都修改全域 peak，另有 width 把手與兩條參數滑桿。雖然能調 Gaussian，卻不能在曲線某一段用滑鼠塑形，不符合使用者想要的直接操作。

現在移除波峰／波寬滑桿與側把手，保留日期滑桿。滑鼠移到曲線顯示日期及倍率，按住上下拖曳只調整附近日期；可以重複操作不同區段，形成不對稱或多個隆起。「復原上一步」與「重設曲線」支援失誤修正。變更影響畫面大小，不改新聞、關聯、相機或 root 狀態。

## 實作與相容性

- [time-lens.js](../../dist/time-lens.js)：cosine 局部筆觸、固定抓取偏移、pointer capture、反向／取消、鍵盤、單步復原及每幀 mesh scale。
- [timeline.js](../../dist/timeline.js)：共用 profile 評估；129 個倍率在相對焦點的 [-1,1] 日期跨度內等距取樣，log 空間插值，1–12 倍。日期滑桿移動整個 profile。
- 預設仍是 Gaussian；未塑形不新增 profile，舊 peak/width 快照保持相容。重設會移除 profile。
- [標準 schema](../../schema/news-atlas.schema.json) 與 [快照驗證](../../news_atlas/snapshots.py) 同步加入 `view.time_focus.profile`。後端拒絕錯誤長度、非有限值、boolean 或超界倍率。
- 遠近補償依整個 profile 最大倍率，2× 至 8× 逐步增加，8× 起完整補償；不能仍讀未使用的舊 peak。
- 每幀只建立一次尺寸 evaluator，再套用至各 node，避免每顆節點重複複製／驗證 profile。不建立新 geometry 或呼叫 graphData setter。

## 驗證 log

```text
node tests/test_time_lens.cjs
PASS: local sculpting/undo/profile persistence, depth-compensated projected size,
      direct drag/reversal/cancellation/keyboard, no graph writes and renderer cleanup

python3 -m unittest discover -s tests -p test_source_workflow.py -q
Ran 10 tests ... OK
```

整體驗收：70 個 Python tests、14 個 CJS 測試檔通過；更新 API capabilities 說明後另跑 test_api.py 的 7 項測試通過；正常及刻意缺模組的首頁啟動測試通過。詳見 [初始化事故紀錄](bugfix-20261029-frontend-asset-startup.md)。

真實快取回放命令：

```bash
python3 tests/browser_runtime_search.py /tmp/graphnews-runtime-regression.html
google-chrome --headless=new --no-sandbox --disable-dev-shm-usage --enable-unsafe-swiftshader --virtual-time-budget=10000 --window-size=1500,1100 --dump-dom --screenshot=/tmp/graphnews-sculpt.png file:///tmp/graphnews-runtime-regression.html
```

結果：`body.dataset.qa` 為 PASS。讀取已有 NVDA 快取 Google 498／Yahoo 800／Massive 800 筆，圖上保留 800 節點，IPO 命中 3 roots。驗證肩部局部塑形而中心不變、按下不跳值、復原、移除參數滑桿、localStorage 保存、快照 profile、取消釋放、WebGL 實際投影尺寸、geometry／graph 物件／相機不變、時間軸與密度格共用森林。已檢視 `/tmp/graphnews-sculpt.png`，曲線及日期滑桿可見、沒有舊參數滑桿。

這些測試只讀真實本地快取，沒有抓取上游資料、寫入正式 DB 或用合成新聞替代。測試資料日期固定，不能把它當今天的搜尋結果。截圖與回放含真實新聞，只留在 /tmp，不納入版本庫。

## 防止重犯

- 驗收「任意曲線段」時，要測肩部，並確認另一側／中心不變；只測白色波峰往上拉不能證明局部塑形。
- 每個 pointermove 都從 pointerdown 的原形計算，避免越慢拖／事件越多就增幅越大。
- 按下不寫入設定；反向拉回抓取高度恢復原形。cancel／lostcapture 必須解除 busy，否則單 root 閒置恢復會卡住。
- 不只測公式：必須檢查實際 mesh scale、投影尺寸、保存／還原與 schema。外觀成功不代表後端保存成功。
- 修改 snapshot validator 後重啟 Python，否則舊程序可能忽略新 profile。工作區已完成；使用者當前 server 是否已重啟需另查。

相關：[UI 合約](../UI.md)、[資料模型](../DATA_MODEL.md)、[測試](../TESTING.md)。
