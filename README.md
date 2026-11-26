# ListenLoop（原型 v0.2.0）

英文聽力 × 單句循環 × 中英字幕的 Mobile-first PWA。本版是 PRD Phase 1 的**可操作原型**：
無後端、無建置步驟，資料只存在瀏覽器。

## 啟動

這台電腦沒有 Node／Python，用 PowerShell 內建的靜態伺服器：

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

開啟 http://localhost:5178/ 。必須透過伺服器開啟，直接開 `index.html`（file://）時 YouTube 播放器會拒絕嵌入。
在 Claude 桌面 App 的瀏覽器面板中，可以用 `.claude/launch.json` 裡的 `listenloop` 設定啟動。

| 頁面 | 網址 |
|---|---|
| App | `/#/home` |
| 單元測試（27 項） | `/tests.html` |
| 字幕打點工具（內部用） | `/tools/caption-timer.html` |

## 已完成功能

- **首頁**：沒有底部導覽列；右上角為「最愛」與「設定」，「繼續聆聽」旁可進入播放紀錄。搜尋（關鍵字，或貼上 YouTube 網址／ID 直接開啟）、全部／影片／頻道分類、頻道圓形頭像列、分頁「載入更多」、推薦學習內容（CEFR 程度／5 分鐘內篩選）、最愛捷徑。其他頁面左上角有返回首頁按鈕。
- **播放頁**：播放／暫停、進度、全螢幕、音量使用 YouTube 官方播放器本身的控制。標題區右側有速度（0.5–2.0x，記住上次選擇）、整篇重複、最愛三個按鈕。雙語字幕（目前句高亮、已播放淡化、自動捲動，手動捲動後暫停自動捲動 3 秒並顯示「回到目前句子」）；點句跳轉；每句 Repeat 按鈕。
- **純音訊模式（v0.2）**：內建示範影片可在標題下方切換「影片｜純音訊」。純音訊用 HTML5 `<audio>` 播放 VOA 官網的同一份公有領域媒體檔：
  - 可背景播放、鎖屏播放，沒有 YouTube 廣告；字幕同步、單句／區間／整篇循環、速度都照常可用。
  - 播放器區域換成自己的控制面板：上一句、倒退、播放／暫停、快進、下一句、可拖曳的進度條。
  - 鎖屏／通知中心（Media Session）：顯示目前英文句子，按鈕為播放／暫停、上一句／下一句、快退／快進、拖曳進度。
  - 離開播放頁不會暫停，迷你播放列顯示「背景播放中」。
  - 切換來源會保留位置、速度與循環模式；選擇會記住（設定 → 播放 →「示範內容預設使用純音訊」，預設開啟）。
  - 音訊載入失敗（離線、檔案被移除）時自動改用 YouTube 影片並提示。
  - 搜尋到的一般 YouTube 影片沒有純音訊模式（不能擷取 YouTube 音訊）。
- **循環**：整篇重複（標題區按鈕）／單句重複（每句右側按鈕）／區間重複（長按起點句、再長按終點句）。循環中標題下方會出現狀態列與「停止重複」按鈕。次數、間隔、完成後自動下一句在「設定 → 播放」調整。
- **其他**：字幕顯示模式（中英／只英文／只中文／遮英文聽寫）在「設定 → 外觀」；桌面鍵盤快捷鍵（空白鍵、←→ 快退快進、↑↓ 上下句、R 單句重複、Esc 停止循環）。
- **最愛、播放紀錄**：新增／移除、搜尋、依收藏日期或最近播放排序；紀錄含進度百分比與累計聆聽時間。
- **進度保存**：每 5 秒、切換分頁、關閉頁面時保存內容、時間、句子、速度、循環模式；重開自動從上次位置繼續。
- **設定**：主題（系統／淺色／深色）、字幕字體大小、字幕與高亮顏色、播放與循環預設值、繁中／English 介面、API Key、關於。
- **PWA**：manifest、圖示、Service Worker（只快取 App 本身，不快取 YouTube 內容）。

## 需要你設定的服務（未設定時 App 會標示「待設定」）

Key 目前只存在瀏覽器（原型階段）。正式版要移到後端，不能放在前端。

1. **YouTube Data API v3**（搜尋影片與頻道）
   Google Cloud Console → 建立專案 → 啟用「YouTube Data API v3」→ 憑證 → 建立 API 金鑰 → 建議限制 HTTP referrer。每日配額 10,000 單位，一次搜尋約 100 單位（已做 6 小時快取）。
2. **翻譯服務**（只在句子缺少中文時使用；內建示範內容已有人工翻譯，不需要 Key）
   - **Microsoft Translator 免費層 F0**（預設建議）：每月 200 萬字元、支援瀏覽器直接呼叫、資料不拿去訓練。Azure Portal 建立「Translator」資源，選 F0，複製 Key 與區域。
   - **Google Gemini API 免費層**：語境翻譯品質最好；免費層有每日請求上限，且輸入內容可能被 Google 用於改進產品。到 Google AI Studio 取得 Key。

## 已知限制（刻意遵守 PRD 合規要求）

- **YouTube 不支援背景／鎖屏播放**：使用官方播放器（「影片」模式）時不能把它當背景音訊來源；離開播放頁會自動暫停並顯示說明。可能出現 YouTube 廣告（由影片擁有者的營利設定決定，不能也不會阻擋）。背景播放只適用有自有／授權音訊的內容（目前是 4 部示範影片的「純音訊」模式）。
- **純音訊模式尚未在手機實機驗證**：背景播放、鎖屏控制只在電腦瀏覽器上用程式驗證（Media Session 按鈕、離開頁面不中斷）。iOS／Android 實際鎖屏行為需要部署到 HTTPS 或開放區網後用手機測試。
- **背景時單句循環的精準度**：手機在背景時可能放慢 JavaScript 計時器，App 另外用 `timeupdate` 事件（約每 0.25 秒）補檢查，背景時單句循環可能晚 0.3–1 秒才跳回；前景不受影響。
- **示範音訊直接串流 VOA 的 CDN**：每部載入約 2 秒，沒有離線快取；檔案若被 VOA 移除會自動改用影片。
- **他人影片沒有字幕**：YouTube 官方 API 只能下載自己頻道影片的字幕，所以搜尋到的一般影片可以觀看、調速、快進，但沒有同步字幕與單句循環，頁面會明確說明。
- **單句循環精準度**：以官方 IFrame API 每 50ms 輪詢時間並 `seekTo` 實作；YouTube 的 seek 有約 0.1–0.3 秒延遲。
- 手勢只作用在字幕區，不攔截 YouTube 播放器本身的操作；亮度／音量手勢在網頁版無法可靠控制系統設定。
- 帳號登入、雲端同步、通知、ASR、學習統計屬於下一階段，設定頁標示「下一階段」。
- **iPhone 實機驗收尚未進行**：PWA 安裝與 Service Worker 需要 HTTPS 網址，本機 http 只能在電腦上測。

## 內建示範內容

4 部 VOA Learning English 影片（美國政府作品，屬公有領域），可透過官方 YouTube 播放器觀看，或用「純音訊」播放 VOA 官網的同一份媒體檔：

| 影片 | 程度 | 句數 |
|---|---|---|
| English in a Minute: Pie in the Sky | A2 | 11 |
| English in a Minute: On the Ball | A2 | 14 |
| Everyday Grammar: Goodbye In Informal Conversations | B1 | 22 |
| News Words: Illusion | B1 | 8 |

- 英文：官方影片說明中的逐字稿（依實際語音修正少數字句）。
- 時間軸：先用 VOA 官網的同一份媒體檔做停頓偵測自動對齊（`alignToPauses`），再逐句對照 YouTube 影片畫面上的燒錄字幕人工校正。自動對齊在有片頭音樂的影片常會差一個停頓，所以人工檢查是必要步驟。
- 中文：人工翻譯（繁體中文、台灣用語）。
- 原始資料：`tools/demo-sources.json`；字幕檔：`data/demo/<影片ID>.json`（PRD §5.6 的 Sentence Object 欄位）。

### 新增一部示範影片

1. 確認內容是公有領域或已取得授權，且有逐字稿與可下載的原始媒體檔（不可使用 YouTube 音訊）。
2. 開 `/tools/caption-timer.html`：填 YouTube ID、媒體檔 URL、逐字稿（一行一句）→「分析停頓並自動對齊」。
3. 「載入影片」後逐句按 ▶／⟲ 檢查，用 −.1／+.1 微調，或在播放時按 T 逐句打點；填入中文（或用「自動翻譯」）。
4. 「匯出 JSON」，存成 `data/demo/<ID>.json`，並在 `data/demo/index.json` 加一筆。
   若要支援純音訊，加上 `"audio": { "src": "<媒體檔 https 網址>", "offset": 0 }`。`offset` = YouTube 時間 − 音訊時間；現有 4 部用停頓比對量過，都是 0（與 YouTube 版本同一剪輯）。媒體檔必須是公有領域或已授權，不可使用 YouTube 音訊。
5. 開 `/tests.html` 確認「demo caption files」測試通過。

## 專案結構

```
index.html, css/app.css            App shell 與樣式（Light/Dark tokens）
js/app.js                          hash router、mini bar、PWA 註冊
js/player/yt-adapter.js            YouTube IFrame API 包裝（全 App 只有一個播放器）
js/player/audio-adapter.js         HTML5 audio 包裝（與 YouTube adapter 同介面，含時間 offset）
js/player/media-session.js         鎖屏／通知中心控制（Media Session API）
js/player/loop-engine.js           循環狀態機（可注入假播放器與時鐘做測試）
js/player/playback.js              播放服務：影片／音訊兩種來源、引擎輪詢、進度保存
js/views/audio-panel.js            純音訊模式的控制面板
js/captions/sync.js                句子定位、切句、停頓偵測、自動對齊、Sentence Object 轉換
js/translate/*.js                  翻譯 Provider（microsoft / gemini，可替換）
js/youtube/search.js               YouTube Data API（搜尋、影片、頻道、快取、配額錯誤）
js/views/*.js                      各頁面
js/store.js, js/i18n.js            本機資料、繁中／英文字典
data/demo/                         示範字幕
tools/                             字幕打點工具與原始資料
tests.html                         瀏覽器內單元測試
serve.ps1                          本機靜態伺服器
```

## 下一步建議

1. 部署到 HTTPS（例如 DGX + 正式憑證，或 Vercel），在 iPhone Safari／PWA 實機測試，特別是純音訊模式的背景與鎖屏播放。
2. 擴充更多授權音訊內容（例如 VOA 其他節目），並評估離線下載。
3. Next.js + Supabase 後端：登入、雲端同步、API Key 移到伺服器、搜尋快取。
