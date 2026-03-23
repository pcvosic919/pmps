import { TRPCError } from "@trpc/server";
import type { UserSession } from "./trpc";
import type { Role } from "../../shared/types";

type IdLike = string | { toString(): string } | null | undefined;

type OpportunityLike = {
    ownerId?: IdLike;
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
    pmId?: IdLike;
    members?: Array<{ userId?: IdLike; memberRole?: string }>;
    wbsVersions?: WbsVersionLike[];
    changeRequests?: ChangeRequestLike[];
};

type TimesheetLike = {
    techId?: IdLike;
};

const includesRole = (user: UserSession, role: Role) =>
    user.role === role || user.roles.includes(role);

export const hasAnyRole = (user: UserSession, roles: Role[]) =>
    roles.some(role => includesRole(user, role));

export const isAdminOrManager = (user: UserSession) =>
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
    (opportunity.members || []).some(member => idsMatch(member.userId, user.id)) ||
    (opportunity.presalesAssignments || []).some(assignment => idsMatch(assignment.techId, user.id));

export const canManageOpportunity = (user: UserSession, opportunity: OpportunityLike) =>
    hasAnyRole(user, ["admin"]) ||
    isOpportunityOwner(user, opportunity) ||
    isOpportunityBusinessOwner(user, opportunity);

export const isResponsiblePm = (user: UserSession, serviceRequest: ServiceRequestLike) =>
    idsMatch(serviceRequest.pmId, user.id);

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
    isAdminOrManager(user) ||
    isResponsiblePm(user, serviceRequest) ||
    isServiceRequestMember(user, serviceRequest) ||
    (!!opportunity && canAccessOpportunity(user, opportunity));

export const canManageServiceRequestStatus = (
    user: UserSession,
    serviceRequest: ServiceRequestLike,
    opportunity?: OpportunityLike | null
) =>
    hasAnyRole(user, ["admin"]) ||
    isResponsiblePm(user, serviceRequest) ||
    (!!opportunity && isOpportunityBusinessOwner(user, opportunity));

export const canAccessChangeRequest = (
    user: UserSession,
    serviceRequest: ServiceRequestLike,
    changeRequest: ChangeRequestLike,
    opportunity?: OpportunityLike | null
) =>
    isAdminOrManager(user) ||
    isResponsiblePm(user, serviceRequest) ||
    idsMatch(changeRequest.requesterId, user.id) ||
    (!!opportunity && canManageOpportunity(user, opportunity));

export const canReviewChangeRequest = (
    user: UserSession,
    changeRequest: ChangeRequestLike,
    opportunity?: OpportunityLike | null
) => {
    if (isAdminOrManager(user)) return true;
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
    isAdminOrManager(user) ||
    idsMatch(timesheet.techId, user.id) ||
    (!!options?.opportunity && canManageOpportunity(user, options.opportunity)) ||
    (!!options?.serviceRequest && isResponsiblePm(user, options.serviceRequest));
