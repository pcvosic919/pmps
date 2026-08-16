import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { buildAssignmentCandidateQuery, buildUserListQuery } from "./users";

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

describe("assignment candidate query", () => {
    it("limits PM assignment to active PM accounts", () => {
        expect(buildAssignmentCandidateQuery("project_pm")).toEqual({
            $and: [
                { isActive: { $ne: false } },
                { role: { $in: ["pm"] } }
            ]
        });
    });

    it("searches name, email, department and employee code", () => {
        const query = buildAssignmentCandidateQuery("wbs", "A+B");
        const clauses = query.$and as Array<any>;
        expect(clauses[1]).toEqual({ role: { $in: ["tech"] } });
        expect(clauses[2].$or.map((entry: Record<string, RegExp>) => Object.keys(entry)[0])).toEqual([
            "name",
            "email",
            "department",
            "employeeCode"
        ]);
        expect(clauses[2].$or[0].name.test("A+B Team")).toBe(true);
        expect(clauses[2].$or[0].name.test("AAAB Team")).toBe(false);
    });

    it("excludes base user accounts from opportunity and project member selection", () => {
        expect(buildAssignmentCandidateQuery("project_member")).toEqual({
            $and: [
                { isActive: { $ne: false } },
                { role: { $in: ["admin", "manager", "presales", "pm", "tech", "business"] } }
            ]
        });
    });

    it("adds scoped project participants to the default Tech-only WBS candidates", () => {
        const participantId = new mongoose.Types.ObjectId();
        const query = buildAssignmentCandidateQuery("wbs", undefined, [participantId]);
        expect((query.$and as Array<any>)[1]).toEqual({
            $or: [
                { role: { $in: ["tech"] } },
                { _id: { $in: [participantId] } }
            ]
        });
    });

    it("limits managed-project WBS candidates to approved allocation users", () => {
        const approvedId = new mongoose.Types.ObjectId();
        const query = buildAssignmentCandidateQuery("wbs", undefined, [approvedId], true);
        expect((query.$and as Array<any>)[1]).toEqual({ _id: { $in: [approvedId] } });
    });
});
