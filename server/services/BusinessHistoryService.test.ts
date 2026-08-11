import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { buildBusinessHistoryEvent } from "./BusinessHistoryService";

describe("BusinessHistoryService", () => {
    it("normalizes actor metadata and reasons", () => {
        const entityId = new mongoose.Types.ObjectId();
        const actorId = new mongoose.Types.ObjectId();
        const event = buildBusinessHistoryEvent({
            entityType: "opportunity",
            entityId,
            action: " status_changed ",
            actorId,
            actorRole: "business",
            reason: "  客戶確認  ",
            source: "ui"
        });

        expect(event.entityId).toEqual(entityId);
        expect(event.actorId).toEqual(actorId);
        expect(event.action).toBe("status_changed");
        expect(event.reason).toBe("客戶確認");
        expect(event.source).toBe("ui");
    });
});
