import { hasAnyRole } from "../_core/authorization";
import { toObjectId, type CursorValue } from "../_core/cursor";
import { UserModel } from "../models/User";


export const opportunitySortFields = ["createdAt", "estimatedValue", "status"] as const;

export type OpportunitySortField = (typeof opportunitySortFields)[number];
export type OpportunitySortOrder = "asc" | "desc";

type OpportunityListUser = {
    id: string;
    role: string;
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

export const directOpportunityClauses = (userId: string) => {
    const userObjectId = toObjectId(userId);
    return [
        { ownerId: userObjectId },
        { salesUserId: userObjectId },
        { "members.userId": userObjectId },
        { "presalesAssignments.techId": userObjectId }
    ];
};

export const getDirectAccessibleOpportunityQuery = (ctxUser: OpportunityListUser) => {
    if (hasAnyRole(ctxUser as any, ["admin"])) return {};
    return { $or: directOpportunityClauses(ctxUser.id) };
};

export const getAccessibleOpportunityQuery = async (ctxUser: OpportunityListUser) => {
    const baseAccess = directOpportunityClauses(ctxUser.id);

    // Only Admin can see every opportunity record.
    if (hasAnyRole(ctxUser as any, ["admin"])) {
        return {};
    }

    const department = ctxUser.department?.trim();
    if (department) {
        const deptUsers = await UserModel.find(
            { department, isActive: { $ne: false } },
            { _id: 1 }
        ).lean();
        const deptUserIds = deptUsers.map(u => u._id);
        const accessOrClauses: Record<string, unknown>[] = [
            ...baseAccess,
            { salesDepartment: department }
        ];

        if (deptUserIds.length > 0) {
            accessOrClauses.push(
                { ownerId: { $in: deptUserIds } },
                { salesUserId: { $in: deptUserIds } },
                { "members.userId": { $in: deptUserIds } },
                { "presalesAssignments.techId": { $in: deptUserIds } }
            );
        }

        return {
            $or: accessOrClauses
        };
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
