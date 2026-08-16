import { describe, expect, it } from "vitest";
import {
    buildScheduleCapacityMap,
    enumerateScheduleDates,
    getScheduleOverloads,
    scheduleDateKey
} from "./SchedulePlanningService";

describe("schedule capacity", () => {
    it("treats a half-day as 50% and a full day as 100%", () => {
        const capacity = buildScheduleCapacityMap([
            { date: "2026-08-17", slot: "am" },
            { date: "2026-08-18", slot: "full_day" }
        ]);
        expect(capacity.get("2026-08-17")).toMatchObject({ amCount: 1, pmCount: 0, busyPercent: 50, isOverloaded: false });
        expect(capacity.get("2026-08-18")).toMatchObject({ amCount: 1, pmCount: 1, busyPercent: 100, isOverloaded: false });
    });

    it("flags same-slot collisions even when the daily total is only 100%", () => {
        const overloads = getScheduleOverloads([
            { date: "2026-08-17", slot: "am" },
            { date: "2026-08-17", slot: "am" }
        ]);
        expect(overloads).toEqual([expect.objectContaining({ date: "2026-08-17", amCount: 2, busyPercent: 100 })]);
    });

    it("allows weekend dates but marks them as non-standard overloads", () => {
        const capacity = buildScheduleCapacityMap([{ date: "2026-08-16", slot: "pm" }]);
        expect(capacity.get("2026-08-16")).toMatchObject({ isWeekend: true, isOverloaded: true });
    });

    it("enumerates inclusive calendar dates for migration and batch scheduling", () => {
        expect(enumerateScheduleDates("2026-08-14", "2026-08-17").map(scheduleDateKey)).toEqual([
            "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17"
        ]);
    });
});
