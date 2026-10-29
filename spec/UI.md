# 前端互動與狀態

入口：[PROJECT_MAP.md](PROJECT_MAP.md)。實作索引：[ARCHITECTURE.md](ARCHITECTURE.md)。回歸合約：[BEHAVIOR_CONTRACTS.md](references/BEHAVIOR_CONTRACTS.md)。

## app.js 的狀態邊界

- `basePayload`：取得的來源圖；`focusView`：來源與 edge 門檻篩選後的圖；`currentView` 再套時間／分類顯示篩選。
- `articles`／`relations`：當下視圖；ForceGraph 自己持有物理節點及 link 端點物件。
- `networkPositions`／`internalLengths`：保持位置與來源內關聯距離，切換模式不是重建隨機佈局。
- `exportMeta`：本次圖譜或快照的取得資訊，與左側搜尋草稿不同。
- `hovered`／`candidateTrace`：滑鼠候選預覽，不是已確認 root；背景維持全局亮度。
- `lockedRoots`／`keywordLocked`／`activeTrace`：焦點及森林；`selected`：詳情文章，不能因查看文章而重選 root。
- `rootSearchTicket`／`rootSearchBusy`：等待 paint 的本地搜尋防重入／過期結果保護。

## 兩個搜尋入口

左側新聞搜尋送 `/api/search`、消耗來源請求並更新 DB。它開始新資料集，不能從圖內 Search 誤觸。

圖內 Search 是獨立 `div role=search`，按鈕 `type=button`；輸入框 Enter 攔截原生提交。直接 `AtlasView.rankRoots(articles,...)`，80ms yield 讓忙碌提示可繪製，再套森林。**不 fetch、不寫 graphData、不換模式、不改相機、不清資料**。零筆或輸入錯誤保留既有焦點；成功固定新 roots，既有圖仍在。錯誤與 warnings 明確顯示。API explore 並非此 UI 的依賴。

匹配欄位、分數與英文詞首規則見 [SCHEMA_AND_RULES.md](references/SCHEMA_AND_RULES.md)。不是全文、全 DB 或語意模型。

## 顯示與操作

Google 綠／Yahoo 紫／Massive 藍。勾選來源預設混合，亦可來源分組；來源內 edge 與跨來源補充 edge 分開。預設啟用時間大小焦點：UTC 日期越接近滑桿日期，半徑由 1 倍漸增至 peak（預設 2，上限 12）；日期未知不套用日期增益。設定可關閉，恢復 `.nodeVal(3)`。塑形後依自訂曲線決定倍率，可不對稱或多峰；大小不代表重要性。

滑鼠拖節點沿相機平面牽引鄰居，空白拖曳旋轉、滾輪縮放、Ctrl＋左鍵平移相機與 target。自適應吸附根據畫面投影與縮放，按住拖拉鎖定操作。靠近只預覽，點一下才確認 root，拖拉不算確認。已選 root 不因滑過／查看其他文章而切換；點空白或 Esc 清 focus，圖仍保留。

單 root 閒置 5.5 秒回全局，按住節點／平移不逾時；關鍵字多 roots 持續固定。光暈在 WebGL 同一 render 幀投影 Canvas，非圖片；多層漸淡、root 最亮、共同節點採最淺層。退場漸淡並逐步恢復背景材質亮度。調亮度／範圍／decay／背景不改關聯證據。

時間軸：UTC 發布日期 × channel。密度格及逐篇節點皆共用 `focusView` 產生的 `activeTrace`，切換分類／cutoff 不清除暫時隱藏的 roots；取消來源才移除該來源不再存在的 roots。密度格以格內最淺 depth 高亮、★ 標示 root，`命中/總數 · d深度` 區分集合內部狀態；channel 計數顯示總篇數／關聯篇數／roots。集合連線只高亮選定 tree 中既有 edge。Hover 不取代已確認森林。切到時間軸或完成圖內搜尋會捲至可見 roots。

底部時間大小滑桿跟隨**已載入圖譜**的 `exportMeta.start/end`，不是尚未送出的搜尋草稿；無圖時才預覽左側日期。UTC 每日一步，60 天以上按日曆月標記，短區間約 6 格，端點顯示完整日期。`timeScale = 1 + (peak-1)*exp(-0.5*(日距離/max(1天,區間跨度×width))²)`；peak 1–12、width .01–.5（預設 .12）。ForceGraph 的幾何保持 `nodeVal(3)`，`AtlasTimeLens.attach` 包裝同一 renderer，在每幀 WebGL 前修改 node.__threeObj.scale。遠近補償強度 `c=clamp((maxGain-2)/6,0,1)`（塑形時取 profile 最大值，否則取 peak）；最終 scale=timeScale*(cameraDepth/referenceDepth)^c，referenceDepth 是 controls.target 的相機深度。behind-camera／無效深度不補償。c=1 時同日期的投影半徑一致；縮放改變參考深度，仍可縮放全圖。不呼叫 graphData、重抓資料或改相機／位置／連線／roots。吸附投影讀取 nodeVal 與 mesh.scale.x；逐篇時間軸大小上限 2 倍，密度格面積仍不變。此日期焦點與發布 cutoff 分開。

`time-lens.js` 提供曲線任意段的直接塑形，不再顯示波峰／波寬滑桿或側把手。滑鼠靠近曲線顯示日期／倍率，按住上下拖動塑形附近日期；左右拖動伸縮該側，中央 offset < .025 時雙側一起伸縮，factor 限制 .2–5；每筆 stroke 從按下時的形狀計算，不累加 pointermove 次數。相對焦點的 offset 範圍 [-1,1]，129 點等距取樣，倍率 1–12；插值在 log(gain) 空間，區間外為 1。局部 cosine brush 半徑為日期跨度的 .12（最小跨度一天），垂直位移以 SVG 高度映射 log 增益，邊界一階導數為 0。可以分次塑出不對稱或多峰，不要求保持單一 Gaussian。日期滑桿帶著形狀移動；未塑形的舊設定仍用上述 Gaussian。

Pointer capture 支援移出、反向拖動、cancel／lostcapture；按下不改值，拉回起始座標還原原形；取消／失去 capture 保留最後顯示結果並解除 busy。「復原上一步」還原上一筆 stroke 或 reset，不改焦點日期／開關；只在目前頁面保留一步。白點左右鍵選一天、上下鍵 ±.2× 局部調整，Home/End 往 1/12× 塑形；Shift＋左右鍵調寬度。控制點使用依 SVG rect 反算的 ellipse rx/ry，在畫面上維持 16px 圓形，描邊 non-scaling，ResizeObserver 在面板尺寸變化時重算。按住曲線暫停單 root 閒置計時。高頻更新只調 mesh scale，不能呼叫 graphData 或重建球體 geometry。曲線可收合；時間軸模式預設收合。設計取捨與測試見 [直接塑形紀錄](references/lesson-20261029-curve-sculpting.md)。

## 面板與瀏覽器保存

`AtlasUI.initFloatingPanel` 共用於來源和時間焦點：標題拖曳、方向鍵移動、▽ 收成 36px 圖示、點圖示展開、↺ 歸位、限制在 stage 範圍；不修改來源或搜尋內容。左／右 sidebar 可拖分隔線調寬。JSON tree 預設隱藏值，展開才建子欄位。

localStorage 前綴 `graphnews.`：

| key | 用途 |
| --- | --- |
| searchDraft | query、ticker、sources、forceRefresh、dates（mode/months/custom） |
| rememberKey / massiveKey | 金鑰獨立記憶／忘記；另透過 API 保存主機私有檔，不在草稿或 DB |
| exploration / glow / stickyStrength | 探索、光暈、吸附偏好 |
| timeFocus | 時間大小開關、日期、peak、width、可選 profile；快照為 view.time_focus |
| timeCurveOpen | 3D 中鐘形曲線面板的展開偏好 |
| timelineStyle / language | 密度或逐篇、繁中或英文 |
| leftWidth / rightWidth / sourcePanel / timePanel | 面板寬度、位置／收合 |

`AtlasDates` 保存自訂日期草稿，快速區間重開／搜尋時按 UTC 今天更新。storage 不可用有提示。同 origin 才共享，不承諾跨裝置或跨網址同步。新聞／證據 `.raw` 不翻譯，新增 UI 文字須加入 i18n。

時間曲線是可選視覺模組：若 AtlasTimeLens 未載入，顯示重啟提示、停用曲線控制，但仍註冊搜尋、語言與 API 說明事件。修改 script 引用時須檢查實際 HTTP 路由，見首頁初始化測試。

RSS dropdown 預設 TW，選擇持久化在 searchDraft.rss_region；Yahoo 顯示相同國別與語系代碼，提交包含 rss_region，快照 restore 不改草稿。Quick range 每次點擊（即使已選中）、月份切換和 submit 都刷新 start/end；custom 草稿仍獨立保留。

金鑰輸入暫時為空不會刪記錄，記住時先保存 localStorage，change／submit／既有瀏覽器歷史載入會同步主機。伺服器只回 configured boolean，跨 port 新頁面顯示主機已配置並由後端沿用，不取回 key。保存／忘記以佇列順序執行，防止在途保存把剛刪掉的 key 復活。
