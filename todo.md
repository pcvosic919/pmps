# PMP System — TODO

> 更新日期：2026-03-12

---

## 🔴 高優先 (核心功能缺口)

### 認證與授權
- [x] 實作真正的 JWT 登入
- [x] 登入頁面 `/login`
- [x] 登出功能
- [x] Token 過期刷新機制 (自動過期踢回攔截)
- [x] Microsoft Entra ID SSO 整合

### 商機 (Opportunities)
- [x] `OpportunityDetailPage` — 指派協銷人員功能串接後端 `assignPresales`
- [x] `OpportunityDetailPage` — 協銷工時紀錄 (modal + `logPresalesTime`)
- [x] `OpportunityDetailPage` — 從商機建立 SR 流程 (`createSR`)
- [x] 商機狀態流程圖 (new → qualified → presales_active → won/lost/converted)

### 服務請求 & WBS
- [x] `ServiceRequestsPage` — 建立 SR 表單 (目前只有清單)
- [x] `WbsManagementPage` — WBS 審核通過/拒絕 (PM 核准按鈕)
- [x] WBS 歷史版本瀏覽與比較

### 工時填報
- [x] `PresalesTimesheetsPage` — 完整工時提交表單串接 `logPresalesTime`
- [x] `ProjectTimesheetsPage` — 完整工時提交表單串接 `logProjectTime`
- [x] 工時週/月檢視切換

---

## 🟡 中優先 (體驗優化)

### 分頁 & 效能
- [x] `OpportunitiesPage` — 實作「無限捲動」觸底自動載入 (目前有 Load More 按鈕)
- [x] `UserManagementPage` — 同上
- [x] 搜尋功能伺服器端化 (目前為前端過濾)
- [x] 排序功能 (依日期/金額/狀態)

### 變更請求 (CR)
- [x] `ChangeRequestsPage` — 建立 CR 表單
- [x] CR 審核流程 (business → manager → approved/rejected)
- [x] CR 與對應 WBS Item 的連結展示

### 結算 (Settlements)
- [x] `SettlementsPage` — 月結確認/鎖定 (finalize)
- [x] 結算明細下載 (CSV/Excel)
- [x] 協銷結算與專案結算分開顯示

### 通知 (Notifications)
- [x] 「全部標示為已讀」功能
- [x] 通知分類篩選 (`warning` / `info` / `todo` / `approval`)
- [x] 即時通知 (WebSocket 或 SSE)

---

## 🟢 低優先 (加值功能)

### 費率 & 資源
- [x] `CostRatesPage` — 費率歷史紀錄
- [x] `UtilizationPage` — 使用真實工時計算稼動率
- [x] `ResourcesPage` — 使用真實稼動率資料

### KPI & 報表
- [x] `KpiDashboardPage` — 接入真實 `analytics.getKpis` 資料 (目前部分 mock)
- [x] 商機贏率趨勢圖
- [x] 每人成本 vs 貢獻收入圖表

### 自訂欄位
- [x] `CustomFieldsPage` — 自訂欄位值的讀寫 (目前只有定義，沒有值的 CRUD)
- [x] 自訂欄位在 OpportunityDetail / WBS 中的展示

### AI 報表
- [x] `ReportStoryPage` — 接入 LLM API 產生真實報告 (目前為靜態範例)
- [ ] 報表匯出 (PDF / PPT)

### Microsoft 整合
- [ ] Copilot 整合 (`integrations.ts`)
- [ ] SharePoint 文件連結到 SR 附件
- [ ] Entra ID 自動同步排程

---

## 🔧 技術債

### 安全性
- [x] 環境變數管理 `.env` — 已提供 `.env.example` 整合規範
- [x] tRPC `roleProcedure` — 後端實作完整角色驗證 (補強 projects 與 integrations)
- [x] SQL Injection 防護確認 (系統為 MongoDB，Mongoose 物件查詢本質防範 Injection)

### 程式碼品質
- [ ] 共用 Dialog/Form 元件抽取 (目前 UserManagementPage, OpportunitiesPage 有大量重複結構)
- [ ] `react-hook-form` 在各頁面的型別 `useForm<any>` 降回嚴格型別 (待套件版本對齊後)
- [ ] 移除所有 `as any` 型別斷言 (套件版本穩定後重構)
- [x] 加入 ESLint 設定並補齊 workspace lint/typecheck/test scripts
- [ ] Prettier 設定統一格式

### 測試
- [ ] 後端 router 單元測試 (vitest 已設定，零覆蓋率)
- [ ] 前端元件測試 (@testing-library/react)
- [ ] E2E 測試 (Playwright / Cypress)

### DevOps
- [ ] Docker Compose 設定
- [x] GitHub Actions CI/CD pipeline (ACR + App Service)
- [x] Docker 容器化與靜態檔案託管 (SPA Fallback)
- [ ] 生產環境資料庫遷移策略 (目前 `db:push` 直接 push)
- [ ] 資料庫備份機制

---

## ✅ 已完成

- [x] pnpm monorepo 架構 (client / server / shared / drizzle)
- [x] tRPC v11 前後端型別安全串接
- [x] Drizzle ORM + SQLite (20 張資料表)
- [x] 全域 Error Handling (tRPC error link + react-hot-toast)
- [x] react-hook-form + zod 表單驗證 (OpportunitiesPage, UserManagementPage)
- [x] 分頁 API (limit + cursor) — users.list, opportunities.list
- [x] useInfiniteQuery 無限捲動 (UserManagementPage, OpportunitiesPage)
- [x] shadcn/ui 元件安裝 (dialog, form, input, button, select, label)
- [x] AppLayout 左側導覽列
- [x] DashboardPage — 儀表板首頁
- [x] OpportunitiesPage — 商機清單 + 新增表單
- [x] OpportunityDetailPage — 商機詳情
- [x] UserManagementPage — 用戶管理 (新增/編輯/刪除)
- [x] CostRatesPage — 費率設定
- [x] UtilizationPage — 稼動率看板
- [x] ResourcesPage — 資源池看板
- [x] ServiceRequestsPage — SR 清單
- [x] WbsManagementPage — WBS 版本管理
- [x] ChangeRequestsPage — 變更請求
- [x] PresalesTimesheetsPage — 協銷工時
- [x] ProjectTimesheetsPage — 專案工時
- [x] KpiDashboardPage — KPI 儀表板
- [x] SettlementsPage — 結算頁面
- [x] NotificationsPage — 通知頁面
- [x] SystemSettingsPage — 系統設定
- [x] CustomFieldsPage — 自訂欄位
- [x] ReportStoryPage — AI 報表故事（已停用並自導覽移除）
- [x] TypeScript Build 全數通過 (exit code 0)
