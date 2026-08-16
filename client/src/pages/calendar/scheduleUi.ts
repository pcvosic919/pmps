import { addDays, format, parseISO } from "date-fns";

export type ScheduleSlot = "am" | "pm" | "full_day";
export type ScheduleSourceType = "wbs" | "project_support" | "presales" | "manual";

export type BlockFields = {
    date: string;
    slot: ScheduleSlot;
    sourceType: ScheduleSourceType;
    projectId?: string;
    wbsItemId?: string;
    opportunityId?: string;
    title?: string;
    workContent?: string;
    batchId?: string;
    overCapacityReason?: string;
};
export type DraftChange =
    | ({ kind: "create"; clientId: string } & BlockFields)
    | ({ kind: "update"; id: string; expectedVersion: number } & BlockFields)
    | { kind: "cancel"; id: string; expectedVersion: number };

export const sourceLabels: Record<ScheduleSourceType, string> = {
    wbs: "WBS",
    project_support: "專案支援",
    presales: "Presales",
    manual: "手動項目"
};

export const slotLabels: Record<ScheduleSlot, string> = {
    am: "上午",
    pm: "下午",
    full_day: "全天"
};

export const sourceClasses: Record<ScheduleSourceType, string> = {
    wbs: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-100",
    project_support: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-100",
    presales: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100",
    manual: "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
};

export const dateKey = (value: Date) => format(value, "yyyy-MM-dd");

export const enumerateDateKeys = (from: string, to: string) => {
    const start = parseISO(from);
    const end = parseISO(to);
    const result: string[] = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) result.push(dateKey(cursor));
    return result;
};

export const applyDraftChanges = (blocks: any[], changes: DraftChange[]) => {
    const map = new Map(blocks.map(block => [block.id, { ...block, isDraft: false }]));
    for (const change of changes) {
        if (change.kind === "cancel") {
            map.delete(change.id);
            continue;
        }
        if (change.kind === "update") {
            const existing = map.get(change.id);
            if (existing) map.set(change.id, { ...existing, ...change, isDraft: true });
            continue;
        }
        map.set(`draft:${change.clientId}`, {
            ...change,
            id: `draft:${change.clientId}`,
            clientId: change.clientId,
            version: 0,
            projectTitle: "",
            opportunityTitle: "",
            isDraft: true
        });
    }
    return Array.from(map.values());
};

export const displayBlockName = (block: any, projects: any[] = [], opportunities: any[] = []) => {
    if (block.sourceType === "manual") return block.title || "手動項目";
    if (block.projectTitle) return block.projectTitle;
    if (block.opportunityTitle) return block.opportunityTitle;
    if (block.projectId) return projects.find(project => project.id === block.projectId)?.title || block.title || "專案";
    if (block.opportunityId) return opportunities.find(opportunity => opportunity.id === block.opportunityId)?.title || block.title || "Presales";
    return block.title || "排程";
};

export const setCalendarQuery = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
};
