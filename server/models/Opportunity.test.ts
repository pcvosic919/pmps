import { describe, expect, it } from "vitest";
import { OpportunityModel } from "./Opportunity";

describe("Opportunity model", () => {
    it("stores only the six supported success-rate values and a bounded note", () => {
        const probabilityPath = OpportunityModel.schema.path("probability") as any;
        const notePath = OpportunityModel.schema.path("probabilityNote") as any;

        expect(probabilityPath.options.enum).toEqual([0, 20, 40, 60, 80, 100]);
        expect(notePath.options.maxlength).toBe(2000);
    });
});
