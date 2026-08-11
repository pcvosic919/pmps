import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../services/AuditService", async () => {
    const actual = await vi.importActual<typeof import("../services/AuditService")>("../services/AuditService");
    return { ...actual, queueAuditEvent: vi.fn() };
});

import { authRouter } from "./auth";
import { verifySessionToken } from "../_core/tokens";

describe("Platform Owner break-glass login", () => {
    const originalJwtSecret = process.env.JWT_SECRET;

    beforeAll(() => {
        process.env.JWT_SECRET = "platform-owner-login-test-secret";
    });

    afterAll(() => {
        if (originalJwtSecret === undefined) {
            delete process.env.JWT_SECRET;
        } else {
            process.env.JWT_SECRET = originalJwtSecret;
        }
    });

    it("allows the frontend account to log in without a database lookup", async () => {
        const caller = authRouter.createCaller({
            user: null,
            auditRequest: { requestId: "breakglass-login-test" },
            req: {},
            res: {}
        } as any);

        const result = await caller.login({
            email: "adminpmp@demo.com",
            password: "password123"
        });

        expect(result.user.email).toBe("adminpmp@demo.com");
        expect(result.user.role).toBe("admin");
        expect(result.user.isPlatformOwner).toBe(true);
        expect(verifySessionToken(result.token).sub).toBe("000000000000000000000000");
    });
});
