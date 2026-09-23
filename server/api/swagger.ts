import { Router, type Request } from "express";
import { openApiDocument } from "./openapi";

export { openApiDocument } from "./openapi";

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
        ? { ...openApiDocument, servers: [{ url: `${protocol}://${host}/api`, description: "目前伺服器" }] }
        : openApiDocument;

    res.json(document);
});

swaggerRouter.get(["/", ""], (req: Request, res) => {
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    res.type("html").send(createSwaggerHtml(`${baseUrl}/openapi.json`));
});
