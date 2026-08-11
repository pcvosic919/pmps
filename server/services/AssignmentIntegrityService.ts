import { IssueModel } from "../models/Issue";
import { OpportunityModel } from "../models/Opportunity";
import { ServiceRequestModel } from "../models/ServiceRequest";
import { UserModel } from "../models/User";

export type AssignmentIssueType = "missing" | "inactive" | "role_mismatch" | "duplicate";

export type AssignmentIntegrityIssue = {
    entityType: "project" | "opportunity" | "issue";
    entityId: string;
    entityName: string;
    path: string;
    userId: string;
    issueType: AssignmentIssueType;
    detail: string;
    repaired: boolean;
};

const idText = (value: any) => value?._id?.toString?.() || value?.toString?.() || "";

const uniqueIds = (values: any[]) => {
    const seen = new Set<string>();
    return values.filter((value) => {
        const id = idText(value);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
};

const allowedRoles: Record<string, string[]> = {
    project_pm: ["pm"],
    wbs: ["pm", "presales", "tech"],
    presales: ["pm", "presales", "tech"],
    issue: ["pm", "presales", "tech"]
};

export const scanAssignmentIntegrity = async (options: { commit?: boolean } = {}) => {
    const commit = options.commit === true;
    const users = await UserModel.find({}, { name: 1, email: 1, department: 1, role: 1, isActive: 1 }).lean();
    const userMap = new Map(users.map((user: any) => [user._id.toString(), user]));
    const issues: AssignmentIntegrityIssue[] = [];

    const inspect = (input: {
        entityType: AssignmentIntegrityIssue["entityType"];
        entityId: string;
        entityName: string;
        path: string;
        userId: string;
        context?: keyof typeof allowedRoles;
        repaired?: boolean;
    }) => {
        if (!input.userId) return;
        const user = userMap.get(input.userId);
        if (!user) {
            issues.push({ ...input, issueType: "missing", detail: "帳號不存在；保留歷史參照並建立姓名快照佔位。", repaired: input.repaired === true });
        } else if (user.isActive === false) {
            issues.push({ ...input, issueType: "inactive", detail: `帳號 ${user.name || user.email} 已停用；不可再次指派。`, repaired: input.repaired === true });
        } else if (input.context && !allowedRoles[input.context].includes(user.role)) {
            issues.push({ ...input, issueType: "role_mismatch", detail: `角色 ${user.role} 不符合 ${input.context} 指派資格。`, repaired: false });
        }
    };

    const projects = await ServiceRequestModel.find({});
    for (const project of projects as any[]) {
        let changed = false;
        const entity = { entityType: "project" as const, entityId: project._id.toString(), entityName: project.title || project.projectCode || "" };
        inspect({ ...entity, path: "pmId", userId: idText(project.pmId), context: "project_pm" });

        const memberIds = (project.members || []).map((member: any) => idText(member.userId)).filter(Boolean);
        const uniqueMemberIds = new Set<string>();
        for (const memberId of memberIds) {
            if (uniqueMemberIds.has(memberId)) issues.push({ ...entity, path: "members", userId: memberId, issueType: "duplicate", detail: "專案成員重複。", repaired: commit });
            uniqueMemberIds.add(memberId);
            inspect({ ...entity, path: "members", userId: memberId });
        }
        if (commit && uniqueMemberIds.size !== memberIds.length) {
            const seen = new Set<string>();
            project.members = (project.members || []).filter((member: any) => {
                const id = idText(member.userId);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
            changed = true;
        }

        for (const [versionIndex, version] of (project.wbsVersions || []).entries()) {
            for (const [itemIndex, item] of (version.items || []).entries()) {
                const rawIds = [item.assigneeId, ...(item.assigneeIds || [])].map(idText).filter(Boolean);
                const ids = uniqueIds([item.assigneeId, ...(item.assigneeIds || [])]).map(idText);
                if (rawIds.length !== ids.length) {
                    issues.push({ ...entity, path: `wbsVersions.${versionIndex}.items.${itemIndex}.assigneeIds`, userId: ids.join(","), issueType: "duplicate", detail: "WBS 指派人員重複。", repaired: commit });
                }
                for (const userId of ids) inspect({ ...entity, path: `wbsVersions.${versionIndex}.items.${itemIndex}`, userId, context: "wbs", repaired: commit });
                if (commit) {
                    item.assigneeIds = ids;
                    item.assigneeId = ids[0] || undefined;
                    item.assigneeSnapshots = ids.map((userId: string) => {
                        const user = userMap.get(userId);
                        return {
                            userId,
                            name: user?.name || `歷史帳號 ${userId}`,
                            email: user?.email || "",
                            department: user?.department || "",
                            isActive: user?.isActive !== false
                        };
                    });
                    changed = true;
                }
            }
        }
        if (commit && changed) {
            project.markModified("members");
            project.markModified("wbsVersions");
            await project.save();
        }
    }

    const opportunities = await OpportunityModel.find({});
    for (const opportunity of opportunities as any[]) {
        let changed = false;
        const entity = { entityType: "opportunity" as const, entityId: opportunity._id.toString(), entityName: opportunity.title || opportunity.opportunityCode || "" };
        inspect({ ...entity, path: "ownerId", userId: idText(opportunity.ownerId) });
        inspect({ ...entity, path: "salesUserId", userId: idText(opportunity.salesUserId) });
        const assignments = opportunity.presalesAssignments || [];
        const seen = new Set<string>();
        for (const assignment of assignments) {
            const userId = idText(assignment.techId);
            if (seen.has(userId)) issues.push({ ...entity, path: "presalesAssignments", userId, issueType: "duplicate", detail: "協銷指派人員重複。", repaired: commit });
            seen.add(userId);
            inspect({ ...entity, path: "presalesAssignments", userId, context: "presales" });
        }
        if (commit && seen.size !== assignments.length) {
            const dedupe = new Set<string>();
            opportunity.presalesAssignments = assignments.filter((assignment: any) => {
                const id = idText(assignment.techId);
                if (dedupe.has(id)) return false;
                dedupe.add(id);
                return true;
            });
            changed = true;
        }
        if (commit && changed) {
            opportunity.markModified("presalesAssignments");
            await opportunity.save();
        }
    }

    const issueDocs = await IssueModel.find({ assigneeId: { $exists: true } }).lean();
    for (const issue of issueDocs as any[]) {
        inspect({
            entityType: "issue",
            entityId: issue._id.toString(),
            entityName: issue.title || "",
            path: "assigneeId",
            userId: idText(issue.assigneeId),
            context: "issue"
        });
    }

    const counts = { missing: 0, inactive: 0, role_mismatch: 0, duplicate: 0 };
    for (const issue of issues) counts[issue.issueType] += 1;
    return {
        mode: commit ? "commit" : "dry-run",
        scanned: { users: users.length, projects: projects.length, opportunities: opportunities.length, issues: issueDocs.length },
        counts,
        issueCount: issues.length,
        repairedCount: issues.filter((issue) => issue.repaired).length,
        issues
    };
};
