import { describe, expect, it } from "vitest";
import {
    canConvertOpportunityStatus,
    getInitialOpportunityStatus,
    getProbabilityForOpportunityStatus,
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
        expect(canConvertOpportunityStatus("cancelled")).toBe(false);
    });

    it("maps workflow status to the controlled probability scale", () => {
        expect(getProbabilityForOpportunityStatus("new")).toBe(20);
        expect(getProbabilityForOpportunityStatus("qualified")).toBe(40);
        expect(getProbabilityForOpportunityStatus("presales_active")).toBe(60);
        expect(getProbabilityForOpportunityStatus("quoting")).toBe(80);
        expect(getProbabilityForOpportunityStatus("won")).toBe(100);
        expect(getProbabilityForOpportunityStatus("lost")).toBe(0);
        expect(getProbabilityForOpportunityStatus("cancelled")).toBe(0);
    });
});
