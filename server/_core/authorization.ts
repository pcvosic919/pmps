import { TRPCError } from "@trpc/server";
import type { UserSession } from "./trpc";
import type { Role } from "../../shared/types";

type IdLike = string | { toString(): string } | null | undefined;

type OpportunityLike = {
    ownerId?: IdLike;
    salesUserId?: IdLike;
    members?: Array<{ userId?: IdLike; memberRole?: string }>;
    presalesAssignments?: Array<{ techId?: IdLike }>;
};

type WbsItemLike = {
    assigneeId?: IdLike;
};

type WbsVersionLike = {
    items?: WbsItemLike[];
};

type ChangeRequestLike = {
    requesterId?: IdLike;
    status?: string;
};

type ServiceRequestLike = {
    createdById?: IdLike;
    pmId?: IdLike;
    members?: Array<{ userId?: IdLike; memberRole?: string }>;
    wbsVersions?: WbsVersionLike[];
    changeRequests?: ChangeRequestLike[];
};

type TimesheetLike = {
    techId?: IdLike;
};

const includesRole = (user: UserSession, role: Role) =>
    user.role === role;

export const hasAnyRole = (user: UserSession, roles: Role[]) =>
    roles.some(role => includesRole(user, role));

export const isAdminOrManager = (user: UserSession) =>
    hasAnyRole(user, ["admin", "manager"]);

// Only the immutable platform-owner identity can perform high-risk deletion.
export const canDeleteRecord = (user: UserSession) =>
    user.isPlatformOwner === true;

// Admin and manager can create / edit (but not delete)
export const canCreateOrEdit = (user: UserSession) =>
    hasAnyRole(user, ["admin", "manager"]);

export const idsMatch = (left: IdLike, right: IdLike) =>
    left != null && right != null && left.toString() === right.toString();

export const assertFound = <T>(resource: T | null | undefined, message = "找不到資料") => {
    if (!resource) {
        throw new TRPCError({ code: "NOT_FOUND", message });
    }
    return resource;
};

export const assertAuthorized = (condition: boolean, message = "您沒有權限執行此操作") => {
    if (!condition) {
        throw new TRPCError({ code: "FORBIDDEN", message });
    }
};

export const isOpportunityOwner = (user: UserSession, opportunity: OpportunityLike) =>
    idsMatch(opportunity.ownerId, user.id) ||
    (opportunity.members || []).some(member =>
        member.memberRole === "owner" && idsMatch(member.userId, user.id)
    );

export const isOpportunityBusinessOwner = (user: UserSession, opportunity: OpportunityLike) =>
    includesRole(user, "business") && isOpportunityOwner(user, opportunity);

export const canAccessOpportunity = (user: UserSession, opportunity: OpportunityLike) =>
    isAdminOrManager(user) ||
    isOpportunityOwner(user, opportunity) ||
    idsMatch(opportunity.salesUserId, user.id) ||
    (opportunity.members || []).some(member => idsMatch(member.userId, user.id)) ||
    (opportunity.presalesAssignments || []).some(assignment => idsMatch(assignment.techId, user.id));

// canManageOpportunity = admin/manager can fully manage, assigned presales can manage,
// and opportunity owners can manage only if they are not business-role owners
export const canManageOpportunity = (user: UserSession, opportunity: OpportunityLike) =>
    hasAnyRole(user, ["admin", "manager"]) ||
    ((isOpportunityOwner(user, opportunity) && !isOpportunityBusinessOwner(user, opportunity))) ||
    (opportunity.presalesAssignments || []).some(assignment => idsMatch(assignment.techId, user.id));

export const isResponsiblePm = (user: UserSession, serviceRequest: ServiceRequestLike) =>
    idsMatch(serviceRequest.pmId, user.id);

export const getProjectMemberRole = (user: UserSession, serviceRequest: ServiceRequestLike) =>
    (serviceRequest.members || []).find(member => idsMatch(member.userId, user.id))?.memberRole;

export const isProjectOwner = (user: UserSession, serviceRequest: ServiceRequestLike) => {
    const owner = (serviceRequest.members || []).find(member => member.memberRole === "owner");
    return owner ? idsMatch(owner.userId, user.id) : idsMatch(serviceRequest.createdById, user.id);
};

export const isActiveProjectMember = (user: UserSession, serviceRequest: ServiceRequestLike) => {
    const memberRole = getProjectMemberRole(user, serviceRequest);
    return !!memberRole && memberRole !== "watcher";
};

export const isServiceRequestMember = (user: UserSession, serviceRequest: ServiceRequestLike) =>
    (serviceRequest.members || []).some(member => idsMatch(member.userId, user.id)) ||
    (serviceRequest.wbsVersions || []).some(version =>
        (version.items || []).some(item => idsMatch(item.assigneeId, user.id))
    ) ||
    (serviceRequest.changeRequests || []).some(changeRequest =>
        idsMatch(changeRequest.requesterId, user.id)
    );

export const canAccessServiceRequest = (
    user: UserSession,
    serviceRequest: ServiceRequestLike,
    opportunity?: OpportunityLike | null
) =>
    hasAnyRole(user, ["admin"]) ||
    (hasAnyRole(user, ["pm"]) && (isResponsiblePm(user, serviceRequest) || !!getProjectMemberRole(user, serviceRequest))) ||
    (hasAnyRole(user, ["presales"]) && (isProjectOwner(user, serviceRequest) || isServiceRequestMember(user, serviceRequest))) ||
    (hasAnyRole(user, ["tech"]) && isServiceRequestMember(user, serviceRequest)) ||
    isServiceRequestMember(user, serviceRequest) ||
    (!!opportunity && canAccessOpportunity(user, opportunity));

export const canManageServiceRequestStatus = (
    user: UserSession,
    serviceRequest: ServiceRequestLike,
    opportunity?: OpportunityLike | null
) =>
    hasAnyRole(user, ["admin"]) ||
    (hasAnyRole(user, ["pm"]) && (isResponsiblePm(user, serviceRequest) || isActiveProjectMember(user, serviceRequest))) ||
    (hasAnyRole(user, ["presales"]) && isProjectOwner(user, serviceRequest)) ||
    (!!opportunity && isOpportunityBusinessOwner(user, opportunity));

export const canAccessChangeRequest = (
    user: UserSession,
    serviceRequest: ServiceRequestLike,
    changeRequest: ChangeRequestLike,
    opportunity?: OpportunityLike | null
) =>
    isAdminOrManager(user) ||
    canAccessServiceRequest(user, serviceRequest, opportunity) ||
    idsMatch(changeRequest.requesterId, user.id) ||
    (!!opportunity && canManageOpportunity(user, opportunity));

export const canReviewChangeRequest = (
    user: UserSession,
    serviceRequest: ServiceRequestLike,
    changeRequest: ChangeRequestLike,
    opportunity?: OpportunityLike | null
) => {
    if (hasAnyRole(user, ["admin"])) return true;
    if (hasAnyRole(user, ["pm"]) && (isResponsiblePm(user, serviceRequest) || isActiveProjectMember(user, serviceRequest))) return true;
    if (hasAnyRole(user, ["presales"]) && isProjectOwner(user, serviceRequest)) return true;
    if (changeRequest.status === "pending_business") {
        return !!opportunity && isOpportunityBusinessOwner(user, opportunity);
    }
    return false;
};

export const canManageTimesheet = (
    user: UserSession,
    timesheet: TimesheetLike,
    options?: {
        opportunity?: OpportunityLike | null;
        serviceRequest?: ServiceRequestLike | null;
    }
) =>
    hasAnyRole(user, ["admin"]) ||
    idsMatch(timesheet.techId, user.id) ||
    (!!options?.opportunity && canManageOpportunity(user, options.opportunity)) ||
    (!!options?.serviceRequest && isResponsiblePm(user, options.serviceRequest));

/**
 * 取得主管可管理的部門列表。
 * - admin → 回傳 null（代表不限制）
 * - manager 且有 managedDepartments → 回傳那些部門
 * - manager 但沒設定 managedDepartments → 退回到自己的 department（向下相容）
 * - 其他角色 → 回傳空陣列（代表不看部門層級資料）
 */
export const getManagedDepartments = (user: UserSession): string[] | null => {
    if (hasAnyRole(user, ["admin"])) return null; // null = 無限制

    if (hasAnyRole(user, ["manager"])) {
        return Array.from(new Set([
            user.department,
            ...(user.managedDepartments || [])
        ].map(department => department?.trim()).filter((department): department is string => Boolean(department))));
    }

    return []; // 非主管，不能看部門層級資料
};
