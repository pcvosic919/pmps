import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, isPasswordHash, verifyPassword } from "./password";
import {
    getJwtSecret,
    signNotificationStreamToken,
    signSessionToken,
    verifyNotificationStreamToken,
    verifySessionToken,
} from "./tokens";

beforeEach(() => {
    process.env.JWT_SECRET = "unit-test-secret";
});

describe("password helpers", () => {
    it("hashPassword 會產生可驗證的 scrypt hash", async () => {
        const hashed = await hashPassword("password123");

        expect(isPasswordHash(hashed)).toBe(true);
        await expect(verifyPassword("password123", hashed)).resolves.toBe(true);
        await expect(verifyPassword("wrong-password", hashed)).resolves.toBe(false);
    });

    it("verifyPassword 仍能驗證 legacy 明碼，方便登入時平滑升級", async () => {
        await expect(verifyPassword("password123", "password123")).resolves.toBe(true);
        await expect(verifyPassword("password123", "password124")).resolves.toBe(false);
    });
});

describe("token helpers", () => {
    it("session token 與 notification stream token 彼此不可混用", () => {
        const sessionToken = signSessionToken({
            sub: "user-1",
            email: "demo@example.com",
            role: "admin",
            roles: ["admin"],
            name: "Demo Admin"
        });
        const streamToken = signNotificationStreamToken("user-1");

        expect(verifySessionToken(sessionToken)).toMatchObject({ sub: "user-1", email: "demo@example.com" });
        expect(verifyNotificationStreamToken(streamToken)).toMatchObject({ sub: "user-1" });
        expect(() => verifyNotificationStreamToken(sessionToken)).toThrow();
        expect(() => verifySessionToken(streamToken)).toThrow();
    });

    it("JWT_SECRET 未設定時會直接拒絕啟動/簽章", () => {
        delete process.env.JWT_SECRET;
        expect(() => getJwtSecret()).toThrow("JWT_SECRET is required");
    });
});
