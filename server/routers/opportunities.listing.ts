import { getManagedDepartments, hasAnyRole } from "../_core/authorization";
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

    // Admin and manager can see all opportunity records.
    if (hasAnyRole(ctxUser as any, ["admin", "manager"])) {
        return {};
    }

    const depts = getManagedDepartments(ctxUser as any);
    if (depts !== null && depts.length > 0) {
        const deptUsers = await UserModel.find({ department: { $in: depts } }, { _id: 1 }).lean();
        const deptUserIds = deptUsers.map(u => u._id);
        const departmentApprovalMap: Record<string, Record<string, boolean>> = {
            IE0C00: { approvedSecurity: true },
            IE0C30: { approvedM365: true },
            IE0C50: { approvedAzure: true }
        };

        const accessOrClauses: Record<string, unknown>[] = [
            ...baseAccess
        ];

        if (deptUserIds.length > 0) {
            accessOrClauses.push(
                { ownerId: { $in: deptUserIds } },
                { "members.userId": { $in: deptUserIds } },
                { "presalesAssignments.techId": { $in: deptUserIds } }
            );
        }

        // 對每個管理的部門，加入對應的 approval flag 過濾
        for (const dept of depts) {
            const approvalClause = departmentApprovalMap[dept];
            if (approvalClause) {
                accessOrClauses.push(approvalClause);
            }
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
