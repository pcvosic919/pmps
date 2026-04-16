# Power Automate Flow 設計 — PMPS Copilot Studio 整合

## 架構說明

```
使用者在 Teams/Copilot Studio 輸入問題
  └─ Copilot Studio Topic 觸發
       └─ Call an Action → Power Automate Flow
            └─ HTTP → PMPS /api/v1/...
                 └─ 回傳結構化資料給 Copilot Studio
                      └─ Bot 組成自然語言回覆
```

---

## 前置作業

1. 在 PMPS 系統設定頁面設定 **API Token**（設定 → 整合 → API Token）
2. 在 Power Automate 建立 **Environment Variable** 或 **Connection** 存放：
   - `PMPS_BASE_URL`：你的 PMPS server URL，例如 `https://pmps.yourdomain.com/api/v1`
   - `PMPS_API_KEY`：與系統設定相同的 API Token 值

---

## Flow 1：查詢專案狀態（依關鍵字）

**用途：** 使用者說「XXX 專案目前怎樣了？」

### 輸入參數
| 名稱 | 類型 | 說明 |
|------|------|------|
| `keyword` | string | 使用者輸入的專案名稱關鍵字 |

### 步驟

```
[1] 觸發：Copilot Studio 呼叫此 Flow
    Input: keyword (string)

[2] HTTP Request
    Method: GET
    URI: @{variables('PMPS_BASE_URL')}/projects/search?q=@{triggerBody()?['keyword']}
    Headers:
      X-API-KEY: @{variables('PMPS_API_KEY')}
      Content-Type: application/json

[3] Parse JSON
    Content: @{body('HTTP')}
    Schema: (使用 openapi.yaml 中的 ProjectSummaryItem 陣列)

[4] Condition：count 是否等於 0
    Yes → 回傳 "找不到相關專案"
    No  → 繼續

[5] Select（取第一筆最相關的結果）
    From: @{body('Parse_JSON')?['data']}
    取 body('Parse_JSON')?['data'][0]

[6] 回傳給 Copilot Studio
    Output: projectResult (object)
    {
      "found": true,
      "projectName": @{項目?['projectName']},
      "status": @{項目?['status']},
      "pm": @{項目?['pm']},
      "progressPercent": @{項目?['wbs']?['progressPercent']},
      "isMarginAtRisk": @{項目?['isMarginAtRisk']},
      "message": "專案「@{項目?['projectName']}」目前狀態為 @{項目?['status']}，進度 @{項目?['wbs']?['progressPercent']}%，PM：@{項目?['pm']}"
    }
```

---

## Flow 2：取得整體專案概況

**用途：** 使用者說「目前有幾個專案在進行？有哪些有風險？」

### 輸入參數
（無）

### 步驟

```
[1] 觸發：Copilot Studio 呼叫此 Flow

[2] HTTP Request
    Method: GET
    URI: @{variables('PMPS_BASE_URL')}/projects/summary
    Headers:
      X-API-KEY: @{variables('PMPS_API_KEY')}

[3] Parse JSON
    Content: @{body('HTTP')}

[4] 回傳給 Copilot Studio
    Output: summaryResult (object)
    {
      "totalProjects": @{body('Parse_JSON')?['totalProjects']},
      "atRiskCount": @{body('Parse_JSON')?['projectsAtMarginRisk']},
      "criticalIssues": @{body('Parse_JSON')?['openCriticalIssues']},
      "totalContractValue": @{body('Parse_JSON')?['totalContractValue']},
      "message": "目前共有 @{body('Parse_JSON')?['totalProjects']} 個專案，其中 @{body('Parse_JSON')?['projectsAtMarginRisk']} 個有利潤風險，@{body('Parse_JSON')?['openCriticalIssues']} 個嚴重議題待處理。"
    }
```

---

## Flow 3：查詢高風險議題

**用途：** 使用者說「現在哪些專案有問題？」

### 輸入參數
（無）

### 步驟

```
[1] 觸發：Copilot Studio 呼叫此 Flow

[2] HTTP Request
    Method: GET
    URI: @{variables('PMPS_BASE_URL')}/issues/critical?limit=10
    Headers:
      X-API-KEY: @{variables('PMPS_API_KEY')}

[3] Parse JSON
    Content: @{body('HTTP')}

[4] Condition：count 是否等於 0
    Yes → 回傳 "目前沒有嚴重議題，所有專案運作正常"

[5] Select — 組成摘要文字
    From: @{body('Parse_JSON')?['data']}
    Map each item to:
      "• @{item()?['affectedProjectName']}：@{item()?['issueTitle']} (@{item()?['severity']})"

[6] Join（用換行合併）
    From: Select 的輸出
    Join with: \n

[7] 回傳給 Copilot Studio
    Output:
    {
      "issueCount": @{body('Parse_JSON')?['count']},
      "issueList": @{body('Join')},
      "message": "目前有 @{body('Parse_JSON')?['count']} 個嚴重議題：\n@{body('Join')}"
    }
```

---

## Flow 4：查詢本月工時概況

**用途：** 使用者說「本月工時狀況如何？」

### 輸入參數
| 名稱 | 類型 | 說明 |
|------|------|------|
| `month` | string (optional) | YYYY-MM 格式，空白表示當月 |

### 步驟

```
[1] 觸發：Copilot Studio 呼叫此 Flow
    Input: month (string, optional)

[2] Initialize Variable — resolvedMonth
    Type: string
    Value: @{if(empty(triggerBody()?['month']), formatDateTime(utcNow(), 'yyyy-MM'), triggerBody()?['month'])}

[3] HTTP Request
    Method: GET
    URI: @{variables('PMPS_BASE_URL')}/timesheets/summary?month=@{variables('resolvedMonth')}
    Headers:
      X-API-KEY: @{variables('PMPS_API_KEY')}

[4] Parse JSON
    Content: @{body('HTTP')}

[5] 回傳給 Copilot Studio
    Output:
    {
      "month": @{body('Parse_JSON')?['month']},
      "totalHours": @{body('Parse_JSON')?['totalHours']},
      "presalesHours": @{body('Parse_JSON')?['presalesHours']},
      "projectHours": @{body('Parse_JSON')?['projectHours']},
      "message": "@{body('Parse_JSON')?['month']} 月共記錄 @{body('Parse_JSON')?['totalHours']} 小時，其中協銷 @{body('Parse_JSON')?['presalesHours']} 小時、專案 @{body('Parse_JSON')?['projectHours']} 小時。"
    }
```

---

## Flow 5：查詢最近成交的商機

**用途：** 使用者說「最近我們成交了哪些案子？」

### 輸入參數
（無）

### 步驟

```
[1] 觸發：Copilot Studio 呼叫此 Flow

[2] HTTP Request
    Method: GET
    URI: @{variables('PMPS_BASE_URL')}/opportunities/won?limit=5
    Headers:
      X-API-KEY: @{variables('PMPS_API_KEY')}

[3] Parse JSON
    Content: @{body('HTTP')}

[4] Select — 組成每筆摘要
    From: @{body('Parse_JSON')?['data']}
    Map: "• @{item()?['opportunityName']}（@{item()?['customerName']}）合約金額：@{item()?['dealValue']}"

[5] Join（換行合併）

[6] 回傳給 Copilot Studio
    Output:
    {
      "count": @{body('Parse_JSON')?['count']},
      "list": @{body('Join')},
      "message": "最近成交的商機：\n@{body('Join')}"
    }
```

---

## Copilot Studio Topic 設計範例

### Topic：詢問專案狀態

```
Trigger Phrases:
  - XXX 專案怎樣了
  - 查詢專案
  - 告訴我 XXX 的進度
  - XXX 專案目前狀態

Nodes:
  [1] Question — 詢問專案名稱
      "請問您想查詢哪個專案的名稱？"
      Save to: Topic.ProjectKeyword

  [2] Action — Call Flow「查詢專案狀態」
      Input: keyword = Topic.ProjectKeyword
      Output: Topic.ProjectResult

  [3] Message
      @{Topic.ProjectResult.message}

  [4] Condition：isMarginAtRisk = true
      Yes → Message "⚠️ 注意：此專案目前有利潤風險，建議回報 PM 評估。"
```

---

## 部署 Custom Connector（進階選項）

若要讓 Copilot Studio 的 AI 自動判斷何時呼叫 API（不需要固定 Topic），可以：

1. 前往 Power Apps → Data → Custom Connectors → **New custom connector → Import from OpenAPI file**
2. 上傳 `docs/copilot/openapi.yaml`
3. 在 Security 頁面設定：
   - Authentication type: `API Key`
   - Header name: `X-API-KEY`
4. 建立 Connection，填入你的 API Token
5. 在 Copilot Studio → Settings → AI Plugins 匯入此 Connector

這樣 bot 就能自然語言理解後自動選擇正確的 API 呼叫，不需要寫死 Topic。
