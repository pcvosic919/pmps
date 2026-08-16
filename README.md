# PMP System — 專案管理平台

> **Project Management Platform** — 整合售前、SR 管理、WBS、工時、結算、報表、Calendar、公司主檔、文件目錄與 SharePoint/本機儲存的全流程系統

[![Status](https://img.shields.io/badge/Status-Active_Development-success?style=for-the-badge)](https://github.com/pcvosic919/pmps)
[![Stack](https://img.shields.io/badge/Stack-React_19_|_TRPC_|_MongoDB-blue?style=for-the-badge)](https://github.com/pcvosic919/pmps)

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
| Radix UI / 自訂元件 | latest | Dialog、Select、Form 等 UI 元件 |
| tRPC | 11.x | 型別安全 API Client |
| @tanstack/react-query | 5.x | 資料請求 + 分頁 |
| react-hook-form | 7.x | 表單管理 |
| zod | 3.x | 資料驗證 |
| @hookform/resolvers | 5.x | Zod 整合 |
| recharts | 3.x | 專案報表與稼動率動態圖表 |
| lucide-react | latest | 圖示系統 |
| i18next | latest | 多語系支援 (zh-TW/en) |
| wouter | 3.x | SPA 路由 |
| react-hot-toast | latest | 通知提示 | 

### 後端技術棧
| 套件 | 版本 | 用途 |
|---|---|---|
| Express | 4.x | HTTP 伺服器 |
| tRPC | 11.x | 型別安全 API Server |
| MongoDB | 4.4+ / 6.x+ | 正式唯一資料庫；Docker compose 預設使用 `mongo:4.4` |
| Mongoose | 9.x | MongoDB ODM / Schema 定義 |
| dotenv | 16.x | 環境變數 |

---

## 🚀 快速開始

### 環境需求
- **Node.js** `>= 22.0.0`
- **pnpm** `>= 9.0.0`
- **MongoDB**：本機開發預設 `mongodb://localhost:27017/pmp_system`；Docker compose 會另外啟動 MongoDB，主機對外 port 為 `27018`
- **Docker / Docker Compose**：Ubuntu 部署建議使用

### 本機開發啟動

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

### Ubuntu + Docker 啟動

目前 `docker-compose.yml` 會啟動兩個服務：
- `mongodb`：容器內 `27017`，主機對外 `27018`
- `web`：使用 `network_mode: "host"`，後端服務聽 `5000`

```bash
# 第一次部署
git clone https://github.com/pcvosic919/pmps.git
cd pmps

# Docker compose 會讀取 .env 進行變數替換；至少請設定 JWT_SECRET
cat <<'EOF' > .env
JWT_SECRET=replace-with-a-long-random-secret
EOF

docker compose up -d --build
docker compose ps
curl http://127.0.0.1:5000/api/health
```

Docker 啟動後：
- **系統入口**: http://伺服器IP:5000
- **健康檢查**: http://伺服器IP:5000/api/health
- **MongoDB**: `mongodb://127.0.0.1:27018/pmp_system`

> 注意：`web` 服務使用 host network，適合 Ubuntu/Linux 伺服器。若改成 bridge network，需要同步調整 `docker-compose.yml` 裡的 `MONGODB_URI`，例如改成 `mongodb://mongodb:27017/pmp_system`。

#### Docker 啟用 Demo 登入

Docker image 內 `NODE_ENV=production`，因此 Demo 快速登入預設不會自動開啟。若測試環境需要 Demo，請在 `docker-compose.yml` 的 `web.environment` 加上：

```yaml
- DEMO_LOGIN_ENABLED=true
```

正式環境請不要開啟 Demo 登入。

#### 本機路徑 / SMB 網路磁碟

系統的「自動建立文件目錄」可在 **系統設定 → 自動建立文件目錄** 切換：
- `SharePoint`
- `本機路徑`
- `停用`

若 Ubuntu 已掛載 SMB 網路磁碟，建議用 Docker volume 掛到容器內固定路徑，例如：

```yaml
services:
  web:
    volumes:
      - /mnt/pmps-documents:/app/storage/documents
```

然後在系統設定填入：

```text
/app/storage/documents
```

建立商機或專案時，系統會依此設定自動建立 `商機/` 或 `專案/` 子目錄。請確認 Ubuntu 掛載點與 Docker 容器都有寫入權限。

### 其他指令

```bash
pnpm build         # 建置生產版本
pnpm typecheck     # TypeScript 型別檢查
pnpm seed:demo     # 寫入 MongoDB demo 資料
```

### Excel 匯入：未結案清單與 KPI 認列/Pipeline

本系統支援將既有 Excel 報表匯入 MongoDB，供儀表板與自訂報表使用。Ubuntu Docker 部署時，建議將來源檔掛載到容器內 `/app/imports` 後執行：

```bash
# 未結案清單：處理人員管理(全)_未結案清單_*.xlsx
docker compose run --rm web \
  node server/dist/server/scripts/import-open-dispatch-cases.js \
  /app/imports/處理人員管理_未結案清單.xlsx

# 年度目標/實際認列/Pipeline：IE0C00 2026年度目標達成狀況_*.xlsx
docker compose run --rm web \
  node server/dist/server/scripts/import-kpi-revenue.js \
  /app/imports/IE0C00_2026年度目標達成狀況.xlsx
```

匯入後：
- 「自訂報表」可匯出 `未結案清單` 與 `年度目標/認列/Pipeline` Excel。
- 「專案管理」會顯示匯入專案編號、服務類型、處理人員工時摘要。
- 「KPI 儀表板」會合併匯入的實際認列收入與 Pipeline 預估。

---

## 🐳 Docker / Ubuntu / Azure 部署

本系統支援 Docker 容器化。此 repository 目前提供 `Dockerfile` 與 `docker-compose.yml`，可在 Ubuntu 伺服器上以 Docker Compose 部署；若要部署至 Azure App Service / ACR，可沿用同一個 Dockerfile。

### 環境變數 (Environment Variables)
在生產環境 (如 Azure 控制台) 中，必須設定以下變數：
| 變數名稱 | 必填 | 說明 |
|---|---|---|
| `MONGODB_URI` | **是** | MongoDB 完整連線字串。Docker compose 預設為 `mongodb://127.0.0.1:27018/pmp_system`；Cosmos DB 建議在路徑指定 database，例如 `/pmp_system` |
| `MONGODB_DB_NAME` | 否 | 明確指定 MongoDB database；Cosmos DB 連線字串未包含 database 路徑時會預設使用 `pmp_system`，避免落到 `test` database |
| `JWT_SECRET` | **是** | JWT 與通知 SSE 短效 Token 簽章密鑰，未設定時服務不會啟動 |
| `AUDIT_IP_HASH_SALT` | 否 | Audit 使用者互動紀錄的 IP 雜湊 salt；正式環境建議設定獨立且穩定的高強度字串 |
| `DEMO_LOGIN_ENABLED` | 否 | 設為 `true` 時允許登入頁顯示並使用 Demo 快速登入（建議僅測試環境） |
| `BREAKGLASS_ENABLED` | 否 | Platform Owner 緊急登入開關，預設為啟用；正式確認資料庫帳號可用後建議設為 `false` |
| `BREAKGLASS_EMAIL` | 否 | 緊急登入帳號，預設為 `adminpmp@demo.com` |
| `BREAKGLASS_PASSWORD_HASH` | 否 | 可覆寫緊急登入的後端 scrypt 雜湊；不得提供給前端或寫入公開文件 |
| `API_ENCRYPTION_KEY` | 否 | 若設定，前後端 tRPC payload 會以此 key 加解密 |
| `REQUEST_BODY_LIMIT` | 否 | Express JSON body 上限，預設 `50mb`，Excel/附件匯入較大時可調整 |
| `ENTRA_ENABLED` | 否 | 設為 `true` 可作為 Entra ID 開關的後備值；正式建議仍由系統設定頁維護 |
| `ENTRA_CLIENT_ID` | 否 | Entra ID SSO Client ID 後備值 |
| `ENTRA_CLIENT_SECRET` | 否 | Entra ID 帳號同步 Client Secret 後備值 |
| `ENTRA_TENANT_ID` | 否 | Entra ID Tenant ID 後備值 |
| `GEMINI_API_KEY` | 否 | Google AI Studio 密鑰；僅使用 AI 分析功能時需要 |
| `COPILOT_API_KEY` | 否 | Copilot Studio REST API 安全驗證密鑰 (`X-API-KEY`)；只有啟用 `/api/v1` 外部機器人存取時需要 |
| `GRAPH_API_SECRET` | 否 | Microsoft Graph API 祕鑰 (SharePoint 整合用) |
| `SHAREPOINT_DOMAIN` | 否 | SharePoint fallback domain；未設定時使用 `contoso.sharepoint.com` 作為 placeholder |
| `PORT` | 否 | 容器 Port，預設為 `5000` |
| `MONGOOSE_AUTO_CREATE` | 否 | 是否允許 Mongoose 在 App 啟動時自動建立 collection；Cosmos DB 端點預設為 `false`，避免免費方案啟動時一次建立多個 400 RU/s container。這不會停用資料儲存；只要 collections 已由 `pnpm db:prepare` 建好，App 仍會正常讀寫資料。 |
| `MONGOOSE_AUTO_INDEX` | 否 | 是否允許 Mongoose 在 App 啟動時自動建立/同步 index；Cosmos DB 端點預設為 `false`，需要時可搭配 `pnpm db:prepare` 手動同步 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | 否 | 系統寄信功能使用；未設定時不影響核心專案管理流程 |

### Azure Cosmos DB for MongoDB 免費方案注意事項
Cosmos DB 免費方案常見總吞吐量上限為 1000 RU/s；若每個 collection/container 都使用獨立 400 RU/s，建立第 3 個 container 時會嘗試把總量提高到 1200 RU/s，因而出現 `BadRequest (400)` / `Substatus: 1028`。建議做法：

1. 建立或更新 **database-level shared throughput**，將資料庫層級 RU/s 設為免費方案可承載的數值（例如 1000 RU/s），不要讓每個 collection 各自配置 400 RU/s。建議使用本專案提供的 Azure CLI 包裝指令；它會先設定 database shared throughput，再建立本系統需要的 collections，且建立 collection 時刻意不傳 `--throughput`，避免變成 dedicated-throughput container：
   ```bash
   AZURE_RESOURCE_GROUP=<resource-group> \
   COSMOS_ACCOUNT_NAME=<cosmos-account-name> \
   COSMOS_DATABASE_NAME=pmp_system \
   COSMOS_SHARED_THROUGHPUT=1000 \
   pnpm cosmos:shared-throughput
   ```
2. 確認 `MONGODB_URI` 指向同一個 database（例如包含 `/pmp_system?...`），或設定 `MONGODB_DB_NAME=pmp_system`。若 Cosmos 連線字串沒有指定 database，後端會使用 `pmp_system`，避免 Mongoose 預設落到 `test` database。
3. 部署環境保留預設的 Cosmos 偵測行為，或明確設定 `MONGOOSE_AUTO_CREATE=false`、`MONGOOSE_AUTO_INDEX=false`，避免 App Service 啟動時由 Mongoose 自動建立 container/index 而超過 RU 上限。這不是關閉資料儲存，而是把「建 container」改成由管理員用下一步手動執行一次。
4. 資料庫層級 shared throughput 設定完成後，執行 `pnpm db:prepare` 依序建立系統需要的 collections；若需要同步 index，另外設定 `DB_PREPARE_SYNC_INDEXES=true pnpm db:prepare`。

本系統需要的 Cosmos DB for MongoDB collections/containers 如下，`pnpm db:prepare` 會依序確認並建立，不需要在 Azure Portal 一個一個手動新增：

| Collection / Container | 主要資料 |
|---|---|
| `users` | 使用者、角色與帳號狀態 |
| `companies` | 公司主檔與商機客戶選擇來源 |
| `opportunities` | 商機資料 |
| `servicerequests` | 專案/服務請求、WBS、變更請求、附件中繼資料 |
| `timesheets` | 工時資料 |
| `calendartasks` | 舊版 Calendar 排程（遷移後保留供回復） |
| `scheduleblocks` | 每人每日 AM／PM／全天正式排程 |
| `schedulemanagernotes` | 主管排程標記與通知關聯 |
| `schedulerevisions` | 個人排程批次儲存修訂號 |
| `issues` | 問題與風險 |
| `notifications` | 系統通知 |
| `settlementlocks` | 結算鎖定紀錄 |
| `settlementsnapshots` | 月結快照 |
| `settlementauditlogs` | 月結稽核紀錄 |
| `revenuesnapshots` | 營收認列 / Pipeline 匯入快照 |
| `kpitargets` | 年度 KPI 部門/個人目標 |
| `kpipolicies` | KPI 治理與 Pipeline 權重 |
| `importbatches` | Excel 匯入批次紀錄 |
| `reporttemplates` | 自訂報表樣板 |
| `customfields` | 自訂欄位設定 |
| `systemsettings` | 系統設定 |

> 若 `test` 或其他既有 database 已經建立了 dedicated-throughput collections，建議先建立新的 shared-throughput database（例如 `pmp_system`），把 `MONGODB_URI` / `MONGODB_DB_NAME` 指過去後再執行 `pnpm db:prepare`，避免沿用會繼續佔用獨立 RU/s 的舊 collections。

#### 不增加 Cosmos DB 成本的修復流程
收到 `total throughput limit of 1000 RU/s`、`would have increased the total throughput to 1200 RU/s` 或 `Substatus: 1028` 時，請不要提高帳戶 RU/s 上限；改用下列方式讓系統維持在免費額度內：

1. **停止目前的建立流程與 App Service 自動建置**：確認部署環境保留 `MONGOOSE_AUTO_CREATE=false`、`MONGOOSE_AUTO_INDEX=false`，避免服務啟動時繼續建立 dedicated-throughput containers；這不影響已存在 collections 的資料讀寫。
2. **釋放已佔用的 dedicated RU/s**：若錯誤前剛建立的 collections 尚未有正式資料，先在 Azure Portal 或 Azure CLI 刪除這些 dedicated-throughput collections；每個 collection 通常會釋放 400 RU/s。正式資料請先匯出或備份，不要直接刪除。
3. **建立新的 shared-throughput database（最安全）**：用不同 database 名稱（例如 `pmp_system_shared`）建立 1000 RU/s database-level shared throughput，將 `MONGODB_DB_NAME` 或 `MONGODB_URI` 路徑切到新 database，再執行 `pnpm db:prepare`。這會建立上表列出的 collections，之後 App 就能正常儲存資料。
4. **或改造空的既有 database**：如果目前 database 沒有要保留的資料，可清空 dedicated collections 後，執行 `COSMOS_SHARED_THROUGHPUT=1000 pnpm cosmos:shared-throughput`，再重跑 `pnpm db:prepare`。
5. **降低尖峰而非擴容**：匯入/seed 資料時採小批次、重試 429、錯開排程，避免短時間消耗 RU/s；這不改變帳戶上限，也不產生額外 Cosmos DB 吞吐量成本。

### 打包與運作原理
1. 透過 `Dockerfile` 進行 Multi-stage Build。
2. 後端 Express 伺服器會**自動託管** `client/dist` 靜態檔案。
3. 支援 **SPA Fallback** 機制：非 `/api` 的 GET request 會自動導向 `index.html`。
4. 容器曝露連接埠（Port）為 `5000`。

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
| `/companies` | `CompanyManagementPage` | 上線 | 公司主檔管理與商機客戶選擇來源 |
| `/opportunities` | `OpportunitiesPage` | 上線 | 商機清單 (無限捲動) |
| `/opportunities/:id` | `OpportunityDetailPage` | 上線 | 商機詳情 + 成員管理 |
| `/projects` | `ProjectManagementPage` | 上線（權限控管） | 正式專案管理入口，Admin / Manager / PM / Tech 可檢視 |
| `/pm-dashboard` | `PmDashboardPage` | 上線 | 專案高階儀表板與卡片看板 |
| `/calendar` | `CalendarPage` | 上線 | 個人 AM／PM 排程、團隊負載與配置缺口 |
| `/service-requests` | `ServiceRequestsPage` | 上線 | SR 服務請求清單 |
| `/service-requests/:id` | `WbsManagementPage` | 上線 | SR WBS 版本管理 |
| `/change-requests` | `ChangeRequestsPage` | 上線 | 變更請求審核 |
| `/presales-timesheets` | `PresalesTimesheetsPage` | 上線 | 協銷工時填報 |
| `/project-timesheets` | `ProjectTimesheetsPage` | 上線 | 專案工時填報 |
| `/reports` | `ReportBuilderPage` | 上線 | 報表產生器 (含 Recharts 視覺化) |
| `/kpi` | `KpiDashboardPage` | 上線 | KPI 分析儀表板 |
| `/formula/profit-center` | `ProfitCenterFormulaPage` | 上線 | 利潤中心公式、年度 KPI 目標與 Pipeline 權重設定 |
| `/profit-center-report` | `ProfitCenterReportPage` | 上線 | 利潤中心業績結算儀表板 |
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
| `CompanyManagementPage.tsx` | 保留 / 上線 | `/companies` | 公司主檔管理 |
| `OpportunitiesPage.tsx` | 保留 / 上線 | `/opportunities` | 商機清單 |
| `OpportunityDetailPage.tsx` | 保留 / 上線 | `/opportunities/:id` | 商機詳情 |
| `ProjectManagementPage.tsx` | 保留 / 上線（權限控管） | `/projects` | 正式專案管理入口 |
| `PmDashboardPage.tsx` | 保留 / 上線 | `/pm-dashboard` | 專案高階儀表板 |
| `CalendarPage.tsx` | 保留 / 上線 | `/calendar` | 排程與人力入口 |
| `ServiceRequestsPage.tsx` | 保留 / 上線 | `/service-requests` | SR 清單 |
| `WbsManagementPage.tsx` | 保留 / 上線 | `/service-requests/:id` | WBS 管理 |
| `ChangeRequestsPage.tsx` | 保留 / 上線 | `/change-requests` | CR 模組 |
| `PresalesTimesheetsPage.tsx` | 保留 / 上線 | `/presales-timesheets` | 協銷工時 |
| `ProjectTimesheetsPage.tsx` | 保留 / 上線 | `/project-timesheets` | 專案工時 |
| `ReportBuilderPage.tsx` | 保留 / 上線 | `/reports` | 自訂報表產生與匯出 |
| `KpiDashboardPage.tsx` | 保留 / 上線 | `/kpi` | KPI 儀表板 |
| `ProfitCenterFormulaPage.tsx` | 保留 / 上線 | `/formula/profit-center` | 利潤中心公式與 KPI 設定 |
| `ProfitCenterReportPage.tsx` | 保留 / 上線 | `/profit-center-report` | 利潤中心業績結算儀表板 |
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
users                  # 使用者、角色、技能、費率、登入紀錄
companies              # 公司主檔與客戶名稱來源
opportunities          # 商機、成員、協銷指派、自訂欄位值、附件
servicerequests        # SR / 專案、附件、WBS 版本、變更請求、成員
calendartasks          # 舊版 Calendar 排程（唯讀保留）
scheduleblocks         # 每日 AM / PM / 全天排程
schedulemanagernotes   # 主管排程標記
schedulerevisions      # 排程批次版本控制
issues                 # 專案議題、優先級、處理狀態
timesheets             # 協銷 / 專案 / 其他活動工時
notifications          # 系統通知
settlementlocks        # 月結鎖定
settlementsnapshots    # 月結快照
settlementauditlogs    # 月結稽核紀錄
revenuesnapshots       # 年度目標認列 / Pipeline 匯入資料
kpitargets             # KPI 年度部門與個人目標
kpipolicies            # KPI 資料來源定義與 Pipeline 權重
importbatches          # 匯入批次紀錄
reporttemplates        # 自訂報表樣板
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
- `getMembers` / `addMember` / `removeMember` — 商機成員管理
- `create` — 建立商機
- `updateStatus` — 更新商機狀態
- `updateSalesOwner` — 更新業務與業務部門
- `uploadAttachment` — 上傳商機附件
- `assignPresales` — 指派協銷技術人員
- `logPresalesTime` — 記錄協銷工時
- `createSR` — 從商機建立 SR

### `projects` — 專案/SR 管理
- `srList` — 查詢 SR / 專案清單
- `srById` — SR 詳情與 WBS 版本
- `createSR` — 手動建立 SR / 專案 / 其他活動
- `getSrMembers` / `addSrMember` / `removeSrMember` — 專案參與人員與觀察者管理
- `updateSRStatus` — 更新 SR 狀態
- `updateSalesOwner` — 更新專案業務
- `updateFinalPrice` — 更新最終價格
- `submitWbsVersion` — 提交 WBS 版本審核
- `reviewWbsVersion` — 跨部門 WBS 核准 / 退回
- `scheduleWbsItem` / `updateWbsItemSchedule` — WBS 排程
- `createCalendarTask` / `updateCalendarTaskSchedule` — Calendar 手動任務
- `schedule.listMine` / `schedule.listSources` — 個人排程與可排來源
- `schedule.previewChanges` / `schedule.commitChanges` — 草稿檢查與批次儲存
- `schedule.getCapacityMatrix` — 團隊忙碌、配置與缺口矩陣
- `schedule.createManagerNote` — 主管標記與通知
- `generateWbsQuote` — WBS 轉報價單資料
- `logProjectTime` — 記錄專案工時
- `createCr` / `crList` / `reviewCr` — 變更請求
- `uploadSrAttachment` / `srAttachmentsList` — 專案附件
- `delete` — 刪除 SR（僅 Platform Owner 可執行高風險刪除）

### `users` — 用戶管理
- `list` — 分頁查詢用戶
- `pmList` / `techList` / `presalesList` / `resourceList` — 依角色取得人員清單
- `activeUsers` — 取得曾登入的活躍帳號
- `updateUser` — 更新用戶資料 (角色/部門/狀態)
- `createManual` — 手動建立用戶
- `deleteManual` — 刪除用戶
- `updateCostRate` / `updateBatchCostRates` — 設定費率
- `syncEntraUsers` / `clearAllEntraUsers` — Entra ID 同步與清理

### `companies` — 公司管理
- `list` — 查詢公司主檔
- `create` — 新增公司
- `bulkUpsert` — Excel 匯入 / 批次更新公司
- `update` — 更新公司
- `delete` — 刪除公司

### `analytics` — 分析與報表
- `getKpiData` — KPI 指標彙整
- `getUtilization` — 稼動率資料
- `getSettlements` — 月結清單
- `lockSettlement` / `unlockSettlement` — 月結鎖定與解除
- `getKpiGovernance` / `updateKpiPolicy` / `upsertKpiTarget` — KPI 目標、資料來源與 Pipeline 權重
- `getReportCatalog` / `generateReport` — 自訂報表目錄與匯出資料
- `getOpenCasesDashboard` / `getKpiRevenueDashboard` — 未結案與年度目標認列儀表板
- `getProfitCenterReport` — 利潤中心報表
- `getNotifications` — 通知清單

### `system` — 系統設定
- `getSettings` — 取得系統設定
- `updateSettings` — 更新設定
- `getCustomFields` / `createCustomField` / `updateCustomField` / `deleteCustomField` — 自訂欄位
- `listSharePointFiles` / `ensureSharePointFolder` / `testSharePointFolder` — SharePoint 文件目錄相關操作

### `auth` — 登入與身分
- `login` — 帳密登入
- `demoLogin` / `demoStatus` — Demo 登入
- `entraConfig` / `entraLogin` — Microsoft Entra ID 登入
- `me` — 目前登入使用者
- `streamToken` — 通知 SSE Token

### `issues` — 專案議題
- `listBySr` — 查詢專案議題
- `create` — 建立議題
- `update` — 更新議題
- `delete` — 刪除議題

### `integrations` — 整合
- `uploadDocument` — 舊版整合測試 stub；正式附件上傳以 `opportunities.uploadAttachment` / `projects.uploadSrAttachment` 為主

### 🤖 `Copilot REST API (v1)` — AI 機器人對接 (非 tRPC)
- `GET /api/v1/projects/active` — 提供給 Copilot 的進行中專案清單 (RAG 最佳化)
- `GET /api/v1/opportunities/won` — 最近成交商機清單查詢
- `GET /api/v1/issues/critical` — 暴露關鍵風險議題供 AI 回答專案狀態
- `X-API-KEY` — 獨立於 JWT 的機器對機器驗證機制

---

## 📂 前端結構

```
client/src/
├── components/
│   ├── AppLayout.tsx        # 左側導覽 + 整體布局
│   └── ui/                  # Radix UI / 自訂基礎元件
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
├── api/v1/
│   └── routes.ts            # Copilot / 外部系統 REST API
├── routers/
│   ├── auth.ts
│   ├── opportunities.ts
│   ├── projects.ts
│   ├── users.ts
│   ├── analytics.ts
│   ├── system.ts
│   ├── companies.ts
│   ├── issues.ts
│   └── integrations.ts
├── db.ts                    # MongoDB 連線入口
├── models/                  # Mongoose models
├── services/                # SharePoint / 本機文件目錄服務
├── scripts/                 # Excel 匯入腳本
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
- `adminpmp@demo.com`（Platform Owner，既有密碼雜湊由遷移工具保留）
- `demo_admin@demo.com`
- `demo_manager@demo.com`
- `demo_business@demo.com`
- `demo_presales@demo.com`
- `demo_pm@demo.com`
- `demo_tech@demo.com`
- `demo_presales2@demo.com`

> Demo 密碼不寫入前端或版本庫。執行 `seed:demo` 前請透過 `DEMO_PASSWORD` 環境變數提供；既有 Platform Owner 遷移則保留原密碼雜湊。

> `adminpmp@demo.com` 同時提供資料庫無法連線時的 Break-glass 登入。前端只預填帳號，密碼僅由後端雜湊驗證；確認正式資料庫帳號可正常使用後，請以 `BREAKGLASS_ENABLED=false` 關閉緊急入口。

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

## 💡 使用情境與全流程工作流

本系統專為 IT 服務公司的專案全生命週期打造，以下為主要的使用情境與工作流程：

### 1️⃣ 商機與協銷 (Sales & Presales)
- **情境**：業務人員 (`business`) 在客戶端發掘到一個潛在專案，於系統內建立一個「商機 (Opportunity)」。
- **動作**：部門主管 (`manager`) 或商機負責人可以在詳情頁中「新增指派」技術人員或售前人員 (`presales`/`tech`) 進駐協助寫標案、開會。
- **紀錄**：被指派的人員可以使用「協銷工時」填報在該商機上投入的操作時長與內容。

### 2️⃣ 轉案與專案管理 (Opportunity to SR Transition)
- **情境**：商機中標或客戶確認下單。
- **動作**：售前人員可在詳情頁點選「一鍵建立報價單 / 專案」，將商機轉換為服務請求（Service Request, SR）。
- **流程**：系統會自動將商機狀態轉為「已轉案」，並將商機中的協銷人員與繼承成員一併同步至專案 `members`。
- **規劃**：進入「專案管理」中點選該 SR，PM 可以進入 **WBS 視圖** 建立項目與分配各項工作事項、工時估計。

### 3️⃣ 執行、工時、變更 (Execution & Control)
- **情境**：專案正式開工，人員開始製作、填工時。
- **動作**：人員於「專案工時」維護實際投入工時。
- **變更**：如有範圍異動，PM 或負責人可於「變更單 (CR)」模組發起需求，經由 `business` 及 `manager` 確定簽核後，自動反映毛利狀態。

### 4️⃣ 結算、視覺化與 KPI (Settlement & Visual Analytics)
- **情境**：月末或季末，確認交付狀況。
- **動作**：主管進入「月度結算」，確認毛利與稼動率無誤後「點選月結鎖定 (Settlement Lock)」。
- **視覺化**：進入「報表產生器 (Report Builder)」，系統會根據資料自動產出 Recharts 視覺化圖表，並支援匯出 PDF/Excel。
- **儀表板**：KPI 與稼動率看板會根據正式費率、成本與實際工作時數，即時動態呈現公司全模組營收概覽。

### 5️⃣ AI 與文件整合 (AI & SharePoint)
- **文件**：所有的專案附件均同步至 SharePoint 目錄，並在資料庫中保留 `driveId` 與 `itemId`。
- **AI 助手**：透過內建的 REST API，可將 PMP 數據輕鬆接入 Microsoft Copilot Studio，實現「語意化查詢專案狀態」或「自動回答毛利風險」。
- **防呆鎖定**：已轉案商機自動鎖定、未經核准的 WBS 禁止填報工時，確保數據合規性。

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
- 支援將目前 KPI 指標匯出為 Excel，方便彙整報表。

---

## 🛠️ 開發注意事項

### 套件版本固定
- 目前前端使用 `zod` 3.x、`@hookform/resolvers` 5.x、React 19、Vite 7；版本以 `package.json` / `pnpm-lock.yaml` 為準
- MongoDB / Mongoose 是唯一資料路徑；新增或修改資料結構時，請只更新 `server/models/*.ts` 與 `shared/types.ts`

### UI 元件
- `client/src/components/ui/` 放置基礎 UI 元件。
- 目前主要使用 Radix UI、TailwindCSS 與專案自訂元件。
- 新增表單或 Dialog 時，優先沿用既有元件與 `UserSearchPicker` / `BusinessUserPicker`，避免再做一套搜尋狀態造成輸入閃爍。

### 分頁/無限捲動
- `users.list` 與 `opportunities.list` 均支援 `limit` + `cursor` 分頁
- 前端使用 `useInfiniteQuery` 實作無限捲動
- 非無限捲動頁面請加上 `{ limit: 100 }` 參數

---

## 📄 授權

Private — All Rights Reserved
