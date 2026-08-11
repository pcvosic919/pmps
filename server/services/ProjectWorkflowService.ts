import type { SrStatus } from "../../shared/types";

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
