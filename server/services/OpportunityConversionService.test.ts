import { describe, expect, it } from "vitest";
import { OpportunityQuoteModel } from "../models/OpportunityQuote";
import { buildOpportunityProjectMembers } from "./OpportunityConversionService";

describe("OpportunityConversionService", () => {
    it("keeps the opportunity owner and de-duplicates project assignees", () => {
        expect(buildOpportunityProjectMembers("owner-1", {
            pmId: "pm-1",
            techId: "pm-1",
            presalesAssignments: [{ techId: "tech-1" }, { techId: "owner-1" }]
        })).toEqual([
            { userId: "owner-1", memberRole: "owner" },
            { userId: "pm-1", memberRole: "assignee" },
            { userId: "tech-1", memberRole: "assignee" }
        ]);
    });

    it("enforces one accepted quote per opportunity at the database index level", () => {
        const indexes = OpportunityQuoteModel.schema.indexes() as Array<[
            Record<string, number>,
            Record<string, unknown>
        ]>;
        const acceptedIndex = indexes.find(([fields, options]) =>
            fields.opportunityId === 1
            && fields.status === 1
            && options.unique === true
            && (options.partialFilterExpression as any)?.status === "accepted"
        );
        expect(acceptedIndex).toBeDefined();
    });
});
