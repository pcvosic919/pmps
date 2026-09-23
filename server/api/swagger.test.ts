import { describe, expect, it } from "vitest";
import { createSwaggerHtml, openApiDocument, swaggerDocumentPath } from "./swagger";

describe("Swagger API documentation", () => {
    it("documents every public REST v1 operation", () => {
        const paths = Object.keys(openApiDocument.paths);

        expect(paths).toEqual(expect.arrayContaining([
            "/projects/active",
            "/projects/search",
            "/projects/summary",
            "/projects/{id}",
            "/opportunities/active",
            "/opportunities/won",
            "/opportunities/search",
            "/issues/critical",
            "/timesheets/summary",
            "/ping"
        ]));
        expect(new Set(paths).size).toBe(10);
        expect(openApiDocument.components.securitySchemes.ApiKeyAuth.name).toBe("X-API-KEY");
    });

    it("builds a Swagger UI page pointing to the JSON document", () => {
        const html = createSwaggerHtml();

        expect(html).toContain("SwaggerUIBundle");
        expect(html).toContain(swaggerDocumentPath);
        expect(html).toContain("persistAuthorization: true");
    });
});
