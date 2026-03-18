import { hasAnyRole } from "../_core/authorization";
import { toObjectId, type CursorValue } from "../_core/cursor";

export const opportunitySortFields = ["createdAt", "estimatedValue", "status"] as const;

export type OpportunitySortField = (typeof opportunitySortFields)[number];
export type OpportunitySortOrder = "asc" | "desc";

type OpportunityListUser = {
    id: string;
    role: string;
    roles: string[];
};

type OpportunityListCursor = {
    id: string;
    value: CursorValue;
};

export const buildOpportunitySearchQuery = (search?: string) => {
    if (!search) {
        return {};
    }

    return {
        $or: [
            { title: { $regex: search, $options: "i" } },
            { customerName: { $regex: search, $options: "i" } }
        ]
    };
};

export const getAccessibleOpportunityQuery = (ctxUser: OpportunityListUser) => {
    if (hasAnyRole(ctxUser as any, ["admin", "manager"])) {
        return {};
    }

    const userObjectId = toObjectId(ctxUser.id);

    return {
        $or: [
            { ownerId: userObjectId },
            { "members.userId": userObjectId },
            { "presalesAssignments.techId": userObjectId }
        ]
    };
};

export const buildOpportunityListQuery = ({
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
    const accessQuery = getAccessibleOpportunityQuery(user);

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
                { [sortBy]: { [comparisonOperator]: cursor.value } },
                { [sortBy]: cursor.value, _id: { [comparisonOperator]: toObjectId(cursor.id) } }
            ]
        });
    }

    return clauses.length > 0 ? { $and: clauses } : {};
};
