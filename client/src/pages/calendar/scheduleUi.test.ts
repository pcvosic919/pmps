import { describe, expect, it } from "vitest";
import { applyDraftChanges, enumerateDateKeys } from "./scheduleUi";

describe("schedule UI drafts", () => {
    it("applies create, update and cancel without mutating server data", () => {
        const base = [
            { id: "a", date: "2026-08-17", slot: "am", sourceType: "manual", title: "A", version: 1 },
            { id: "b", date: "2026-08-17", slot: "pm", sourceType: "manual", title: "B", version: 1 }
        ];
        const result = applyDraftChanges(base, [
            { kind: "update", id: "a", expectedVersion: 1, date: "2026-08-18", slot: "am", sourceType: "manual", title: "A" },
            { kind: "cancel", id: "b", expectedVersion: 1 },
            { kind: "create", clientId: "c", date: "2026-08-19", slot: "full_day", sourceType: "manual", title: "C" }
        ]);
        expect(result.map(item => item.id)).toEqual(["a", "draft:c"]);
        expect(result[0]).toMatchObject({ date: "2026-08-18", isDraft: true });
        expect(base[0].date).toBe("2026-08-17");
    });

    it("enumerates inclusive dates", () => {
        expect(enumerateDateKeys("2026-08-14", "2026-08-16")).toEqual(["2026-08-14", "2026-08-15", "2026-08-16"]);
    });
});
