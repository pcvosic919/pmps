import { describe, expect, it } from "vitest";
import { formatBusinessCode, getTaipeiDateKey } from "./BusinessCodeService";

describe("BusinessCodeService", () => {
    it("uses the Asia/Taipei calendar date", () => {
        expect(getTaipeiDateKey(new Date("2026-08-09T16:30:00.000Z"))).toBe("2026-08-10");
    });

    it("formats opportunity and project codes with a four digit sequence", () => {
        expect(formatBusinessCode("OPP", "2026-08-10", 1)).toBe("OPP-2026-08-10-0001");
        expect(formatBusinessCode("PRJ", "2026-08-10", 42)).toBe("PRJ-2026-08-10-0042");
    });

    it("does not truncate sequences above four digits", () => {
        expect(formatBusinessCode("OPP", "2026-08-10", 10001)).toBe("OPP-2026-08-10-10001");
    });
});
