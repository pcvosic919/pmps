import type { SrStatus } from "../../shared/types";

type ProjectActivationLike = {
    title?: string;
    customerName?: string;
    srType?: string;
    finalPrice?: number | null;
    members?: Array<{ memberRole?: string }>;
    wbsVersions?: Array<{ status?: string }>;
};

const allowedProjectTransitions: Record<SrStatus, readonly SrStatus[]> = {
    new: ["in_progress", "on_hold", "cancelled"],
    in_progress: ["on_hold", "pending_acceptance", "closed", "completed", "cancelled"],
    on_hold: ["in_progress", "cancelled"],
    pending_acceptance: ["in_progress", "closed", "completed", "cancelled"],
    closed: [],
    completed: [],
    cancelled: []
};

export const projectStatusesRequiringReason = ["on_hold", "closed", "cancelled"] as const;

export const isClosedProjectStatus = (status?: string) => status === "closed" || status === "completed";

export const isProjectLocked = (status?: string) => isClosedProjectStatus(status) || status === "cancelled";

export const projectStatusRequiresReason = (status: SrStatus) =>
    projectStatusesRequiringReason.includes(status as typeof projectStatusesRequiringReason[number]);

export const canTransitionProjectStatus = (from: SrStatus, to: SrStatus) =>
    from === to || allowedProjectTransitions[from].includes(to);

export const assertProjectStatusTransition = (from: SrStatus, to: SrStatus, reason?: string) => {
    if (!canTransitionProjectStatus(from, to)) {
        throw new Error(`不允許專案狀態由 ${from} 轉為 ${to}`);
    }
    if (projectStatusRequiresReason(to) && !reason?.trim()) {
        throw new Error(`專案狀態轉為 ${to} 時必須填寫原因`);
    }
};

export const getProjectActivationIssues = (project: ProjectActivationLike): string[] => {
    const issues: string[] = [];
    if (!project.customerName?.trim()) issues.push("公司名稱");
    if (!project.title?.trim()) issues.push("專案名稱");
    if (!project.srType?.trim()) issues.push("專案類型");
    if (!(project.members || []).some((member) => member.memberRole === "owner")) issues.push("專案 Owner");
    if (project.finalPrice === undefined || project.finalPrice === null || !Number.isFinite(project.finalPrice)) {
        issues.push("最終成交金額");
    }
    if (!(project.wbsVersions || []).some((version) => version.status === "approved")) issues.push("已核准 WBS");
    return issues;
};

export const assertProjectReadyForActivation = (project: ProjectActivationLike) => {
    const issues = getProjectActivationIssues(project);
    if (issues.length > 0) {
        throw new Error(`專案尚未完成建置，請補齊：${issues.join("、")}`);
    }
};
