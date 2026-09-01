import { useMemo, useState } from "react";
import { FileText, RefreshCw, Search } from "lucide-react";
import { trpc } from "../lib/trpc";

const ACTION_LABELS: Record<string, string> = {
    created: "建立專案",
    project_created: "建立專案",
    project_basics_updated: "更新專案基本資料",
    project_sales_owner_changed: "變更業務歸屬",
    project_financials_updated: "更新專案財務資料",
    project_final_price_updated: "更新最終成交金額",
    project_status_changed: "變更專案狀態",
    project_status_overridden: "Platform Owner 強制變更狀態",
    project_reopened: "重啟專案",
    project_archived: "封存專案",
    project_restored: "還原專案",
    project_permanently_deleted: "永久刪除專案",
    project_member_added: "新增專案成員",
    project_member_removed: "移除專案成員",
    project_member_role_changed: "變更專案成員角色",
    project_owner_transferred: "移轉專案負責人",
    wbs_draft_saved: "儲存 WBS 草稿",
    wbs_draft_discarded: "放棄 WBS 草稿",
    wbs_version_submitted: "送出 WBS 審核",
    wbs_version_reviewed: "審核 WBS 版本",
    project_wbs_schedule_created: "建立 WBS 排程",
    project_wbs_schedule_updated: "調整 WBS 排程",
    project_wbs_calendar_schedule_updated: "由行事曆調整 WBS 排程",
    project_attachment_uploaded: "上傳專案附件",
    project_attachment_deleted: "刪除專案附件",
    project_time_logged: "填寫專案工時",
    project_timesheet_deleted: "刪除專案工時",
    project_issue_created: "建立專案議題",
    project_issue_updated: "更新專案議題",
    project_issue_deleted: "刪除專案議題",
    change_request_created: "建立變更申請",
    change_request_reviewed: "審核變更申請",
    quote_generated_from_wbs: "由 WBS 產生報價單",
    opportunity_linked: "關聯商機",
    opportunity_link_updated: "更新商機關聯",
    opportunity_unlinked: "移除商機關聯",
    opportunity_allocations_confirmed: "確認商機來源分攤金額"
};

const FIELD_LABELS: Record<string, string> = {
    title: "名稱",
    customerName: "客戶名稱",
    srType: "專案類型",
    status: "狀態",
    projectCode: "專案編號",
    salesRep: "業務",
    salesDepartment: "業務部門",
    pmId: "PM",
    userId: "人員",
    memberRole: "成員角色",
    previousOwnerId: "原負責人",
    nextOwnerId: "新負責人",
    contractAmount: "合約報價",
    finalPrice: "最終成交金額",
    totalPoints: "總點數",
    pointValue: "點數單價",
    versionNumber: "WBS 版本",
    revision: "草稿修訂版",
    itemCount: "工項數",
    fileName: "檔案名稱",
    fileSize: "檔案大小",
    category: "附件類別",
    versionStatus: "版本狀態",
    workDate: "工作日期",
    hours: "工時",
    wbsItemId: "WBS 工項",
    wbsItemTitle: "WBS 工項",
    startDate: "開始日期",
    endDate: "結束日期",
    scheduledDays: "排程天數",
    taskStatus: "任務狀態",
    issueId: "議題",
    priority: "優先等級",
    assigneeId: "指派人員",
    externalUrl: "外部連結",
    amount: "金額",
    total: "合計金額",
    currency: "幣別",
    allocations: "來源分攤"
};

const STATUS_LABELS: Record<string, string> = {
    new: "待建",
    in_progress: "進行中",
    on_hold: "暫停",
    pending_acceptance: "待驗收",
    closed: "已結案",
    completed: "已完成",
    cancelled: "已取消",
    draft: "草稿",
    submitted: "待審核",
    approved: "已核准",
    rejected: "已退回",
    open: "未處理",
    resolved: "已解決"
};

const MONEY_FIELDS = new Set(["contractAmount", "finalPrice", "pointValue", "amount", "total", "allocationAmount"]);
const DATE_FIELDS = new Set(["workDate", "startDate", "endDate", "archivedAt", "reopenedAt", "closedAt", "cancelledAt"]);
const HIDDEN_FIELDS = new Set(["platformOwnerOverride", "replacesAttachmentId", "logicalDocumentId"]);

const formatValue = (field: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return "未設定";
    if (value === "[權限不足]") return "權限不足（已遮罩）";
    if (field === "status" || field === "taskStatus") return STATUS_LABELS[String(value)] || String(value);
    if (field === "hours") return `${Number(value).toLocaleString()} 小時`;
    if (field === "fileSize") return `${Number(value).toLocaleString()} bytes`;
    if (MONEY_FIELDS.has(field) && typeof value === "number") return `NT$ ${value.toLocaleString()}`;
    if (DATE_FIELDS.has(field)) {
        const date = new Date(value as string | Date);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-TW", { hour12: false });
    }
    if (typeof value === "boolean") return value ? "是" : "否";
    if (Array.isArray(value)) return value.map(item => typeof item === "object" ? JSON.stringify(item) : String(item)).join("、") || "無";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
};

export const getProjectHistoryActionLabel = (action: string) => ACTION_LABELS[action] || action;

export const buildProjectHistoryDetails = (event: any) => {
    const before = event.before && typeof event.before === "object" ? event.before as Record<string, unknown> : {};
    const after = event.after && typeof event.after === "object" ? event.after as Record<string, unknown> : {};
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...fields]
        .filter(field => !HIDDEN_FIELDS.has(field))
        .filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
        .map(field => {
            const label = FIELD_LABELS[field] || field;
            if (field in before && field in after) return `${label}：${formatValue(field, before[field])} → ${formatValue(field, after[field])}`;
            if (field in after) return `${label}：${formatValue(field, after[field])}`;
            return `${label}：${formatValue(field, before[field])} → 已移除`;
        });
};

export function ProjectHistoryPanel({ projectId }: { projectId: string }) {
    const [search, setSearch] = useState("");
    const { data: events, isLoading, isFetching, refetch } = trpc.projects.getBusinessHistory.useQuery(
        { projectId, limit: 500 },
        { enabled: !!projectId, refetchOnMount: "always" }
    );
    const filteredEvents = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return events || [];
        return (events || []).filter((event: any) => [
            getProjectHistoryActionLabel(event.action),
            event.actorName,
            event.actorRole,
            event.reason,
            ...buildProjectHistoryDetails(event)
        ].some(value => String(value || "").toLowerCase().includes(keyword)));
    }, [events, search]);

    return (
        <section className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border/50 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold"><FileText className="h-5 w-5 text-primary" />專案操作紀錄</h3>
                    <p className="mt-1 text-xs text-muted-foreground">完整記錄狀態、基本資料、財務、成員、WBS、附件、議題、工時、CR 與商機關聯異動。</p>
                </div>
                <button type="button" onClick={() => void refetch()} disabled={isFetching} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
                    <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />重新整理
                </button>
            </div>
            <div className="border-b border-border/50 p-4">
                <label className="relative block">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜尋動作、操作者、原因或異動內容" className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm" />
                </label>
            </div>
            <div className="max-h-[720px] divide-y divide-border/50 overflow-y-auto">
                {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">載入操作紀錄中…</div>}
                {filteredEvents.map((event: any) => {
                    const details = buildProjectHistoryDetails(event);
                    return <article key={event.id} className="grid gap-3 p-4 md:grid-cols-[170px_minmax(0,1fr)_170px]">
                        <time className="text-xs text-muted-foreground">{new Date(event.occurredAt).toLocaleString("zh-TW", { hour12: false })}</time>
                        <div className="min-w-0">
                            <h4 className="font-semibold">{getProjectHistoryActionLabel(event.action)}</h4>
                            {details.length > 0 && <ul className="mt-2 space-y-1 text-xs text-foreground/75">{details.map((detail, index) => <li key={`${event.id}-${index}`}>{detail}</li>)}</ul>}
                            {event.reason && <p className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">原因：{event.reason}</p>}
                        </div>
                        <div className="text-xs text-muted-foreground md:text-right">
                            <div className="font-medium text-foreground/80">{event.actorName || "系統"}</div>
                            <div>{event.actorRole || event.source}</div>
                        </div>
                    </article>;
                })}
                {!isLoading && filteredEvents.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">{search ? "找不到符合條件的操作紀錄" : "尚無操作紀錄"}</div>}
            </div>
        </section>
    );
}
