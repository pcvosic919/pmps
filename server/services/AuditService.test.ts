import { describe, expect, it } from "vitest";
import {
    canViewAudit,
    getAuditTarget,
    hashAuditIp,
    routeCategory,
    summarizeAuditInput
} from "./AuditService";

describe("AuditService", () => {
    it("only grants Audit viewer access to demo@demo.com", () => {
        expect(canViewAudit({ email: " DEMO@demo.com " })).toBe(true);
        expect(canViewAudit({ email: "admin@example.com" })).toBe(false);
        expect(canViewAudit(null)).toBe(false);
    });

    it("redacts secrets and only retains allow-listed values", () => {
        const summary = summarizeAuditInput({
            id: "project-1",
            status: "approved",
            password: "never-store-this",
            accessToken: "secret-token",
            notes: "customer private note"
        }) as { fields: string[]; values: Record<string, unknown> };

        expect(summary.fields).toContain("id");
        expect(summary.fields).not.toContain("password");
        expect(summary.fields).not.toContain("accessToken");
        expect(summary.values.status).toBe("approved");
        expect(summary.values.password).toBe("[REDACTED]");
        expect(summary.values.accessToken).toBe("[REDACTED]");
        expect(summary.values.notes).toBeUndefined();
    });

    it("extracts target identifiers and labels without retaining the full input", () => {
        expect(getAuditTarget({
            opportunityId: "opp-123",
            title: "ABC 導入專案",
            description: "private"
        })).toEqual({
            targetType: "opportunity",
            targetId: "opp-123",
            targetLabel: "ABC 導入專案"
        });
    });

    it("hashes IP addresses deterministically without exposing the source", () => {
        const hash = hashAuditIp("192.0.2.10");
        expect(hash).toBe(hashAuditIp("192.0.2.10"));
        expect(hash).not.toContain("192.0.2.10");
        expect(hash).toHaveLength(24);
    });

    it("maps application routes to business categories", () => {
        expect(routeCategory("/opportunities/123")).toBe("opportunity");
        expect(routeCategory("/service-requests/123")).toBe("project");
        expect(routeCategory("/project-timesheets")).toBe("timesheet");
        expect(routeCategory("/audit")).toBe("audit");
    });
});
