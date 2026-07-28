import { describe, expect, it } from "vitest";
import {
    canConvertOpportunityStatus,
    getInitialOpportunityStatus,
    getStatusAfterMemberAssignment,
    getStatusAfterPresalesAssignment,
    isTerminalOpportunityStatus
} from "./opportunity-workflow";

describe("opportunity workflow", () => {
    it("selects the initial status from the creator role", () => {
        expect(getInitialOpportunityStatus(false)).toBe("new");
        expect(getInitialOpportunityStatus(true)).toBe("presales_active");
    });

    it("confirms a new opportunity after a general member assignment", () => {
        expect(getStatusAfterMemberAssignment("new")).toBe("qualified");
        expect(getStatusAfterMemberAssignment("quoting")).toBe("quoting");
    });

    it("starts presales without downgrading later stages", () => {
        expect(getStatusAfterPresalesAssignment("new")).toBe("presales_active");
        expect(getStatusAfterPresalesAssignment("qualified")).toBe("presales_active");
        expect(getStatusAfterPresalesAssignment("quoting")).toBe("quoting");
    });

    it("locks terminal statuses while allowing won opportunities to convert", () => {
        expect(isTerminalOpportunityStatus("converted")).toBe(true);
        expect(isTerminalOpportunityStatus("won")).toBe(true);
        expect(isTerminalOpportunityStatus("lost")).toBe(true);
        expect(isTerminalOpportunityStatus("quoting")).toBe(false);
        expect(canConvertOpportunityStatus("won")).toBe(true);
        expect(canConvertOpportunityStatus("converted")).toBe(false);
        expect(canConvertOpportunityStatus("lost")).toBe(false);
    });
});
