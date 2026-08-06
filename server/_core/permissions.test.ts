import { describe, expect, it } from "vitest";
import { userHasPermission, type UserSession } from "./trpc";

const makeUser = (overrides: Partial<UserSession> = {}): UserSession => ({
    id: "507f1f77bcf86cd799439011",
    email: "pm@example.com",
    name: "PM",
    managedDepartments: [],
    role: "pm",
    permissionOverrides: { allow: [], deny: [] },
    isActive: true,
    ...overrides
});

describe("userHasPermission", () => {
    it("uses the role default when no override exists", () => {
        expect(userHasPermission(makeUser(), "project.edit", ["admin", "manager", "pm"])).toBe(true);
        expect(userHasPermission(makeUser(), "project.delete", ["admin"])).toBe(false);
    });

    it("allows a permission explicitly even when the role default denies it", () => {
        const user = makeUser({
            permissionOverrides: { allow: ["project.delete"], deny: [] }
        });
        expect(userHasPermission(user, "project.delete", ["admin"])).toBe(true);
    });

    it("gives deny precedence over allow and the role default", () => {
        const user = makeUser({
            permissionOverrides: {
                allow: ["project.edit"],
                deny: ["project.edit"]
            }
        });
        expect(userHasPermission(user, "project.edit", ["admin", "manager", "pm"])).toBe(false);
    });
});
