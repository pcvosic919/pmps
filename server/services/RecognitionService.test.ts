import { describe, expect, it } from "vitest";
import {
    calculateAdjustmentDelta,
    calculatePresalesRecognition,
    getMonthRangeTaipei,
    toTaipeiMonth
} from "./RecognitionService";

describe("RecognitionService calculations", () => {
    it("calculates variable-rate presales recognition", () => {
        expect(calculatePresalesRecognition(3, 1200)).toBe(3600);
        expect(calculatePresalesRecognition(5, 1200)).toBe(6000);
    });

    it("calculates an append-only adjustment delta", () => {
        expect(calculateAdjustmentDelta(9600, 10000)).toBe(400);
        expect(calculateAdjustmentDelta(9600, 0)).toBe(-9600);
    });

    it("keeps repeated adjustments and a later reversal balanced", () => {
        const base = 9600;
        const firstAdjustment = calculateAdjustmentDelta(base, 10000);
        const currentAfterFirst = base + firstAdjustment;
        const secondAdjustment = calculateAdjustmentDelta(currentAfterFirst, 9000);
        const currentAfterSecond = currentAfterFirst + secondAdjustment;
        const reversal = calculateAdjustmentDelta(currentAfterSecond, 0);

        expect(firstAdjustment).toBe(400);
        expect(secondAdjustment).toBe(-1000);
        expect(base + firstAdjustment + secondAdjustment).toBe(9000);
        expect(base + firstAdjustment + secondAdjustment + reversal).toBe(0);
    });

    it("uses Asia/Taipei month boundaries", () => {
        const range = getMonthRangeTaipei("2026-08");
        expect(range.start.toISOString()).toBe("2026-07-31T16:00:00.000Z");
        expect(range.endExclusive.toISOString()).toBe("2026-08-31T16:00:00.000Z");
        expect(toTaipeiMonth("2026-08-31T16:30:00.000Z")).toBe("2026-09");
    });
});
