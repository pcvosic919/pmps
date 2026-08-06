import { describe, expect, it } from "vitest";
import { buildUserListQuery } from "./users";

describe("user list query", () => {
    it("returns an empty query when no filters are selected", () => {
        expect(buildUserListQuery()).toEqual({});
    });

    it("filters users by the checked departments", () => {
        expect(buildUserListQuery(undefined, ["Delivery", "Sales", "Delivery", " "])).toEqual({
            department: { $in: ["Delivery", "Sales"] }
        });
    });

    it("combines escaped text search with the department filter", () => {
        const query = buildUserListQuery("A+B", ["Delivery"]);
        expect(query).toEqual({
            $and: [
                {
                    $or: [
                        { name: expect.any(RegExp) },
                        { email: expect.any(RegExp) },
                        { department: expect.any(RegExp) }
                    ]
                },
                { department: { $in: ["Delivery"] } }
            ]
        });

        const searchPattern = (query.$and as Array<any>)[0].$or[0].name as RegExp;
        expect(searchPattern.test("A+B Team")).toBe(true);
        expect(searchPattern.test("AAAB Team")).toBe(false);
    });
});
