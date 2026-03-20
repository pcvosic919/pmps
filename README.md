# PMP System — 專案管理平台

> **Project Management Platform** — 整合售前、SR 管理、WBS、工時、結算的全流程 SaaS 系統

---

## 📋 系統簡介

PMP System 是針對 IT 服務商設計的全流程專案管理平台，覆蓋從 **商機售前 → 服務請求 → WBS/工時管理 → 成本結算** 的完整工作流，並提供 KPI 看板、通知與結算管理等正式模組。

---

## 🏗️ 技術架構

```
PMPsystem/
├── client/          # React 19 + Vite + TailwindCSS v4 (前端)
├── server/          # Express + tRPC v11 (後端 API)
├── server/models/   # Mongoose Models（唯一資料結構來源）
├── shared/          # 共用型別、Enum、Zod schema
└── pnpm-workspace   # pnpm monorepo
```

### 前端技術棧
| 套件 | 版本 | 用途 |
|---|---|---|
| React | 19.x | UI 框架 |
| Vite | 7.x | 建構工具 |
| TailwindCSS | 4.x | 樣式 |
| shadcn/ui | latest | UI 元件庫 |
| tRPC | 11.x | 型別安全 API Client |
| @tanstack/react-query | 5.x | 資料請求 + 分頁 |
| react-hook-form | 7.x | 表單管理 |
| zod | 3.22 | 資料驗證 |
| @hookform/resolvers | 2.9.11 | Zod 整合 |
| recharts | 3.x | 圖表 |
| wouter | 3.x | SPA 路由 |
| react-hot-toast | latest | 通知提示 |

### 後端技術棧
| 套件 | 版本 | 用途 |
|---|---|---|
| Express | 4.x | HTTP 伺服器 |
| tRPC | 11.x | 型別安全 API Server |
| MongoDB | 6.x+ | 正式唯一資料庫 |
| Mongoose | 8.x / 9.x | MongoDB ODM / Schema 定義 |
| dotenv | 16.x | 環境變數 |

---

## 🚀 快速開始

### 環境需求
- **Node.js** `>= 22.0.0`
- **pnpm** `>= 9.0.0`

### 安裝與啟動

```bash
# 安裝依賴
pnpm install

# 建立開發環境變數
cat <<'EOF' > .env
MONGODB_URI=mongodb://localhost:27017/pmp_system
JWT_SECRET=replace-with-a-long-random-secret
DEMO_LOGIN_ENABLED=true
EOF

# （可選）建立 Demo 資料
pnpm seed:demo

# 啟動開發伺服器 (前後端並行)
pnpm dev
```

開發伺服器啟動後：
- **前端**: http://localhost:5173
- **後端 API**: http://localhost:5000
- **健康檢查**: http://localhost:5000/api/health

### 其他指令

```bash
pnpm build         # 建置生產版本
pnpm typecheck     # TypeScript 型別檢查
pnpm seed:demo     # 寫入 MongoDB demo 資料
```

---

## 🐳 Docker 與 Azure 部署

本系統支援 Docker 容器化，並已整合 GitHub Actions 自動推送至 ACR (Azure Container Registry) 部署至 Azure App Service。

### 環境變數 (Environment Variables)
在生產環境 (如 Azure 控制台) 中，必須設定以下變數：
| 變數名稱 | 必填 | 說明 |
|---|---|---|
| `MONGODB_URI` | **是** | Cosmos DB / MongoDB 完整連線字串 (需啟動 SSL) |
| `JWT_SECRET` | **是** | JWT 與通知 SSE 短效 Token 簽章密鑰，未設定時服務不會啟動 |
| `DEMO_LOGIN_ENABLED` | 否 | 設為 `true` 時允許登入頁顯示並使用 Demo 快速登入（建議僅測試環境） |
| `GEMINI_API_KEY` | 否 | Google AI Studio 密鑰 (用於 AI 報表故事分析) |
| `PORT` | 否 | 容器 Port，預設為 `5000` |

### 打包與運作原理
1. 透過 `Dockerfile` 進行 Multi-stage Build。
2. 後端 Express 伺服器會**自動託管** `client/dist` 靜態檔案。
3. 支援 **SPA Fallback** 機制：非 `/api` 的 GET request 會自動導向 `index.html`。
4. 容器曝露連接埠（Port）為 `5000`。

---

---

## 📱 頁面路由

以下路由表以 `client/src/App.tsx` 的 route inventory 為唯一準則，並與側欄、頂部導覽保持同步。

### 正式上線路由

| 路徑 | 元件 | 狀態 | 說明 |
|---|---|---|---|
| `/` | `DashboardPage` | 上線 | 儀表板首頁 |
| `/resources` | `ResourcesPage` | 上線 | 資源池看板 |
| `/users` | `UserManagementPage` | 上線 | 用戶管理 (無限捲動) |
| `/cost-rates` | `CostRatesPage` | 上線 | 費率設定 |
| `/utilization` | `UtilizationPage` | 上線 | 稼動率看板 |
| `/settlements` | `SettlementsPage` | 上線 | 月度成本結算 |
| `/notifications` | `NotificationsPage` | 上線 | 通知中心 |
| `/system-settings` | `SystemSettingsPage` | 上線 | 系統設定 |
| `/custom-fields` | `CustomFieldsPage` | 上線 | 自訂欄位管理 |
| `/opportunities` | `OpportunitiesPage` | 上線 | 商機清單 (無限捲動) |
| `/opportunities/:id` | `OpportunityDetailPage` | 上線 | 商機詳情 + 成員管理 |
| `/projects` | `ProjectManagementPage` | 上線（限 Manager / PM） | 正式專案管理入口 |
| `/service-requests` | `ServiceRequestsPage` | 上線 | SR 服務請求清單 |
| `/service-requests/:id` | `WbsManagementPage` | 上線 | SR WBS 版本管理 |
| `/change-requests` | `ChangeRequestsPage` | 上線 | 變更請求審核 |
| `/presales-timesheets` | `PresalesTimesheetsPage` | 上線 | 協銷工時填報 |
| `/project-timesheets` | `ProjectTimesheetsPage` | 上線 | 專案工時填報 |
| `/kpi` | `KpiDashboardPage` | 上線 | KPI 分析儀表板 |
| `/login` | `LoginPage` | 上線 | 驗證入口，不顯示於主導覽 |

### 頁面檔存廢盤點

| 頁面檔 | 決策 | 路由 | 說明 |
|---|---|---|---|
| `DashboardPage.tsx` | 保留 / 上線 | `/` | 主儀表板首頁 |
| `ResourcesPage.tsx` | 保留 / 上線 | `/resources` | 資源池模組 |
| `UserManagementPage.tsx` | 保留 / 上線 | `/users` | 正式帳號管理頁 |
| `CostRatesPage.tsx` | 保留 / 上線 | `/cost-rates` | 費率設定 |
| `UtilizationPage.tsx` | 保留 / 上線 | `/utilization` | 稼動率分析 |
| `SettlementsPage.tsx` | 保留 / 上線 | `/settlements` | 月結模組 |
| `NotificationsPage.tsx` | 保留 / 上線 | `/notifications` | 通知中心 |
| `SystemSettingsPage.tsx` | 保留 / 上線 | `/system-settings` | 系統設定 |
| `CustomFieldsPage.tsx` | 保留 / 上線 | `/custom-fields` | 自訂欄位設定 |
| `OpportunitiesPage.tsx` | 保留 / 上線 | `/opportunities` | 商機清單 |
| `OpportunityDetailPage.tsx` | 保留 / 上線 | `/opportunities/:id` | 商機詳情 |
| `ProjectManagementPage.tsx` | 保留 / 上線 | `/projects` | 正式專案管理入口 |
| `ServiceRequestsPage.tsx` | 保留 / 上線 | `/service-requests` | SR 清單 |
| `WbsManagementPage.tsx` | 保留 / 上線 | `/service-requests/:id` | WBS 管理 |
| `ChangeRequestsPage.tsx` | 保留 / 上線 | `/change-requests` | CR 模組 |
| `PresalesTimesheetsPage.tsx` | 保留 / 上線 | `/presales-timesheets` | 協銷工時 |
| `ProjectTimesheetsPage.tsx` | 保留 / 上線 | `/project-timesheets` | 專案工時 |
| `KpiDashboardPage.tsx` | 保留 / 上線 | `/kpi` | KPI 儀表板 |
| `LoginPage.tsx` | 保留 / 上線 | `/login` | 登入頁 |
| `UsersPage.tsx` | 合併後移除 | — | 舊版帳號管理雛形，已由 `UserManagementPage.tsx` 取代 |
| `TimesheetsPage.tsx` | 合併後移除 | — | 已拆為協銷 / 專案工時兩個正式頁面 |
| `ReportStoryPage.tsx` | 正式移除 | — | AI 報表故事功能停用，不保留路由與文件 |

---

## 🗄️ 資料庫結構

正式環境以 **MongoDB + Mongoose** 為唯一真實來源（single source of truth）。所有資料結構定義集中於：

- `server/models/*.ts`：Mongoose schema / model
- `shared/types.ts`：共用 enum、型別與 Zod schema

目前主要集合/文件結構如下：

```
users                  # 使用者、技能、費率、成本歷程
opportunities          # 商機、成員、協銷指派、自訂欄位值
service_requests       # SR、附件、WBS 版本、變更請求
timesheets             # 協銷 / 專案工時
notifications          # 系統通知
settlementlocks        # 月結鎖定
systemsettings         # 系統設定
customfields           # 自訂欄位定義
```

> 註：舊版 Drizzle / SQLite schema 已移除，不再作為初始化流程或開發依據。
> 註：AI 報表故事與其他歷史頁面已自 route inventory 與檔案系統正式移除。

### 角色系統 (Roles)
```
admin      → 系統管理員
manager    → 部門主管
pm         → 專案經理
presales   → 售前工程師
tech       → 技術顧問
business   → 業務 (商機負責人)
user       → 一般用戶
```

---

## 🔌 API 路由 (tRPC Routers)

### `opportunities` — 商機管理
- `list` — 分頁查詢商機
- `getById` — 取得商機詳情
- `create` — 建立商機
- `updateStatus` — 更新商機狀態
- `assignPresales` — 指派協銷技術人員
- `logPresalesTime` — 記錄協銷工時
- `createSR` — 從商機建立 SR

### `projects` — 專案/SR 管理
- `listSRs` — 查詢 SR 清單
- `getSRById` — SR 詳情
- `getWbsVersions` — WBS 版本清單
- `submitWbsVersion` — 提交 WBS 版本審核
- `approveWbs` — 核准 WBS
- `logProjectTime` — 記錄專案工時
- `createCR` — 建立變更請求
- `listCRs` — 查詢變更請求

### `users` — 用戶管理
- `list` — 分頁查詢用戶
- `updateUser` — 更新用戶資料 (角色/部門/狀態)
- `createManual` — 手動建立用戶
- `deleteManual` — 刪除用戶
- `setCostRate` — 設定費率

### `analytics` — 分析與報表
- `getKpis` — KPI 指標彙整
- `getUtilization` — 稼動率資料
- `getSettlements` — 月結清單
- `getNotifications` — 通知清單

### `system` — 系統設定
- `getSettings` — 取得系統設定
- `updateSetting` — 更新設定

### `integrations` — 整合
- `syncEntra` — Microsoft Entra ID 同步 (骨架)

---

## 📂 前端結構

```
client/src/
├── components/
│   ├── AppLayout.tsx        # 左側導覽 + 整體布局
│   └── ui/                  # shadcn/ui 元件
│       ├── button.tsx
│       ├── dialog.tsx
│       ├── form.tsx
│       ├── input.tsx
│       ├── label.tsx
│       └── select.tsx
├── lib/
│   ├── trpc.ts              # tRPC client 設定
│   └── utils.ts             # cn() 工具函數
├── pages/                   # 正式上線頁面元件（已移除歷史佔位頁）
├── App.tsx                  # 根元件 + 路由
├── main.tsx                 # Entry point
└── index.css                # 全域樣式 + Tailwind
```

---

## ⚙️ 後端結構

```
server/
├── _core/
│   └── trpc.ts              # tRPC router/procedure 定義 + context
├── routers/
│   ├── opportunities.ts
│   ├── projects.ts
│   ├── users.ts
│   ├── analytics.ts
│   ├── system.ts
│   └── integrations.ts
├── db.ts                    # MongoDB 連線入口
├── models/                  # Mongoose models
└── index.ts                 # Express 入口 + 健康檢查
```

---

## 🔐 認證機制 (目前)

目前前端會將登入成功取得的 JWT 儲存於 `localStorage`，並在呼叫 API 時帶入：
```
Authorization: Bearer <pmp_auth_token>
```

伺服器端會驗證 JWT，還原使用者資訊並放入 `ctx.user`；tRPC `protectedProcedure` 以此判斷是否登入，`roleProcedure` 額外驗證角色。

### 支援的登入方式
- **帳密登入**：手動帳號使用 email + password。
- **Microsoft Entra ID**：以 Microsoft Access Token 換取本系統 JWT。
- **Demo 快速登入**：測試/開發環境可直接選擇預設角色，一鍵取得 JWT；需先執行 `pnpm seed:demo` 建立 Demo 帳號。

### Demo 帳號
- `demo_admin@demo.com`
- `demo_manager@demo.com`
- `demo_business@demo.com`
- `demo_pm@demo.com`
- `demo_tech@demo.com`

> 預設 Demo 密碼：`password123`

> ⚠️ `DEMO_LOGIN_ENABLED` 建議只在測試環境開啟；正式環境請關閉。
> ⚠️ 若缺少 `JWT_SECRET`，登入 API 會拒絕簽發 Token，前端將只顯示通用錯誤訊息，不會直接暴露內部環境變數名稱。

### 如何啟用 Demo 快速登入

#### 本機開發
```bash
cat <<'EOF' >> .env
DEMO_LOGIN_ENABLED=true
JWT_SECRET=replace-with-a-long-random-secret
MONGODB_URI=mongodb://localhost:27017/pmp_system
EOF

pnpm seed:demo
pnpm dev
```

#### Azure App Service
1. 進入 **App Service → Settings → Environment variables**。
2. 新增或確認：
   - `DEMO_LOGIN_ENABLED=true`
   - `JWT_SECRET=<長且隨機的密鑰>`
   - `MONGODB_URI=<MongoDB / Cosmos DB 連線字串>`
3. 儲存後重新啟動 App Service。
4. 確保資料庫中已建立 Demo 帳號（可先在可連線資料庫的環境執行 `pnpm seed:demo`）。

---

## 👩‍💻 使用者操作指引

### 首次登入
1. 管理員先確認 `.env` / App Service 已設定 `MONGODB_URI` 與 `JWT_SECRET`。
2. 若是測試環境，可點選登入頁的 **Demo 快速登入**。
3. 若是正式環境，請使用手動帳號密碼或 Microsoft Entra ID。

### 導覽與首頁
- 側邊欄已依功能分組為「工作台 / 商機售前 / 專案工時 / 分析結算 / 系統管理」。
- 手機版可透過左上角漢堡選單展開導覽。
- 頂部頭像選單可進入通知中心、系統設定與登出。

### 通知與待辦
- 通知中心支援未讀數與即時更新。
- 首頁會顯示待審核、待辦與風險提醒，協助快速進入高優先項目。

### KPI 儀表板
- 可切換顯示模組。
- 支援將目前 KPI 指標匯出為 CSV，方便彙整報表。

---

## 🛠️ 開發注意事項

### 套件版本固定
- `zod` 鎖定 `^3.22.4`，`@hookform/resolvers` 鎖定 `2.9.11`（高版本不相容）
- MongoDB / Mongoose 是唯一資料路徑；新增或修改資料結構時，請只更新 `server/models/*.ts` 與 `shared/types.ts`

### shadcn/ui 安裝
元件位於 `client/src/components/ui/`，需透過以下方式安裝：
```bash
cd client
npx shadcn@latest add [component]
# 注意：生成的檔案若在 @/ 路徑下需手動移至 src/components/ui/
```

### 分頁/無限捲動
- `users.list` 與 `opportunities.list` 均支援 `limit` + `cursor` 分頁
- 前端使用 `useInfiniteQuery` 實作無限捲動
- 非無限捲動頁面請加上 `{ limit: 100 }` 參數

---

## 📄 授權

Private — All Rights Reserved
