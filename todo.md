# PMP System - 待辦清單 (To-Do List)

本文件用於追蹤系統後續可優化項目與功能迭代。

## 🚀 即將進行 / 建議優化

### 🏢 核心模組與權限
- [ ] **精細化 Menu 權限**：目前側欄雖然已過濾路由，但部分操作按鈕可過濾得更精準（例如 PM 只能編輯自己專案的資訊）。
- [ ] **審核記錄歷史 Log**：WBS 版本與變更請求（CR）同意／拒絕時，補上操作紀錄者的顯示與時間戳記 Log 集合。
- [ ] **多主管部門權限**：支援一個 Manager 可以管理多個部門（目前 Mongoose Schema 只綁定單一 `department: string`）。

### 🔌 系統整合 (Integrations)
- [ ] **補齊 Entra ID 同步邏輯**：目前 `integrations.ts` 中對 Entra ID 的同步主要為骨架，需整合 Graph API 完成背景人員自動排程同步。
- [ ] **電子郵件／通知整合**：整合 SMTP 或 Azure Communication Services，可在「待審核」或「毛利警告」時自動發送 Email 警報給負責人。

### 📊 分析與結算 (Analytics)
- [ ] **KPI 自訂圖表時間軸**：KPI 看板目前為寫死的統計，可加入「月份／季度區間篩選」。
- [ ] **匯出 PDF 功能**：除了 CSV 匯出，月度結算或 KPI 視圖可加上 PDF 匯出格式以供列印需求。

## 🛠️ 維護與優化
- [ ] 常規 Dependency 檢查與升級。
- [ ] 執行 `pnpm typecheck` 清除零星型別警告（Type assertion 優化）。
