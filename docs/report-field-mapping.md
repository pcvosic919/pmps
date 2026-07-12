# 報表欄位盤點與系統對照

本文件依據下列舊系統範本整理，作為後續報表、資料欄位、流程與權限設計的討論基準。

- `業務單位管理_Sample.xlsx`
- `處理人員管理_Sample.xlsx`

本階段重點是確認資料是否能完整寫入、保存與追溯，暫不處理報表美工版型。

## 文件盤點

目前 repo 內已有下列文件：

| 文件 | 狀態 | 說明 |
|---|---|---|
| `README.md` | 已有 | 系統介紹、架構、部署與匯入說明 |
| `操作手冊.md` | 已有 | 操作型文件 |
| `使用者操作手冊.md` | 已有 | 使用者操作手冊 |
| `MONGODB_SETUP.md` | 已有 | MongoDB 設定 |
| `pmp.md` | 已有 | 專案補充文件 |
| `todo.md` | 已有 | 待辦事項 |

目前未看到明確命名的正式文件：

| 文件 | 狀態 | 建議 |
|---|---|---|
| SA 系統分析文件 | 未見 | 建議後續補一份輕量版 SA，定義資料流程、角色、模組關係 |
| SRS 系統需求規格書 | 未見 | 建議後續補一份輕量版 SRS，定義欄位、權限、報表口徑 |

## 現有主要資料來源

| 系統資料來源 | 用途 |
|---|---|
| `Company` | 公司主檔、客戶名稱、統編、聯絡資訊 |
| `Opportunity` | 商機、協銷、業務、商機狀態、預估金額 |
| `ServiceRequest` | 專案 / SR 主檔、客戶、業務、排程、狀態、認列、保固、外部案件編號 |
| `ServiceRequest.externalAssignments` | 舊系統處理人員列資料、技術部門、角色、分配工時、個人狀態 |
| `ServiceRequest.wbsVersions.items` | WBS 工作項目、指派人員、排程、狀態、完成率 |
| `Timesheet` | 實際填寫工時、成本、專案 / 協銷來源 |
| `User` | 使用者、部門、職稱、角色、成本費率 |
| `SettlementSnapshot` | 月結成本、毛利與鎖帳快照 |

## 欄位狀態定義

| 狀態 | 說明 |
|---|---|
| 已有 | 系統已有明確欄位可保存 |
| 部分已有 | 系統可推導或部分保存，但欄位或流程尚未完整 |
| 計算 | 不建議手填，應由系統彙總計算 |
| 建議新增 | 目前缺明確欄位，建議新增正式欄位 |
| 待定義 | 舊系統欄位意義或口徑需先確認 |

## 業務單位管理報表

範本特性：

- 工作表：`清單資料`
- 欄位列：第 2 列
- 欄位數：49
- 資料筆數：約 290
- 主要檢視維度：業務部門、業務代表、案件、全案工時與成本

| 舊系統欄位 | 建議新系統名稱 | 建議資料來源 | 狀態 | 備註 |
|---|---|---|---|---|
| 公司名稱 | 客戶名稱 / 公司名稱 | `ServiceRequest.customerName`, `Company.name` | 已有 | 建議後續以 `Company` 主檔為準 |
| 案件名稱 | 專案 / 案件名稱 | `ServiceRequest.title` | 已有 | |
| 專案編號 | 專案編號 | `ServiceRequest.externalProjectCode` | 已有 | 需確認新系統是否自動產生或沿用舊編號 |
| 服務類型 | 服務類型 | `ServiceRequest.externalServiceType`, `srType` | 部分已有 | 舊系統值域比目前 `srType` 更細，建議保留文字欄位 |
| 預計開始時間 | 預計開始日 | `ServiceRequest.plannedStartDate` | 已有 | |
| 預計結束時間 | 預計結束日 | `ServiceRequest.plannedEndDate` | 已有 | |
| 預計結束時間-歷程 | 預計結束日異動歷程 | 新增 `plannedEndDateHistory` | 建議新增 | 需保存每次變更前後日期、異動人、異動時間、原因 |
| 全案開始時間 | 實際開始日 | `ServiceRequest.actualStartDate` | 已有 | |
| 全案結束時間 | 實際結束日 | `ServiceRequest.actualEndDate` | 已有 | |
| 業務部門 | 業務部門 | `ServiceRequest.salesDepartment`, `Opportunity.salesDepartment` | 已有 | |
| 業務代表 | 業務代表 | `ServiceRequest.salesRep`, `Opportunity.salesRep` | 已有 | |
| 全案狀態 | 專案狀態 | `ServiceRequest.status`, `externalStatus` | 部分已有 | 需定義舊狀態與新狀態 mapping |
| 建案人員部門 | 建案人員部門 | 新增 `createdByDepartment` | 建議新增 | `createdAt` 已有，但建案人員部門需保存 |
| 建案人員 | 建案人員 | 新增 `createdById`, `createdByNameSnapshot` | 建議新增 | 建議保存 ID 與當時姓名快照 |
| 專案主持人 | 專案角色：主持人 | `externalAssignments.roleName` | 部分已有 | 目前可用外部指派列保存 |
| 專案經理 | 專案角色：專案經理 | `pmId`, `externalAssignments.roleName` | 部分已有 | 若多人需走 `externalAssignments` |
| 部署者 | 專案角色：部署者 | `externalAssignments.roleName` | 部分已有 | |
| 開發者 | 專案角色：開發者 | `externalAssignments.roleName` | 部分已有 | |
| 問題追蹤者 | 專案角色：問題追蹤者 | `Issue.assigneeId` 或 `externalAssignments.roleName` | 部分已有 | 需確認是 Issue 負責人還是舊角色 |
| 協銷人員 | 專案角色：協銷人員 | `Opportunity.presalesAssignments`, `externalAssignments` | 部分已有 | |
| 講師 | 專案角色：講師 | `externalAssignments.roleName` | 部分已有 | |
| 助教 | 專案角色：助教 | `externalAssignments.roleName` | 部分已有 | |
| 學習者 | 專案角色：學習者 | `externalAssignments.roleName` | 待定義 | 需確認是否為內部訓練對象 |
| 架構師 | 專案角色：架構師 | `externalAssignments.roleName` | 部分已有 | |
| 專案經理(前) | 前任專案經理 | 新增 PM 歷程或 `externalAssignments.roleName` | 建議新增 | 若需追溯換 PM，建議加 `pmHistory` |
| IE0T00 | T00 內部工時 / 部門 | `externalAssignments.teamDepartment` | 部分已有 | 需確認是部門欄位還是內部工時計算欄 |
| 總建案工時(主單+附單) (服務+T00內部) | 總建案工時 | `externalAssignments.plannedHours`, WBS 預估工時 | 計算 | 建議由分派/WBS 彙總 |
| 已累計工時 (服務+T00內部) | 已累計工時 | `Timesheet.hours`, `externalAssignments.actualHours` | 計算 | 應以 Timesheet 為主 |
| 剩餘工時 (服務+T00內部) | 剩餘工時 | 建案工時 - 已累計工時 | 計算 | |
| 總建案工時(主單+附單) (服務工時) | 服務建案工時 | 新增工時分類或 `workType` | 部分已有 | 需區分服務 / T00 內部 |
| 已累計工時 (服務工時) | 服務已累計工時 | `Timesheet.hours` + 工時分類 | 部分已有 | |
| 剩餘工時 (服務工時) | 服務剩餘工時 | 計算 | 部分已有 | |
| 總建案工時(主單+附單) (T00內部) | T00 內部建案工時 | 新增工時分類 | 建議新增 | |
| 已累計工時 (T00內部) | T00 內部已累計工時 | 新增工時分類 + Timesheet | 建議新增 | |
| 剩餘工時 (T00內部) | T00 內部剩餘工時 | 計算 | 建議新增 | |
| 執行工時 | 查詢期間執行工時 | `Timesheet.hours` | 計算 | 欄名日期區間應依報表查詢條件動態產生 |
| 人力服務總成本(主單+附單) | 人力服務總成本 | `Timesheet.costAmount`, User rate | 計算 | |
| 人力服務總成本-調整後 | 調整後人力成本 | 新增 `adjustedLaborCost` | 建議新增 | |
| 問題代號(客服) | 客服問題代號 | `ServiceRequest.externalIssueCode` | 已有 | |
| 案件編號(保固 / 維護專案) | 保固 / 維護案件編號 | `externalWarrantyProjectCode` | 已有 | |
| 起訖時間(保固 / 維護專案) | 保固 / 維護起訖時間 | `plannedStartDate`, `plannedEndDate`, `warrantyExpiresAt` | 部分已有 | 需確認格式 |
| 案件編號(協銷) | 協銷案件編號 | `externalPresalesCaseCode`, `Opportunity._id` | 已有 | |
| 調整後金額備註 | 調整後成本備註 | 新增 `adjustedCostNote` | 建議新增 | |
| 建案日期 | 建案日期 | `ServiceRequest.createdAt` | 已有 | |
| 更新日期 | 更新日期 | `ServiceRequest.updatedAt` | 已有 | |
| 保固到期日期 | 保固到期日 | `ServiceRequest.warrantyExpiresAt` | 已有 | |
| 總工作項目 | 總工作項目 | `wbsVersions.items.length` | 計算 | 以有效 WBS 版本為準 |
| 總完成工作項目 | 總完成工作項目 | WBS `status = completed` | 計算 | |
| 總完成百分比 | 總完成百分比 | WBS 完成率 | 計算 | 可依數量或工時加權，需定義 |

## 技術部門處理人員管理報表

範本特性：

- 工作表：`清單資料`
- 欄位列：第 2 列
- 欄位數：38
- 資料筆數：約 16
- 主要檢視維度：技術部門、處理人員、角色、個人案件狀態、分配工時與剩餘工時

| 舊系統欄位 | 建議新系統名稱 | 建議資料來源 | 狀態 | 備註 |
|---|---|---|---|---|
| 公司名稱 | 客戶名稱 / 公司名稱 | `ServiceRequest.customerName`, `Company.name` | 已有 | |
| 案件名稱 | 專案 / 案件名稱 | `ServiceRequest.title` | 已有 | |
| 專案編號 | 專案編號 | `ServiceRequest.externalProjectCode` | 已有 | |
| 服務類型 | 服務類型 | `ServiceRequest.externalServiceType`, `srType` | 部分已有 | |
| 建案日期 | 建案日期 | `ServiceRequest.createdAt` | 已有 | |
| 審核日期 | 審核日期 | `ServiceRequest.reviewDate` | 已有 | WBS 審核與 SR 審核需確認口徑 |
| 預計開始時間 | 預計開始日 | `plannedStartDate` | 已有 | |
| 預計結束時間 | 預計結束日 | `plannedEndDate` | 已有 | |
| 預計結束時間-歷程 | 預計結束日異動歷程 | 新增 `plannedEndDateHistory` | 建議新增 | |
| 全案開始時間 | 實際開始日 | `actualStartDate` | 已有 | |
| 全案結束時間 | 實際結束日 | `actualEndDate` | 已有 | |
| 業務部門 | 業務部門 | `salesDepartment` | 已有 | |
| 業務代表 | 業務代表 | `salesRep` | 已有 | |
| 全案狀態 | 專案狀態 | `ServiceRequest.status`, `externalStatus` | 部分已有 | |
| 個人案件狀態 | 個人案件狀態 | `externalAssignments.personalStatus`, WBS task status | 部分已有 | 建議明確採用處理人員分派狀態 |
| 技術部門 | 技術部門 | `externalAssignments.department`, `User.department` | 已有 | |
| 處理人員 | 處理人員 | `externalAssignments.handlerName`, `userId` | 已有 | |
| 角色 | 處理角色 | `externalAssignments.roleName`, WBS role mapping | 已有 | 舊值包含協銷人員、專案經理、部署者、助教、架構師 |
| 工時類別 | 工時類別 | `externalAssignments.workType` 或新增 timesheet category | 部分已有 | 範本多數空白，需確認定義 |
| 建案工時 | 建案工時 | `externalAssignments.plannedHours`, WBS estimatedHours | 已有 | |
| 分配工時 | 分配工時 | `externalAssignments.assignedHours` | 已有 | |
| 已累計工時 | 已累計工時 | `externalAssignments.actualHours`, `Timesheet.hours` | 計算 | 建議以 Timesheet 為主 |
| 執行工時 | 查詢期間執行工時 | `Timesheet.hours` | 計算 | 欄名日期區間依查詢條件產生 |
| 剩餘工時 | 剩餘工時 | `remainingHours` 或分配 - 累計 | 計算 | |
| 建案人員部門 | 建案人員部門 | 新增 `createdByDepartment` | 建議新增 | |
| 建案人員 | 建案人員 | 新增 `createdById`, `createdByNameSnapshot` | 建議新增 | |
| 問題代號(客服) | 客服問題代號 | `externalIssueCode` | 已有 | |
| 案件編號(保固 / 維護專案) | 保固 / 維護案件編號 | `externalWarrantyProjectCode` | 已有 | |
| 起訖時間(保固 / 維護專案) | 保固 / 維護起訖時間 | `plannedStartDate`, `plannedEndDate`, `warrantyExpiresAt` | 部分已有 | |
| 案件編號(協銷) | 協銷案件編號 | `externalPresalesCaseCode` | 已有 | |
| 更新日期 | 更新日期 | `updatedAt` | 已有 | |
| 保固到期日期 | 保固到期日 | `warrantyExpiresAt` | 已有 | |
| 計費分攤 | 計費分攤 | `billingAllocation` | 已有 | 需確認 UI 是否完整可維護 |
| 認列月份 | 認列月份 | `recognitionMonth` | 已有 | |
| 工作項目 | 工作項目 | `wbsVersions.items.title` | 部分已有 | 若一人多 WBS，需定義列展開方式 |
| 總工作項目 | 總工作項目 | WBS item count | 計算 | |
| 總完成工作項目 | 總完成工作項目 | completed WBS item count | 計算 | |
| 總完成百分比 | 總完成百分比 | WBS completion | 計算 | 需定義數量或工時加權 |

## 共通缺口與建議新增欄位

### `ServiceRequest`

| 欄位 | 型別建議 | 用途 |
|---|---|---|
| `createdById` | ObjectId(User) | 保存建案人員 |
| `createdByNameSnapshot` | string | 保存建案當下姓名，避免使用者改名影響歷史 |
| `createdByDepartment` | string | 保存建案人員部門 |
| `plannedEndDateHistory` | array | 保存預計結束時間歷程 |
| `adjustedLaborCost` | number | 保存調整後人力服務成本 |
| `adjustedCostNote` | string | 保存調整後金額備註 |
| `pmHistory` | array | 若需保存專案經理異動歷程 |

### `ServiceRequest.externalAssignments`

| 欄位 | 型別建議 | 用途 |
|---|---|---|
| `workType` | string | 工時類別 / 服務工時 / T00 內部等分類 |
| `costCategory` | string | 成本分類，供業務單位管理成本拆分 |
| `roleName` | string | 保留舊系統角色文字 |
| `personalStatus` | string | 個人案件狀態 |

### `Timesheet`

| 欄位 | 型別建議 | 用途 |
|---|---|---|
| `workType` | string | 工時類別 |
| `costCategory` | string | 服務 / T00 內部成本分類 |
| `externalAssignmentKey` | string 或 ObjectId | 若要精準回填到外部處理人員列 |

## 狀態與值域待確認

### 舊系統服務類型樣本

- 遠端問題解決
- 遠端技術服務
- 協銷-會議
- 協銷-專案
- 專案服務
- 維護專案
- 教育訓練-其他
- 到場服務
- 託管服務
- 活動支援
- MCI Activity
- 技術諮詢

建議：新系統不要只用 `project / maintenance` 二分法，需保留 `externalServiceType` 或正式建立服務類型設定表。

### 舊系統全案狀態樣本

- 開啟
- 等待中
- 結案(成功)
- 結案(失敗)

目前新系統狀態：

- `new`
- `in_progress`
- `completed`
- `cancelled`

建議 mapping：

| 舊狀態 | 新狀態建議 |
|---|---|
| 等待中 | `new` |
| 開啟 | `in_progress` |
| 結案(成功) | `completed` |
| 結案(失敗) | `cancelled` |

### 舊系統處理角色樣本

- 專案經理
- 協銷人員
- 部署者
- 開發者
- 問題追蹤者
- 講師
- 助教
- 學習者
- 架構師
- 專案主持人
- 專案經理(前)

建議：不要硬套到系統登入角色 `pm / tech / presales`，應作為案件角色 `roleName` 保存。

## 建議後續實作順序

1. 資料欄位補強
   - 補 `ServiceRequest` 建案人員、預計結束日歷程、調整後成本欄位。
   - 補 `Timesheet` 工時類別 / 成本分類欄位。

2. UI 寫入能力
   - 專案建立 / 編輯頁可維護建案人員資訊、計費分攤、保固到期、認列月份。
   - 處理人員分派可維護角色、個人案件狀態、工時類別。

3. 報表資料 API
   - 新增 `business_unit_management`。
   - 新增 `technical_handler_management`。
   - 報表先以欄位完整與資料正確為主。

4. Excel 匯出
   - 第一版沿用舊系統欄位名稱。
   - 第二版再套用美工、篩選、總表與統計頁。

5. 文件化
   - 依本文件補正式 SRS。
   - 後續補 SA，說明資料來源、權限、流程與計算邏輯。
