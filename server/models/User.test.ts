import { describe, expect, it } from "vitest";
import { UserModel } from "./User";

describe("User security schema", () => {
    it("does not select password hashes by default", () => {
        expect(UserModel.schema.path("password").options.select).toBe(false);
    });

    it("allows only one platform owner through a partial unique index", () => {
        const indexes = UserModel.schema.indexes() as Array<[Record<string, number>, Record<string, any>]>;
        const ownerIndex = indexes.find(([fields, options]) =>
            fields.isPlatformOwner === 1
            && options.unique === true
            && options.partialFilterExpression?.isPlatformOwner === true
        );
        expect(ownerIndex).toBeDefined();
    });
});
