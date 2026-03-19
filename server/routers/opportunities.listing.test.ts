import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, type CursorValue } from "../_core/cursor";
import {
    buildOpportunityListQuery,
    type OpportunitySortField,
    type OpportunitySortOrder,
} from "./opportunities.listing";

type TestUser = {
    id: string;
    role: string;
    roles: string[];
};

type TestOpportunity = {
    _id: mongoose.Types.ObjectId;
    title: string;
    customerName: string;
    ownerId: mongoose.Types.ObjectId;
    members: Array<{ userId: mongoose.Types.ObjectId }>;
    presalesAssignments: Array<{ techId: mongoose.Types.ObjectId }>;
    createdAt: Date;
    status: string;
    estimatedValue: number;
};

type Query = Record<string, unknown>;

const managerUser: TestUser = {
    id: new mongoose.Types.ObjectId().toString(),
    role: "manager",
    roles: []
};

const memberUser: TestUser = {
    id: new mongoose.Types.ObjectId().toString(),
    role: "business",
    roles: []
};

const outsiderId = new mongoose.Types.ObjectId();
const memberObjectId = new mongoose.Types.ObjectId(memberUser.id);

const opportunities: TestOpportunity[] = [
    {
        _id: new mongoose.Types.ObjectId("000000000000000000000001"),
        title: "Alpha Searchable",
        customerName: "Target Labs",
        ownerId: outsiderId,
        members: [],
        presalesAssignments: [],
        createdAt: new Date("2025-01-07T00:00:00.000Z"),
        status: "won",
        estimatedValue: 900
    },
    {
        _id: new mongoose.Types.ObjectId("000000000000000000000002"),
        title: "Bravo Visible",
        customerName: "Northwind",
        ownerId: memberObjectId,
        members: [],
        presalesAssignments: [],
        createdAt: new Date("2025-01-06T00:00:00.000Z"),
        status: "qualified",
        estimatedValue: 800
    },
    {
        _id: new mongoose.Types.ObjectId("000000000000000000000003"),
        title: "Charlie Searchable",
        customerName: "Target Energy",
        ownerId: outsiderId,
        members: [{ userId: memberObjectId }],
        presalesAssignments: [],
        createdAt: new Date("2025-01-05T00:00:00.000Z"),
        status: "proposal",
        estimatedValue: 700
    },
    {
        _id: new mongoose.Types.ObjectId("000000000000000000000004"),
        title: "Delta Visible",
        customerName: "Contoso",
        ownerId: outsiderId,
        members: [],
        presalesAssignments: [{ techId: memberObjectId }],
        createdAt: new Date("2025-01-04T00:00:00.000Z"),
        status: "negotiation",
        estimatedValue: 600
    },
    {
        _id: new mongoose.Types.ObjectId("000000000000000000000005"),
        title: "Echo Searchable",
        customerName: "Target Retail",
        ownerId: memberObjectId,
        members: [],
        presalesAssignments: [],
        createdAt: new Date("2025-01-03T00:00:00.000Z"),
        status: "new",
        estimatedValue: 500
    },
    {
        _id: new mongoose.Types.ObjectId("000000000000000000000006"),
        title: "Foxtrot Searchable",
        customerName: "Target Health",
        ownerId: outsiderId,
        members: [{ userId: memberObjectId }],
        presalesAssignments: [],
        createdAt: new Date("2025-01-02T00:00:00.000Z"),
        status: "lost",
        estimatedValue: 400
    }
];

const getFieldValues = (value: unknown, segments: string[]): unknown[] => {
    if (segments.length === 0) {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.flatMap((item) => getFieldValues(item, segments));
    }

    if (value == null || typeof value !== "object") {
        return [];
    }

    const [segment, ...rest] = segments;
    return getFieldValues((value as Record<string, unknown>)[segment], rest);
};

const normalizeComparable = (value: unknown): string | number | null => {
    if (value instanceof Date) {
        return value.toISOString();
    }

    if (value instanceof mongoose.Types.ObjectId) {
        return value.toString();
    }

    if (value == null) {
        return null;
    }

    return value as string | number;
};

const valuesEqual = (left: unknown, right: unknown) => normalizeComparable(left) === normalizeComparable(right);

const compareValues = (left: unknown, right: unknown) => {
    const normalizedLeft = normalizeComparable(left);
    const normalizedRight = normalizeComparable(right);

    if (normalizedLeft === normalizedRight) {
        return 0;
    }

    if (normalizedLeft == null) {
        return -1;
    }

    if (normalizedRight == null) {
        return 1;
    }

    return normalizedLeft < normalizedRight ? -1 : 1;
};

const matchFieldCondition = (values: unknown[], condition: unknown) => {
    if (
        condition != null &&
        typeof condition === "object" &&
        !Array.isArray(condition) &&
        !(condition instanceof Date) &&
        !(condition instanceof mongoose.Types.ObjectId)
    ) {
        const operators = condition as Record<string, unknown>;

        if ("$regex" in operators) {
            const regex = new RegExp(String(operators.$regex), String(operators.$options ?? ""));
            return values.some((value) => regex.test(String(value ?? "")));
        }

        return values.some((value) => Object.entries(operators).every(([operator, operand]) => {
            if (operator === "$gt") {
                return compareValues(value, operand) > 0;
            }

            if (operator === "$lt") {
                return compareValues(value, operand) < 0;
            }

            return false;
        }));
    }

    return values.some((value) => valuesEqual(value, condition));
};

const matchesQuery = (doc: TestOpportunity, query: Query): boolean => {
    if (Object.keys(query).length === 0) {
        return true;
    }

    return Object.entries(query).every(([key, condition]) => {
        if (key === "$and") {
            return (condition as Query[]).every((clause) => matchesQuery(doc, clause));
        }

        if (key === "$or") {
            return (condition as Query[]).some((clause) => matchesQuery(doc, clause));
        }

        return matchFieldCondition(getFieldValues(doc, key.split(".")), condition);
    });
};

const sortOpportunities = (
    items: TestOpportunity[],
    sortBy: OpportunitySortField,
    sortOrder: OpportunitySortOrder
) => {
    const direction = sortOrder === "desc" ? -1 : 1;

    return [...items].sort((left, right) => {
        const fieldComparison = compareValues(left[sortBy], right[sortBy]);
        if (fieldComparison !== 0) {
            return fieldComparison * direction;
        }

        return compareValues(left._id, right._id) * direction;
    });
};

const paginate = ({
    user,
    sortBy,
    sortOrder = "desc",
    limit = 2,
    search,
    cursor,
}: {
    user: TestUser;
    sortBy: OpportunitySortField;
    sortOrder?: OpportunitySortOrder;
    limit?: number;
    search?: string;
    cursor?: string;
}) => {
    const decodedCursor = cursor ? decodeCursor(cursor) : null;
    const query = buildOpportunityListQuery({
        search,
        cursor: decodedCursor,
        sortBy,
        sortOrder,
        user,
    });

    const matched = sortOpportunities(opportunities.filter((item) => matchesQuery(item, query)), sortBy, sortOrder);
    const items = matched.slice(0, limit + 1);
    const pageItems = items.slice(0, limit);
    const lastItem = pageItems[pageItems.length - 1];

    return {
        query,
        pageItems,
        nextCursor: items.length > limit && lastItem
            ? encodeCursor(lastItem._id, normalizeComparable(lastItem[sortBy]) as CursorValue)
            : undefined,
    };
};

describe("buildOpportunityListQuery", () => {
    it("將搜尋、權限、游標條件合併成單一 query", () => {
        const cursor = encodeCursor("000000000000000000000006", 400);
        const query = buildOpportunityListQuery({
            search: "target",
            cursor: decodeCursor(cursor),
            sortBy: "estimatedValue",
            sortOrder: "desc",
            user: memberUser,
        });

        expect(query).toEqual({
            $and: [
                {
                    $or: [
                        { title: { $regex: "target", $options: "i" } },
                        { customerName: { $regex: "target", $options: "i" } },
                    ],
                },
                {
                    $or: [
                        { ownerId: memberObjectId },
                        { "members.userId": memberObjectId },
                        { "presalesAssignments.techId": memberObjectId },
                    ],
                },
                {
                    $or: [
                        { estimatedValue: { $lt: 400 } },
                        { estimatedValue: 400, _id: { $lt: new mongoose.Types.ObjectId("000000000000000000000006") } },
                    ],
                },
            ],
        });
    });

    it("admin / manager 不額外帶入權限過濾", () => {
        expect(buildOpportunityListQuery({
            sortBy: "createdAt",
            sortOrder: "desc",
            user: managerUser,
        })).toEqual({});
    });

    it("建立時間排序的游標會轉回 Date，避免 Mongo 查詢抓不到商機", () => {
        const cursor = encodeCursor("000000000000000000000006", "2025-01-02T00:00:00.000Z");
        const query = buildOpportunityListQuery({
            cursor: decodeCursor(cursor),
            sortBy: "createdAt",
            sortOrder: "desc",
            user: memberUser,
        });

        expect(query).toEqual({
            $and: [
                {
                    $or: [
                        { ownerId: memberObjectId },
                        { "members.userId": memberObjectId },
                        { "presalesAssignments.techId": memberObjectId },
                    ],
                },
                {
                    $or: [
                        { createdAt: { $lt: new Date("2025-01-02T00:00:00.000Z") } },
                        { createdAt: new Date("2025-01-02T00:00:00.000Z"), _id: { $lt: new mongoose.Types.ObjectId("000000000000000000000006") } },
                    ],
                },
            ],
        });
    });

});

describe("opportunity list pagination regression", () => {
    it.each(["createdAt", "status", "estimatedValue"] as const)(
        "同一批資料在 %s 排序下，權限使用者不會拿到空白頁",
        (sortBy) => {
            const expectedIds = sortOpportunities(
                opportunities.filter((item) => matchesQuery(item, buildOpportunityListQuery({
                    sortBy,
                    sortOrder: "desc",
                    user: memberUser,
                }))),
                sortBy,
                "desc"
            ).map((item) => item._id.toString());

            const collectedIds: string[] = [];
            let cursor: string | undefined;
            let pageCount = 0;

            do {
                const page = paginate({
                    user: memberUser,
                    sortBy,
                    sortOrder: "desc",
                    limit: 2,
                    cursor,
                });

                if (page.nextCursor) {
                    expect(page.pageItems.length).toBeGreaterThan(0);
                }

                collectedIds.push(...page.pageItems.map((item) => item._id.toString()));
                cursor = page.nextCursor;
                pageCount += 1;
            } while (cursor);

            expect(pageCount).toBeGreaterThan(1);
            expect(collectedIds).toEqual(expectedIds);
        }
    );
});
