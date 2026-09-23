import { describe, expect, it } from "vitest";
import { createSwaggerHtml, openApiDocument, swaggerDocumentPath } from "./swagger";

describe("Swagger API documentation", () => {
    it("documents system endpoints and every public REST v1 operation", () => {
        const paths = Object.keys(openApiDocument.paths);

        expect(paths).toEqual(expect.arrayContaining([
            "/health",
            "/v1/projects/active",
            "/v1/projects/search",
            "/v1/projects/summary",
            "/v1/projects/{id}",
            "/v1/opportunities/active",
            "/v1/opportunities/won",
            "/v1/opportunities/search",
            "/v1/issues/critical",
            "/v1/timesheets/summary",
            "/v1/ping",
            "/notifications/stream"
        ]));
        expect(new Set(paths).size).toBe(12);
        expect(openApiDocument.components.securitySchemes.ApiKeyAuth.name).toBe("X-API-KEY");
        expect(openApiDocument.paths["/health"].get.security).toEqual([]);
        expect(openApiDocument.paths["/v1/projects/active"].get.responses["200"].content["application/json"].schema)
            .toEqual(expect.objectContaining({ type: "object" }));
    });

    it("builds a Swagger UI page pointing to the JSON document", () => {
        const html = createSwaggerHtml();

        expect(html).toContain("SwaggerUIBundle");
        expect(html).toContain(swaggerDocumentPath);
        expect(html).toContain("persistAuthorization: true");
    });

    it("uses unique operation IDs and resolvable component schema references", () => {
        const serialized = JSON.stringify(openApiDocument);
        const refs = [...serialized.matchAll(/#\/components\/schemas\/([^"}]+)/g)].map((match) => match[1]);
        const operationIds = Object.values(openApiDocument.paths).map((path) => path.get.operationId);

        expect(new Set(operationIds).size).toBe(operationIds.length);
        for (const ref of refs) {
            expect(openApiDocument.components.schemas).toHaveProperty(ref);
        }
    });
});
