import { describe, expect, it } from "vitest";
import {
    buildDailyPercentMap,
    dateKey,
    enumerateWeekdays,
    evaluateSkillMatch,
    getPeakAllocationPercent,
    overlapsDateRange
} from "./ResourcePlanningService";

describe("resource planning capacity", () => {
    it("counts weekdays and excludes weekends", () => {
        const days = enumerateWeekdays("2026-08-14", "2026-08-17");
        expect(days.map(dateKey)).toEqual(["2026-08-14", "2026-08-17"]);
    });

    it("keeps an 80% plus 50% overlap as a non-blocking 130% signal", () => {
        const allocations = [
            { startDate: new Date("2026-08-10"), endDate: new Date("2026-08-14"), allocationPercent: 80 },
            { startDate: new Date("2026-08-12"), endDate: new Date("2026-08-18"), allocationPercent: 50 }
        ];
        const daily = buildDailyPercentMap(allocations);
        expect(daily.get("2026-08-11")).toBe(80);
        expect(daily.get("2026-08-12")).toBe(130);
        expect(getPeakAllocationPercent(allocations, "2026-08-10", "2026-08-18")).toBe(130);
    });

    it("detects inclusive date overlap", () => {
        expect(overlapsDateRange("2026-08-01", "2026-08-10", "2026-08-10", "2026-08-20")).toBe(true);
        expect(overlapsDateRange("2026-08-01", "2026-08-09", "2026-08-10", "2026-08-20")).toBe(false);
    });
});

describe("resource skill matching", () => {
    it("requires every requested skill at or above its minimum level", () => {
        const result = evaluateSkillMatch(
            [{ category: "Azure", level: "expert" }, { category: "React", level: "beginner" }],
            [{ category: "Azure", minimumLevel: "advanced" }, { category: "React", minimumLevel: "intermediate" }]
        );
        expect(result.fullMatch).toBe(false);
        expect(result.missingSkills).toEqual(["React"]);
        expect(result.surplus).toBe(1);
    });

    it("matches skill names case-insensitively", () => {
        expect(evaluateSkillMatch(
            [{ category: "Power BI", level: "advanced" }],
            [{ category: "power bi", minimumLevel: "intermediate" }]
        )).toMatchObject({ fullMatch: true, missingSkills: [], surplus: 1 });
    });
});
