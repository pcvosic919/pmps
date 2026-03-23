import { hasAnyRole } from "../_core/authorization";
import { toObjectId, type CursorValue } from "../_core/cursor";
import { UserModel } from "../models/User";

export const opportunitySortFields = ["createdAt", "estimatedValue", "status"] as const;

export type OpportunitySortField = (typeof opportunitySortFields)[number];
export type OpportunitySortOrder = "asc" | "desc";

type OpportunityListUser = {
    id: string;
    role: string;
    roles: string[];
    department?: string;
};

type OpportunityListCursor = {
    id: string;
    value: CursorValue;
};

const normalizeCursorValue = (sortBy: OpportunitySortField, value: CursorValue) => {
    if (sortBy === "createdAt" && typeof value === "string") {
        return new Date(value);
    }

    return value;
};

export const buildOpportunitySearchQuery = (search?: string) => {
    const keyword = search?.trim();
    if (!keyword) {
        return {};
    }

    return {
        $text: {
            $search: keyword
        }
    };
};

export const getAccessibleOpportunityQuery = async (ctxUser: OpportunityListUser) => {
    const userObjectId = toObjectId(ctxUser.id);
    const baseAccess = [
        { ownerId: userObjectId },
        { "members.userId": userObjectId },
        { "presalesAssignments.techId": userObjectId }
    ];

    if (hasAnyRole(ctxUser as any, ["admin", "manager"])) {
        if (ctxUser.department) {
            const usersInDept = await UserModel.find({ department: ctxUser.department }, { _id: 1 }).lean();
            const userIds = usersInDept.map(u => u._id);
            return {
                $or: [
                    ...baseAccess,
                    { ownerId: { $in: userIds } }
                ]
            };
        } else if (hasAnyRole(ctxUser as any, ["admin"])) {
            return {};
        }
    }

    return { $or: baseAccess };
};

export const buildOpportunityListQuery = async ({
    search,
    cursor,
    sortBy,
    sortOrder,
    user
}: {
    search?: string;
    cursor?: OpportunityListCursor | null;
    sortBy: OpportunitySortField;
    sortOrder: OpportunitySortOrder;
    user: OpportunityListUser;
}) => {
    const clauses: Record<string, unknown>[] = [];
    const searchQuery = buildOpportunitySearchQuery(search);
    const accessQuery = await getAccessibleOpportunityQuery(user);

    if (Object.keys(searchQuery).length > 0) {
        clauses.push(searchQuery);
    }

    if (Object.keys(accessQuery).length > 0) {
        clauses.push(accessQuery);
    }

    if (cursor) {
        const direction = sortOrder === "desc" ? -1 : 1;
        const comparisonOperator = direction === 1 ? "$gt" : "$lt";

        clauses.push({
            $or: [
                { [sortBy]: { [comparisonOperator]: normalizeCursorValue(sortBy, cursor.value) } },
                { [sortBy]: normalizeCursorValue(sortBy, cursor.value), _id: { [comparisonOperator]: toObjectId(cursor.id) } }
            ]
        });
    }

    return clauses.length > 0 ? { $and: clauses } : {};
};
