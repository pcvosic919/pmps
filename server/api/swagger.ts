import { Router, type Request } from "express";

const jsonResponse = (description: string, schema?: Record<string, unknown>) => ({
    description,
    content: schema ? { "application/json": { schema } } : undefined
});

const errorResponses = {
    "401": jsonResponse("API Key 缺失或無效", { $ref: "#/components/schemas/Error" }),
    "500": jsonResponse("伺服器處理失敗", { $ref: "#/components/schemas/Error" })
};

export const openApiDocument = {
    openapi: "3.0.3",
    info: {
        title: "PMP System REST API",
        version: "1.0.0",
        description: "PMP System 對 Copilot Studio 與外部系統提供的 REST API。所有資料 API 都需要 X-API-KEY。"
    },
    servers: [{ url: "/api/v1", description: "目前伺服器" }],
    tags: [
        { name: "Projects", description: "專案資料" },
        { name: "Opportunities", description: "商機資料" },
        { name: "Issues", description: "專案議題" },
        { name: "Timesheets", description: "工時統計" },
        { name: "Meta", description: "連線檢查" }
    ],
    components: {
        securitySchemes: {
            ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-KEY", description: "Copilot REST API Key" }
        },
        schemas: {
            Error: {
                type: "object",
                required: ["error"],
                properties: { error: { type: "string", example: "Unauthorized. Invalid X-API-KEY." } }
            },
            ListResponse: {
                type: "object",
                required: ["count", "data"],
                properties: {
                    count: { type: "integer", minimum: 0 },
                    data: { type: "array", items: { type: "object", additionalProperties: true } },
                    message: { type: "string" }
                }
            }
        }
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
        "/projects/active": { get: listOperation("Projects", "取得進行中專案", "getActiveProjects") },
        "/projects/search": {
            get: listOperation("Projects", "依名稱搜尋專案", "searchProjects", [queryParameter("q", "專案名稱關鍵字", true)])
        },
        "/projects/summary": {
            get: objectOperation("Projects", "取得專案整體統計", "getProjectsSummary")
        },
        "/projects/{id}": {
            get: objectOperation("Projects", "取得單一專案完整摘要", "getProjectById", [{
                name: "id", in: "path", required: true, description: "專案 MongoDB ObjectId", schema: { type: "string" }
            }], { "404": jsonResponse("找不到專案", { $ref: "#/components/schemas/Error" }) })
        },
        "/opportunities/active": { get: listOperation("Opportunities", "取得進行中商機", "getActiveOpportunities") },
        "/opportunities/won": {
            get: listOperation("Opportunities", "取得最近成交商機", "getWonOpportunities", [limitParameter(10)])
        },
        "/opportunities/search": {
            get: listOperation("Opportunities", "依商機或客戶名稱搜尋", "searchOpportunities", [queryParameter("q", "商機或客戶名稱關鍵字", true)])
        },
        "/issues/critical": {
            get: listOperation("Issues", "取得未解決的高風險議題", "getCriticalIssues", [limitParameter(15)])
        },
        "/timesheets/summary": {
            get: objectOperation("Timesheets", "取得指定月份工時統計", "getTimesheetSummary", [{
                name: "month", in: "query", required: false, description: "月份 (YYYY-MM)", schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$", example: "2026-09" }
            }])
        },
        "/ping": { get: objectOperation("Meta", "檢查 REST API 連線", "ping") }
    }
};

function queryParameter(name: string, description: string, required: boolean) {
    return { name, in: "query", required, description, schema: { type: "string" } };
}

function limitParameter(defaultValue: number) {
    return { name: "limit", in: "query", required: false, description: "回傳筆數", schema: { type: "integer", minimum: 1, default: defaultValue } };
}

function listOperation(tag: string, summary: string, operationId: string, parameters: unknown[] = []) {
    return {
        tags: [tag], summary, operationId, parameters,
        responses: { "200": jsonResponse("查詢成功", { $ref: "#/components/schemas/ListResponse" }), "400": jsonResponse("查詢參數錯誤", { $ref: "#/components/schemas/Error" }), ...errorResponses }
    };
}

function objectOperation(tag: string, summary: string, operationId: string, parameters: unknown[] = [], extraResponses = {}) {
    return {
        tags: [tag], summary, operationId, parameters,
        responses: { "200": jsonResponse("查詢成功", { type: "object", additionalProperties: true }), ...extraResponses, ...errorResponses }
    };
}

export const swaggerDocumentPath = "/api/docs/openapi.json";

export function createSwaggerHtml(specUrl = swaggerDocumentPath) {
    const safeSpecUrl = JSON.stringify(specUrl).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PMP System REST API - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin="anonymous"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: ${safeSpecUrl},
      dom_id: "#swagger-ui",
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: true,
      tryItOutEnabled: true
    });
  </script>
</body>
</html>`;
}

export const swaggerRouter = Router();

swaggerRouter.get("/openapi.json", (req, res) => {
    const protocol = req.get("x-forwarded-proto")?.split(",")[0].trim() || req.protocol;
    const host = req.get("x-forwarded-host")?.split(",")[0].trim() || req.get("host");
    const document = host
        ? { ...openApiDocument, servers: [{ url: `${protocol}://${host}/api/v1`, description: "目前伺服器" }] }
        : openApiDocument;

    res.json(document);
});

swaggerRouter.get(["/", ""], (req: Request, res) => {
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    res.type("html").send(createSwaggerHtml(`${baseUrl}/openapi.json`));
});
