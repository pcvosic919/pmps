# PMP System — 專案管理平台

> **Project Management Platform** — 整合售前、SR 管理、WBS、工時、結算的全流程 SaaS 系統

---

## 📋 系統簡介

PMP System 是針對 IT 服務商設計的全流程專案管理平台，覆蓋從 **商機售前 → 服務請求 → WBS/工時管理 → 成本結算** 的完整工作流，並提供 KPI 看板與 AI 報表故事功能。

---

## 🏗️ 技術架構

```
PMPsystem/
├── client/          # React 19 + Vite + TailwindCSS v4 (前端)
├── server/          # Express + tRPC v11 (後端 API)
├── drizzle/         # Drizzle ORM + SQLite (資料庫結構)
├── shared/          # 共用型別與 Enum
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
| Drizzle ORM | 0.36.4 | SQLite ORM (繼承/關聯資料) |
| Mongoose | 8.x | Cosmos DB / MongoDB (模型驅動/即時通知) |
| @libsql/client | 0.17 | SQLite 驅動 |
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

# 初始化資料庫結構
pnpm db:push

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
pnpm db:studio     # 開啟 Drizzle Studio (資料庫視覺化)
pnpm db:push       # 推送 schema 到資料庫
```

---

## 🐳 Docker 與 Azure 部署

本系統支援 Docker 容器化，並已整合 GitHub Actions 自動推送至 ACR (Azure Container Registry) 部署至 Azure App Service。

### 環境變數 (Environment Variables)
在生產環境 (如 Azure 控制台) 中，必須設定以下變數：
| 變數名稱 | 必填 | 說明 |
|---|---|---|
| `MONGODB_URI` | **是** | Cosmos DB / MongoDB 完整連線字串 (需啟動 SSL) |
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

| 路徑 | 元件 | 說明 |
|---|---|---|
| `/` | `DashboardPage` | 儀表板首頁 |
| `/opportunities` | `OpportunitiesPage` | 商機清單 (無限捲動) |
| `/opportunities/:id` | `OpportunityDetailPage` | 商機詳情 + 成員管理 |
| `/resources` | `ResourcesPage` | 資源池看板 |
| `/service-requests` | `ServiceRequestsPage` | SR 服務請求清單 |
| `/service-requests/:id` | `WbsManagementPage` | SR WBS 版本管理 |
| `/change-requests` | `ChangeRequestsPage` | 變更請求審核 |
| `/presales-timesheets` | `PresalesTimesheetsPage` | 協銷工時填報 |
| `/project-timesheets` | `ProjectTimesheetsPage` | 專案工時填報 |
| `/users` | `UserManagementPage` | 用戶管理 (無限捲動) |
| `/cost-rates` | `CostRatesPage` | 費率設定 |
| `/utilization` | `UtilizationPage` | 稼動率看板 |
| `/kpi` | `KpiDashboardPage` | KPI 分析儀表板 |
| `/settlements` | `SettlementsPage` | 月度成本結算 |
| `/notifications` | `NotificationsPage` | 通知中心 |
| `/system-settings` | `SystemSettingsPage` | 系統設定 |
| `/custom-fields` | `CustomFieldsPage` | 自訂欄位管理 |
| `/reportstory` | `ReportStoryPage` | AI 報表故事 |

---

## 🗄️ 資料庫結構

Drizzle ORM (SQLite)，共 **20 張資料表**：

```
users                  # 使用者 (支援 manual / oauth / entra)
skill_categories       # 技能分類
user_skills            # 使用者技能等級
cost_rates             # 每日/每小時費率
opportunities          # 商機
opportunity_members    # 商機成員
presales_assignments   # 協銷指派
presales_timesheets    # 協銷工時
presales_settlements   # 協銷月結算
service_requests       # 服務請求 (SR)
sr_members             # SR 成員
sr_attachments         # SR 附件
wbs_versions           # WBS 版本 (支援審核流程)
wbs_items              # WBS 工作項目
project_timesheets     # 專案工時
change_requests        # 變更請求
notifications          # 系統通知
monthly_settlements    # 月度結算 (專案)
system_settings        # 系統設定鍵值對
custom_fields          # 自訂欄位定義
custom_field_values    # 自訂欄位值
```

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
├── pages/                   # 20 個頁面元件
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
├── db.ts                    # Drizzle DB 連線
└── index.ts                 # Express 入口 + 健康檢查
```

---

## 🔐 認證機制 (目前)

目前使用 **Demo 模式**，前端 HTTP 請求固定帶入：
```
Authorization: Bearer demo_admin@demo.com
```

伺服器端從 Header 解析 email，查詢後放入 `ctx.user`，tRPC `protectedProcedure` 以此判斷是否登入，`roleProcedure` 額外驗證角色。

> ⚠️ 生產環境需替換為真實 JWT/OAuth 驗證機制。

---

## 🛠️ 開發注意事項

### 套件版本固定
- `zod` 鎖定 `^3.22.4`，`@hookform/resolvers` 鎖定 `2.9.11`（高版本不相容）
- `drizzle-orm` 鎖定 `0.36.4`，`drizzle-kit` 鎖定 `0.28.0`

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
