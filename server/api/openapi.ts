const jsonContent = (schema: Record<string, unknown>) => ({
    "application/json": { schema }
});

const errorResponse = (description: string) => ({
    description,
    content: jsonContent({ $ref: "#/components/schemas/Error" })
});

const standardErrors = {
    "401": errorResponse("X-API-KEY 缺失或無效"),
    "500": errorResponse("伺服器處理失敗")
};

const listResponse = (itemRef: string) => ({
    type: "object",
    required: ["count", "data"],
    properties: {
        count: { type: "integer", minimum: 0, description: "回傳資料筆數" },
        data: { type: "array", items: { $ref: itemRef } },
        message: { type: "string", description: "無搜尋結果時的說明" }
    }
});

export const openApiDocument = {
    openapi: "3.0.3",
    info: {
        title: "PMP System API",
        version: "1.0.0",
        description: [
            "PMP System 對外 HTTP API 的 OpenAPI 文件。",
            "`/v1` 資料 API 使用 `X-API-KEY`；通知串流使用短效期 query token。",
            "tRPC 程序因使用 tRPC 自有協定與型別產生機制，不列入此 REST OpenAPI 文件。"
        ].join("\n\n")
    },
    servers: [{ url: "/api", description: "目前伺服器" }],
    tags: [
        { name: "System", description: "系統健康與連線狀態" },
        { name: "Projects", description: "專案查詢與統計" },
        { name: "Opportunities", description: "商機查詢" },
        { name: "Issues", description: "專案風險議題" },
        { name: "Timesheets", description: "工時統計" },
        { name: "Notifications", description: "即時通知串流" }
    ],
    components: {
        securitySchemes: {
            ApiKeyAuth: {
                type: "apiKey", in: "header", name: "X-API-KEY",
                description: "由系統設定 apiToken 或 COPILOT_API_KEY 環境變數提供"
            },
            NotificationToken: {
                type: "apiKey", in: "query", name: "token",
                description: "由 auth.streamToken tRPC procedure 取得的短效期 token"
            }
        },
        schemas: {
            Error: {
                type: "object", required: ["error"],
                properties: {
                    error: { type: "string", example: "Internal Server Error" },
                    message: { type: "string", description: "可讀的錯誤說明" }
                }
            },
            ProjectFinancials: {
                type: "object",
                properties: {
                    marginEstimate: { type: "number", nullable: true },
                    isMarginAtRisk: { type: "boolean", nullable: true }
                }
            },
            ProjectWbs: {
                type: "object", nullable: true,
                properties: {
                    version: { type: "integer" }, wbsStatus: { type: "string" },
                    totalEstimatedHours: { type: "number" }, totalActualHours: { type: "number" },
                    progressPercent: { type: "integer" }, taskCount: { type: "integer" }
                }
            },
            ProjectListItem: {
                type: "object", required: ["id", "projectName", "status", "pm", "contractAmount"],
                properties: {
                    id: { type: "string", example: "66f1234567890abcdef12345" },
                    projectName: { type: "string", example: "ERP 導入專案" }, status: { type: "string" },
                    pm: { type: "string", example: "王小明" }, contractAmount: { type: "number" },
                    quotedContractAmount: { type: "number", nullable: true }, finalPrice: { type: "number", nullable: true },
                    marginEstimate: { type: "number", nullable: true }, isMarginAtRisk: { type: "boolean", nullable: true },
                    startDate: { type: "string", format: "date-time" }
                }
            },
            ProjectSearchItem: {
                allOf: [
                    { $ref: "#/components/schemas/ProjectListItem" },
                    { type: "object", properties: {
                        wbs: { $ref: "#/components/schemas/ProjectWbs" },
                        pendingChangeRequests: { type: "integer" }
                    } }
                ]
            },
            ProjectDetail: {
                allOf: [
                    { $ref: "#/components/schemas/ProjectListItem" },
                    { type: "object", properties: {
                        financials: { $ref: "#/components/schemas/ProjectFinancials" },
                        wbs: { $ref: "#/components/schemas/ProjectWbs" },
                        issues: { type: "object", properties: { openCount: { type: "integer" }, criticalCount: { type: "integer" } } },
                        pendingChangeRequests: { type: "array", items: { type: "object", properties: {
                            reason: { type: "string" }, hoursAdjustment: { type: "number" },
                            amountAdjustment: { type: "number" }, status: { type: "string" }
                        } } }
                    } }
                ]
            },
            ProjectSummary: {
                type: "object", required: ["totalProjects", "byStatus", "totalContractValue", "projectsAtMarginRisk", "openCriticalIssues"],
                properties: {
                    totalProjects: { type: "integer" }, byStatus: { type: "object", additionalProperties: { type: "integer" } },
                    totalContractValue: { type: "number" }, projectsAtMarginRisk: { type: "integer" }, openCriticalIssues: { type: "integer" }
                }
            },
            Opportunity: {
                type: "object", required: ["id", "opportunityName", "customerName"],
                properties: {
                    id: { type: "string" }, opportunityName: { type: "string" }, customerName: { type: "string" },
                    salesUserId: { type: "string" }, salesDepartment: { type: "string" }, salesRep: { type: "string" },
                    estimatedValue: { type: "number" }, dealValue: { type: "number" }, opportunityType: { type: "string", enum: ["revenue", "presales"] },
                    status: { type: "string" }, owner: { type: "string" }, expectedCloseDate: { type: "string", format: "date-time", nullable: true },
                    closeDate: { type: "string", format: "date-time", nullable: true }, products: { type: "array", items: { type: "string" } },
                    presalesCount: { type: "integer" }
                }
            },
            CriticalIssue: {
                type: "object", required: ["id", "issueTitle", "severity", "currentStatus"],
                properties: {
                    id: { type: "string" }, issueTitle: { type: "string" }, description: { type: "string" },
                    severity: { type: "string", enum: ["high", "critical"] }, currentStatus: { type: "string", enum: ["open", "in_progress"] },
                    affectedProjectName: { type: "string" }, projectId: { type: "string" }, reportedAt: { type: "string", format: "date-time" }
                }
            },
            TimesheetSummary: {
                type: "object", required: ["month", "presalesHours", "projectHours", "totalHours", "topContributors"],
                properties: {
                    month: { type: "string", example: "2026-09" }, presalesHours: { type: "number" },
                    projectHours: { type: "number" }, totalHours: { type: "number" },
                    topContributors: { type: "array", items: { type: "object", required: ["name", "hours"], properties: {
                        name: { type: "string" }, hours: { type: "number" }
                    } } }
                }
            }
        }
    },
    paths: {
        "/health": { get: {
            tags: ["System"], summary: "檢查應用程式與資料庫狀態", operationId: "getHealth", security: [],
            responses: {
                "200": { description: "資料庫連線正常", content: jsonContent({ type: "object", properties: { status: { type: "string", example: "ok" }, message: { type: "string" } } }) },
                "503": { description: "資料庫尚未就緒", content: jsonContent({ type: "object", properties: { status: { type: "string", example: "error" }, message: { type: "string" } } }) },
                "500": { description: "資料庫連線失敗", content: jsonContent({ type: "object", properties: { status: { type: "string", example: "error" }, message: { type: "string" } } }) }
            }
        } },
        "/v1/projects/active": { get: listOperation("Projects", "取得進行中專案", "getActiveProjects", "#/components/schemas/ProjectListItem") },
        "/v1/projects/search": { get: listOperation("Projects", "依名稱搜尋專案", "searchProjects", "#/components/schemas/ProjectSearchItem", [query("q", "專案名稱關鍵字", true)]) },
        "/v1/projects/summary": { get: objectOperation("Projects", "取得專案整體統計", "getProjectsSummary", "#/components/schemas/ProjectSummary") },
        "/v1/projects/{id}": { get: objectOperation("Projects", "取得單一專案完整摘要", "getProjectById", "#/components/schemas/ProjectDetail", [{ name: "id", in: "path", required: true, description: "專案 MongoDB ObjectId", schema: { type: "string", pattern: "^[0-9a-fA-F]{24}$" } }], { "404": errorResponse("找不到專案") }) },
        "/v1/opportunities/active": { get: listOperation("Opportunities", "取得進行中商機", "getActiveOpportunities", "#/components/schemas/Opportunity") },
        "/v1/opportunities/won": { get: listOperation("Opportunities", "取得最近成交商機", "getWonOpportunities", "#/components/schemas/Opportunity", [limit(10)]) },
        "/v1/opportunities/search": { get: listOperation("Opportunities", "依商機或客戶名稱搜尋", "searchOpportunities", "#/components/schemas/Opportunity", [query("q", "商機或客戶名稱關鍵字", true)]) },
        "/v1/issues/critical": { get: listOperation("Issues", "取得未解決的高風險議題", "getCriticalIssues", "#/components/schemas/CriticalIssue", [limit(15)]) },
        "/v1/timesheets/summary": { get: objectOperation("Timesheets", "取得指定月份工時統計", "getTimesheetSummary", "#/components/schemas/TimesheetSummary", [query("month", "月份（YYYY-MM，未提供時使用當月）", false, { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$", example: "2026-09" })]) },
        "/v1/ping": { get: objectOperation("System", "檢查 REST API 與 API Key", "ping", undefined, [], {}, { type: "object", required: ["status", "timestamp"], properties: { status: { type: "string", example: "ok" }, timestamp: { type: "string", format: "date-time" } } }) },
        "/notifications/stream": { get: {
            tags: ["Notifications"], summary: "訂閱即時通知", operationId: "streamNotifications", security: [{ NotificationToken: [] }],
            responses: {
                "200": { description: "Server-Sent Events 通知串流", content: { "text/event-stream": { schema: { type: "string", example: "data: {\"type\":\"notification\"}\\n\\n" } } } },
                "401": { description: "token 缺失或無效" }
            }
        } }
    }
};

function query(name: string, description: string, required: boolean, schema: Record<string, unknown> = { type: "string" }) {
    return { name, in: "query", required, description, schema };
}

function limit(defaultValue: number) {
    return query("limit", "回傳筆數", false, { type: "integer", default: defaultValue });
}

function listOperation(tag: string, summary: string, operationId: string, itemRef: string, parameters: unknown[] = []) {
    return {
        tags: [tag], summary, operationId, security: [{ ApiKeyAuth: [] }], parameters,
        responses: {
            "200": { description: "查詢成功", content: jsonContent(listResponse(itemRef)) },
            "400": errorResponse("缺少必要的查詢參數"), ...standardErrors
        }
    };
}

function objectOperation(tag: string, summary: string, operationId: string, schemaRef?: string, parameters: unknown[] = [], extraResponses = {}, inlineSchema?: Record<string, unknown>) {
    return {
        tags: [tag], summary, operationId, security: [{ ApiKeyAuth: [] }], parameters,
        responses: {
            "200": { description: "查詢成功", content: jsonContent(inlineSchema ?? { $ref: schemaRef }) },
            ...extraResponses, ...standardErrors
        }
    };
}
