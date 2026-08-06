import type { FeaturePermission } from "../../shared/types";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { UserModel } from "../models/User";
import {
    canAccessServiceRequest,
    canManageServiceRequestStatus,
    getManagedDepartments,
    hasAnyRole,
} from "./authorization";
import { toObjectId } from "./cursor";

export type ProjectAccessUser = {
    id: string;
    role: string;
    department?: string;
    managedDepartments?: string[];
    permissionOverrides: { allow: FeaturePermission[]; deny: FeaturePermission[] };
};

const idString = (value: any) => value?._id?.toString?.() || value?.toString?.() || "";

export const directProjectClauses = (userId: string, includeCreatedBy = false) => {
    const userObjectId = toObjectId(userId);
    return [
        { pmId: userObjectId },
        { "members.userId": userObjectId },
        { "changeRequests.requesterId": userObjectId },
        { "wbsVersions.items.assigneeId": userObjectId },
        { "wbsVersions.items.assigneeIds": userObjectId },
        ...(includeCreatedBy ? [{ createdById: userObjectId }] : [])
    ];
};

export const buildManagerProjectScopeQuery = async (user: ProjectAccessUser) => {
    const departments = getManagedDepartments(user as any) || [];
    if (departments.length === 0) {
        return {
            $or: [
                { pmId: toObjectId(user.id) },
                { "members.userId": toObjectId(user.id) }
            ]
        };
    }

    const departmentUsers = await UserModel.find(
        { department: { $in: departments }, isActive: { $ne: false } },
        { _id: 1 }
    ).lean();
    const departmentUserIds = departmentUsers.map(userRecord => userRecord._id);
    const clauses: Record<string, unknown>[] = [
        { createdByDepartment: { $in: departments } },
        { salesDepartment: { $in: departments } },
        { "externalAssignments.department": { $in: departments } },
        { "externalAssignments.teamDepartment": { $in: departments } }
    ];
    if (departmentUserIds.length > 0) {
        clauses.push(
            { pmId: { $in: departmentUserIds } },
            { "members.userId": { $in: departmentUserIds } },
            { "wbsVersions.items.assigneeId": { $in: departmentUserIds } },
            { "wbsVersions.items.assigneeIds": { $in: departmentUserIds } },
            { "externalAssignments.userId": { $in: departmentUserIds } }
        );
    }
    return { $or: clauses };
};

const projectMatchesQuery = async (project: any, query: Record<string, unknown>) => {
    const projectId = idString(project?._id || project?.id);
    if (!projectId) return false;
    return !!await ServiceRequestModel.exists({ _id: projectId, ...query });
};

export const managerCanAccessProject = async (user: ProjectAccessUser, project: any) =>
    projectMatchesQuery(project, await buildManagerProjectScopeQuery(user));

export const managerCanAccessUser = async (user: ProjectAccessUser, userId: string) => {
    const departments = getManagedDepartments(user as any) || [];
    if (departments.length === 0) return user.id === userId;
    return !!await UserModel.exists({ _id: userId, department: { $in: departments }, isActive: { $ne: false } });
};

export const projectPermissionDenied = (user: ProjectAccessUser, permission: FeaturePermission) =>
    user.permissionOverrides?.deny?.includes(permission) === true;

const projectPermissionAllowed = (user: ProjectAccessUser, permission: FeaturePermission) =>
    user.permissionOverrides?.allow?.includes(permission) === true;

export const canViewProject = async (user: ProjectAccessUser, project: any, opportunity?: any) => {
    if (projectPermissionDenied(user, "module.projects.view")) return false;
    if (hasAnyRole(user as any, ["admin"])) return true;
    if (hasAnyRole(user as any, ["manager"])) return managerCanAccessProject(user, project);
    return canAccessServiceRequest(user as any, project, opportunity);
};

export const canOperateProject = async (
    user: ProjectAccessUser,
    project: any,
    opportunity?: any,
    permission: FeaturePermission = "project.edit"
) => {
    if (projectPermissionDenied(user, "module.projects.view") || projectPermissionDenied(user, permission)) return false;
    if (hasAnyRole(user as any, ["admin"])) return true;
    if (hasAnyRole(user as any, ["manager"])) return managerCanAccessProject(user, project);
    if (canManageServiceRequestStatus(user as any, project, opportunity)) return true;
    return projectPermissionAllowed(user, permission) && canViewProject(user, project, opportunity);
};

export const canManageProjectMembers = (user: ProjectAccessUser, project: any, opportunity?: any) =>
    canOperateProject(user, project, opportunity, "project.manage_members");

export const canArchiveProject = (user: ProjectAccessUser, project: any, opportunity?: any) =>
    canOperateProject(user, project, opportunity, "project.archive");

export const canReviewProject = (user: ProjectAccessUser, project: any, opportunity?: any) =>
    canOperateProject(user, project, opportunity, "wbs.review");

export const canEditProjectWbs = async (user: ProjectAccessUser, project: any, opportunity?: any) => {
    if (projectPermissionDenied(user, "module.projects.view") || projectPermissionDenied(user, "wbs.submit")) return false;
    if (hasAnyRole(user as any, ["tech"])) return canViewProject(user, project, opportunity);
    return canOperateProject(user, project, opportunity, "wbs.submit");
};

export const getProjectCapabilities = async (
    user: ProjectAccessUser,
    project: any,
    opportunity?: any,
    options: { knownVisible?: boolean } = {}
) => {
    const knownVisible = options.knownVisible === true;
    const canView = !projectPermissionDenied(user, "module.projects.view") &&
        (knownVisible || await canViewProject(user, project, opportunity));
    const canPerform = async (permission: FeaturePermission) => {
        if (!canView || projectPermissionDenied(user, permission)) return false;
        if (knownVisible && hasAnyRole(user as any, ["admin", "manager"])) return true;
        return canOperateProject(user, project, opportunity, permission);
    };

    const [canOperate, canReview, canManageMembers, canArchive] = await Promise.all([
        canPerform("project.edit"),
        canPerform("wbs.review"),
        canPerform("project.manage_members"),
        canPerform("project.archive"),
    ]);
    const canEditWbs = hasAnyRole(user as any, ["tech"])
        ? canView && !projectPermissionDenied(user, "wbs.submit")
        : await canPerform("wbs.submit");
    return { canView, canOperate, canReview, canManageMembers, canArchive, canEditWbs };
};
