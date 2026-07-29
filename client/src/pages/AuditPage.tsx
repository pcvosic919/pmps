import { useMemo, useState } from "react";
import {
    Activity,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Download,
    Eye,
    Loader2,
    Search,
    ShieldAlert,
    ShieldCheck,
    UserRound,
    X,
    XCircle
} from "lucide-react";
import { toast } from "react-hot-toast";
import { trpc } from "../lib/trpc";
import { useDebounce } from "../lib/useDebounce";
import { exportRowsToXlsx, formatExportDate, makeXlsxFileName } from "../lib/exportXlsx";

type OutcomeFilter = "" | "success" | "failed" | "denied";

const categoryLabels: Record<string, string> = {
    analytics: "報表分析",
    audit: "Audit",
    auth: "身分驗證",
    calendar: "排程行事曆",
    companies: "公司管理",
    integrations: "整合服務",
    issues: "議題",
    navigation: "頁面瀏覽",
    opportunity: "商機管理",
    opportunities: "商機管理",
    project: "專案管理",
    system: "系統設定",
    timesheet: "工時",
    users: "使用者管理"
};

const actionLabels: Record<string, string> = {
    archiveProject: "封存專案",
    create: "新增",
    createSR: "建立 SR／專案",
    delete: "刪除",
    deleteSrAttachment: "刪除附件",
    demoLogin: "Demo 登入",
    discardWbsDraft: "放棄 WBS 草稿",
    downloadSrAttachment: "下載附件",
    entraLogin: "Microsoft 登入",
    exportRows: "匯出 Audit",
    login: "登入",
    logout: "登出",
    removeSrMember: "移除專案成員",
    restoreProject: "還原專案",
    saveWbsDraft: "儲存 WBS 草稿",
    submitWbsVersion: "WBS 送審",
    trackLogout: "登出",
    transferSrOwner: "移轉專案擁有者",
    update: "修改",
    updateProjectBasics: "修改專案基本資料",
    view: "查看頁面"
};

const outcomeLabels = {
    success: "成功",
    failed: "失敗",
    denied: "權限拒絕"
} as const;

const dateAtStart = (value: string) => value ? new Date(`${value}T00:00:00`) : undefined;
const dateAtEnd = (value: string) => value ? new Date(`${value}T23:59:59.999`) : undefined;

const formatDateTime = (value: string | Date) =>
    new Date(value).toLocaleString("zh-TW", { hour12: false });

export function AuditPage() {
    const [page, setPage] = useState(1);
    const [actor, setActor] = useState("");
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [action, setAction] = useState("");
    const [outcome, setOutcome] = useState<OutcomeFilter>("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [selectedEvent, setSelectedEvent] = useState<any>(null);
    const debouncedActor = useDebounce(actor, 350);
    const debouncedSearch = useDebounce(search, 350);

    const filters = useMemo(() => ({
        actor: debouncedActor || undefined,
        search: debouncedSearch || undefined,
        category: category || undefined,
        action: action || undefined,
        outcome: outcome || undefined,
        from: dateAtStart(from),
        to: dateAtEnd(to)
    }), [action, category, debouncedActor, debouncedSearch, from, outcome, to]);

    const auditQuery = trpc.audit.list.useQuery(
        { ...filters, page, pageSize: 30 },
        { placeholderData: previous => previous }
    );
    const exportMutation = trpc.audit.exportRows.useMutation();

    const resetFilters = () => {
        setActor("");
        setSearch("");
        setCategory("");
        setAction("");
        setOutcome("");
        setFrom("");
        setTo("");
        setPage(1);
    };

    const exportAudit = async () => {
        try {
            const rows = await exportMutation.mutateAsync(filters);
            exportRowsToXlsx(
                rows as Record<string, unknown>[],
                makeXlsxFileName("Audit使用者互動紀錄", formatExportDate()),
                "Audit"
            );
            toast.success(`已匯出 ${rows.length.toLocaleString()} 筆紀錄`);
        } catch (error: any) {
            toast.error(error?.message || "Audit 匯出失敗");
        }
    };

    const data = auditQuery.data;
    const summaryCards = [
        { label: "符合紀錄", value: data?.summary.total || 0, icon: Activity, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
        { label: "成功", value: data?.summary.success || 0, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
        { label: "失敗", value: data?.summary.failed || 0, icon: XCircle, color: "text-red-600 bg-red-50 dark:bg-red-950/30" },
        { label: "權限拒絕", value: data?.summary.denied || 0, icon: ShieldAlert, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
        { label: "互動使用者", value: data?.summary.activeUsers || 0, icon: UserRound, color: "text-violet-600 bg-violet-50 dark:bg-violet-950/30" }
    ];

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                        <h1 className="text-2xl font-bold">Audit 使用者互動稽核中心</h1>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        查看登入、頁面瀏覽、資料異動、下載、匯出及權限拒絕紀錄。系統不保存密碼、Token 或附件內容。
                    </p>
                </div>
                <button
                    type="button"
                    onClick={exportAudit}
                    disabled={exportMutation.isPending}
                    className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {exportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    匯出 Excel
                </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {summaryCards.map(card => (
                    <div key={card.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">{card.label}</span>
                            <span className={`rounded-lg p-2 ${card.color}`}>
                                <card.icon className="h-4 w-4" />
                            </span>
                        </div>
                        <div className="mt-3 text-2xl font-bold">{card.value.toLocaleString()}</div>
                    </div>
                ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">使用者</span>
                        <input
                            value={actor}
                            onChange={event => { setActor(event.target.value); setPage(1); }}
                            placeholder="姓名或 Email"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">關鍵字</span>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={event => { setSearch(event.target.value); setPage(1); }}
                                placeholder="資料名稱、ID、頁面或 API"
                                className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3"
                            />
                        </div>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">模組</span>
                        <select
                            value={category}
                            onChange={event => { setCategory(event.target.value); setPage(1); }}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2"
                        >
                            <option value="">全部模組</option>
                            {(data?.options.categories || []).map(item => (
                                <option key={item} value={item}>{categoryLabels[item] || item}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">動作</span>
                        <select
                            value={action}
                            onChange={event => { setAction(event.target.value); setPage(1); }}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2"
                        >
                            <option value="">全部動作</option>
                            {(data?.options.actions || []).map(item => (
                                <option key={item} value={item}>{actionLabels[item] || item}</option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">結果</span>
                        <select
                            value={outcome}
                            onChange={event => { setOutcome(event.target.value as OutcomeFilter); setPage(1); }}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2"
                        >
                            <option value="">全部結果</option>
                            <option value="success">成功</option>
                            <option value="failed">失敗</option>
                            <option value="denied">權限拒絕</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">起始日期</span>
                        <input
                            type="date"
                            value={from}
                            onChange={event => { setFrom(event.target.value); setPage(1); }}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">結束日期</span>
                        <input
                            type="date"
                            value={to}
                            onChange={event => { setTo(event.target.value); setPage(1); }}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2"
                        />
                    </label>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="w-full rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                        >
                            清除篩選
                        </button>
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1050px] text-left text-sm">
                        <thead className="bg-muted/60 text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 font-medium">時間</th>
                                <th className="px-4 py-3 font-medium">使用者</th>
                                <th className="px-4 py-3 font-medium">模組／動作</th>
                                <th className="px-4 py-3 font-medium">資料對象</th>
                                <th className="px-4 py-3 font-medium">結果</th>
                                <th className="px-4 py-3 font-medium">來源</th>
                                <th className="px-4 py-3 text-right font-medium">詳細</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {auditQuery.isLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                                        載入 Audit 紀錄中…
                                    </td>
                                </tr>
                            ) : (data?.events || []).length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">目前篩選條件沒有紀錄。</td>
                                </tr>
                            ) : data?.events.map(event => (
                                <tr key={event.id} className="hover:bg-muted/30">
                                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(event.createdAt)}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{event.actorName || "未識別使用者"}</div>
                                        <div className="text-xs text-muted-foreground">{event.actorEmail || "—"}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{categoryLabels[event.category] || event.category}</div>
                                        <div className="text-xs text-muted-foreground">{actionLabels[event.action] || event.action}</div>
                                    </td>
                                    <td className="max-w-[280px] px-4 py-3">
                                        <div className="truncate font-medium">{event.targetLabel || event.route || event.targetId || "—"}</div>
                                        <div className="truncate text-xs text-muted-foreground">{event.targetType || event.procedure || ""}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                                            event.outcome === "success"
                                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                                : event.outcome === "denied"
                                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                                    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                        }`}>
                                            {(outcomeLabels as Record<string, string>)[event.outcome] || event.outcome}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{event.source === "server" ? "後端" : "前端"}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedEvent(event)}
                                            className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                                        >
                                            <Eye className="mr-1 h-3.5 w-3.5" />
                                            查看
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                    <span className="text-muted-foreground">
                        第 {data?.pagination.page || page}／{data?.pagination.totalPages || 1} 頁，共 {(data?.pagination.total || 0).toLocaleString()} 筆
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage(current => Math.max(1, current - 1))}
                            className="rounded-lg border border-border p-2 hover:bg-muted disabled:opacity-40"
                            aria-label="上一頁"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            disabled={page >= (data?.pagination.totalPages || 1)}
                            onClick={() => setPage(current => current + 1)}
                            className="rounded-lg border border-border p-2 hover:bg-muted disabled:opacity-40"
                            aria-label="下一頁"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            {selectedEvent && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedEvent(null)}>
                    <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold">互動紀錄詳細資料</h2>
                                <p className="text-sm text-muted-foreground">{formatDateTime(selectedEvent.createdAt)}</p>
                            </div>
                            <button type="button" onClick={() => setSelectedEvent(null)} className="rounded-lg p-2 hover:bg-muted" aria-label="關閉">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                            {[
                                ["使用者", `${selectedEvent.actorName || "未識別"} (${selectedEvent.actorEmail || "—"})`],
                                ["模組", categoryLabels[selectedEvent.category] || selectedEvent.category],
                                ["動作", actionLabels[selectedEvent.action] || selectedEvent.action],
                                ["結果", outcomeLabels[selectedEvent.outcome as keyof typeof outcomeLabels]],
                                ["資料對象", selectedEvent.targetLabel || selectedEvent.targetId || "—"],
                                ["頁面", selectedEvent.route || "—"],
                                ["後端 API", selectedEvent.procedure || "—"],
                                ["Request ID", selectedEvent.requestId || "—"],
                                ["Session ID", selectedEvent.sessionId || "—"],
                                ["IP 雜湊", selectedEvent.ipHash || "—"],
                                ["瀏覽器", selectedEvent.userAgent || "—"],
                                ["保存期限", formatDateTime(selectedEvent.expiresAt)]
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                                    <dd className="mt-1 break-all">{value}</dd>
                                </div>
                            ))}
                        </dl>
                        <div className="mt-5">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">安全摘要</div>
                            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                                {JSON.stringify(selectedEvent.metadata || {}, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
