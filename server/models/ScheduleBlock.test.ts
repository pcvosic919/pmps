import { describe, expect, it } from "vitest";
import { ScheduleBlockModel } from "./ScheduleBlock";

describe("ScheduleBlock migration indexes", () => {
    it.each([
        ["migratedFromCalendarTaskId", "objectId"],
        ["migratedFromWbsKey", "string"]
    ])("uses a partial unique index for %s", (field, bsonType) => {
        const indexes = ScheduleBlockModel.schema.indexes() as Array<[
            Record<string, number>,
            Record<string, unknown>
        ]>;
        const index = indexes.find(([keys]) => field in keys);

        expect(index).toBeDefined();
        expect(index?.[1]).toMatchObject({
            unique: true,
            partialFilterExpression: { [field]: { $type: bsonType } }
        });
        expect(index?.[1]).not.toHaveProperty("sparse");
    });
});
