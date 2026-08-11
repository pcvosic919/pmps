import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import {
    FolderKanban, ChevronRight, AlertTriangle, BarChart3,
    CheckCircle2, Clock, XCircle, RefreshCw, Search, Plus, Archive, RotateCcw, Trash2,
    List, LayoutGrid
} from "lucide-react";
import { useDebounce } from "../lib/useDebounce";
import { useCurrentUser } from "../lib/useCurrentUser";

const SR_STATUSES = [
    { value: "new", label: "待指派", color: "bg-blue-100 text-blue-800 border-blue-200" },
    { value: "in_progress", label: "執行中", color: "bg-amber-100 text-amber-800 border-amber-200" },
    { value: "on_hold", label: "暫停", color: "bg-slate-100 text-slate-800 border-slate-200" },
    { value: "pending_acceptance", label: "待驗收", color: "bg-violet-100 text-violet-800 border-violet-200" },
    { value: "closed", label: "已結案", color: "bg-green-100 text-green-800 border-green-200" },
    { value: "completed", label: "已結案（舊資料）", color: "bg-green-100 text-green-800 border-green-200" },
    { value: "cancelled", label: "已取消", color: "bg-red-600 text-white border-red-700" },
] as const;

type SRStatus = typeof SR_STATUSES[number]["value"];
type ProjectViewMode = "list" | "grid";

export function ProjectManagementPage() {
    const { user, hasRole, hasPermission } = useCurrentUser();
    const canReviewProjects = hasPermission("wbs.review", ["admin", "manager", "pm", "presales"]);
    const canSeeOperationsDashboard = hasRole("admin") || hasRole("manager") || hasRole("pm");
    const canOperateProject = (sr: any) => sr.permissions?.canOperate === true;
    const canArchiveProject = (sr: any) => sr.permissions?.canArchive === true;
    const canDelete = user?.isPlatformOwner === true;
	    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [showArchived, setShowArchived] = useState(false);
	    const [viewMode, setViewMode] = useState<ProjectViewMode>("list");
	    const [changingStatus, setChangingStatus] = useState<string | null>(null);
	    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const debouncedSearch = useDebounce(search, 300);

    const queryInput = useMemo(() => ({
        search: debouncedSearch || undefined,
        status: filterStatus === "all" ? undefined : filterStatus as SRStatus,
        includeArchived: showArchived,
        limit: 200
    }), [debouncedSearch, filterStatus, showArchived]);

    const { data: srs, isLoading, refetch } = trpc.projects.srList.useQuery(queryInput);
    const { data: allSrs } = trpc.projects.srList.useQuery({ limit: 200 });
    const { data: openCasesDashboard } = trpc.analytics.getOpenCasesDashboard.useQuery(undefined, { enabled: canSeeOperationsDashboard });
    const { data: pendingWbs } = trpc.projects.getWbsPendingReview.useQuery(undefined, { enabled: canReviewProjects });
    const updateStatus = trpc.projects.updateSRStatus.useMutation({ onSuccess: () => refetch(), onError: error => alert(error.message) });
    const updateFinalPrice = trpc.projects.updateFinalPrice.useMutation({ onSuccess: () => refetch() });
    const deleteSr = trpc.projects.delete.useMutation({ 
        onSuccess: () => refetch(),
        onError: (err) => alert(err.message || "刪除失敗")
    });
    const archiveProject = trpc.projects.archiveProject.useMutation({ onSuccess: () => refetch(), onError: error => alert(error.message) });
    const restoreProject = trpc.projects.restoreProject.useMutation({ onSuccess: () => refetch(), onError: error => alert(error.message) });

    const getStatusInfo = (status: string) =>
        SR_STATUSES.find(s => s.value === status) ?? { label: status, color: "bg-gray-100 text-gray-800 border-gray-200" };

    const StatusIcon = ({ status }: { status: string }) => {
        switch (status) {
            case "new": return <Clock className="w-3.5 h-3.5" />;
            case "in_progress": return <RefreshCw className="w-3.5 h-3.5" />;
            case "on_hold": return <Clock className="w-3.5 h-3.5" />;
            case "pending_acceptance": return <AlertTriangle className="w-3.5 h-3.5" />;
            case "closed":
            case "completed": return <CheckCircle2 className="w-3.5 h-3.5" />;
            case "cancelled": return <XCircle className="w-3.5 h-3.5" />;
            default: return null;
        }
    };

    const handleUpdateFinalPrice = (sr: any) => {
        const value = window.prompt("請輸入最終成交金額 (NT$)", String(sr.finalPrice ?? sr.contractAmount ?? 0));
        if (value === null) return;
        const finalPrice = Number(value);
        if (Number.isNaN(finalPrice) || finalPrice < 0) {
            alert("請輸入有效的最終成交金額");
            return;
        }
        updateFinalPrice.mutate({ id: sr.id, finalPrice });
    };

	    const summary = useMemo(() => ({
	        total: allSrs?.length ?? 0,
	        new: allSrs?.filter((s: any) => s.status === "new").length ?? 0,
	        inProgress: allSrs?.filter((s: any) => s.status === "in_progress").length ?? 0,
	        completed: allSrs?.filter((s: any) => ["closed", "completed"].includes(s.status)).length ?? 0,
	    }), [allSrs]);
	    const selectedProject = (srs ?? []).find((sr: any) => sr.id === selectedProjectId) || (srs ?? [])[0];

    if (isLoading) return <div className="p-8 text-center animate-pulse">載入專案列表中...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                        專案管理
                    </h2>
                    <p className="text-muted-foreground mt-1">依角色與專案關係集中查閱專案、追蹤進度與審核狀態</p>
                </div>
                {hasPermission("project.create_sr", ["admin", "manager", "pm", "presales"]) && (
                    <Link href="/service-requests">
                        <a className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md hover:shadow-lg">
                            <Plus className="w-4 h-4 mr-2" />
                            新增 SR
                        </a>
                    </Link>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "全部專案", value: summary.total, color: "from-primary/20 to-primary/5", text: "text-primary" },
                    { label: "待指派", value: summary.new, color: "from-blue-500/20 to-blue-500/5", text: "text-blue-600" },
                    { label: "執行中", value: summary.inProgress, color: "from-amber-500/20 to-amber-500/5", text: "text-amber-600" },
                    { label: "已結案", value: summary.completed, color: "from-green-500/20 to-green-500/5", text: "text-green-600" },
                ].map(card => (
                    <div key={card.label} className={`bg-gradient-to-br ${card.color} border border-border/50 rounded-xl p-4`}>
                        <p className="text-sm text-muted-foreground">{card.label}</p>
                        <p className={`text-3xl font-bold mt-1 ${card.text}`}>{card.value}</p>
                    </div>
                ))}
            </div>

            {openCasesDashboard && openCasesDashboard.totalCases > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: "匯入未結案", value: openCasesDashboard.openCases, suffix: "件", color: "text-blue-600" },
                        { label: "分配工時", value: openCasesDashboard.assignedHours, suffix: "h", color: "text-slate-700" },
                        { label: "已累計工時", value: openCasesDashboard.actualHours, suffix: "h", color: "text-emerald-600" },
                        { label: "剩餘工時", value: openCasesDashboard.remainingHours, suffix: "h", color: "text-amber-600" },
                    ].map(card => (
                        <div key={card.label} className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
                            <p className="text-sm text-muted-foreground">{card.label}</p>
                            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{Number(card.value || 0).toLocaleString()}{card.suffix}</p>
                        </div>
                    ))}
                </div>
            )}

            {canReviewProjects && (
                <div className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-foreground">待審核 WBS 版本</p>
                        <p className="text-sm text-muted-foreground mt-1">所有送審中的版本已集中於專案管理，可直接進入各專案查閱。</p>
                    </div>
                    <div className="text-right">
                        <p className="text-3xl font-bold text-primary">{pendingWbs?.length ?? 0}</p>
                        <p className="text-xs text-muted-foreground">筆待審核</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="搜尋專案名稱..."
                        className="w-full pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {[{ value: "all", label: "全部" }, ...SR_STATUSES.map(s => ({ value: s.value, label: s.label }))].map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setFilterStatus(opt.value)}
                            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${filterStatus === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setShowArchived(current => !current)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-colors ${showArchived ? "bg-slate-800 text-white border-slate-800" : "bg-background border-border text-muted-foreground hover:bg-muted"}`}
                    >
                        {showArchived ? "顯示使用中" : "查看已封存"}
                    </button>
                </div>
                <div className="inline-flex self-start rounded-lg border border-border bg-background p-1">
                    <button
                        type="button"
                        onClick={() => setViewMode("list")}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        aria-pressed={viewMode === "list"}
                    >
                        <List className="h-4 w-4" /> 清單
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode("grid")}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        aria-pressed={viewMode === "grid"}
                    >
                        <LayoutGrid className="h-4 w-4" /> 磚塊
                    </button>
                </div>
            </div>

                {viewMode === "list" ? (
                    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-left text-sm">
                                <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">專案名稱</th>
                                        <th className="px-5 py-3 font-medium">客戶名稱</th>
                                        <th className="px-5 py-3 font-medium">業務</th>
                                        <th className="px-5 py-3 text-right font-medium">最終成交金額</th>
                                        <th className="px-5 py-3 text-right font-medium">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {(srs ?? []).length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                                                {search || filterStatus !== "all" ? "找不到符合條件的專案" : "尚無服務請求 (SR)"}
                                            </td>
                                        </tr>
                                    ) : (
                                        (srs ?? []).map((sr: any) => (
                                            <tr key={sr.id} className="transition-colors hover:bg-muted/30">
                                                <td className="px-5 py-4 font-semibold text-foreground">{sr.title || "—"}</td>
                                                <td className="px-5 py-4 text-muted-foreground">{sr.customerName || "—"}</td>
                                                <td className="px-5 py-4 text-muted-foreground">{sr.salesRep || "—"}</td>
                                                <td className="px-5 py-4 text-right font-semibold text-foreground">
                                                    {sr.permissions?.canViewFinancials
                                                        ? `NT$ ${Number(sr.finalPrice ?? sr.contractAmount ?? 0).toLocaleString()}`
                                                        : "—"}
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <Link href={`/service-requests/${sr.id}`}>
                                                        <a className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90">
                                                            管理 WBS <ChevronRight className="h-3.5 w-3.5" />
                                                        </a>
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
	            <div className="grid xl:grid-cols-[1fr_360px] gap-4 items-start">
	                <div className="space-y-3">
	                {(srs ?? []).map((sr: any) => {
	                    const statusInfo = getStatusInfo(sr.status);
	                    const projectSummary = sr.projectSummary || {};
	                    const anomalyCounts = projectSummary.anomalyCounts || {};
	                    return (
	                        <div
	                            key={sr.id}
	                            onClick={() => setSelectedProjectId(sr.id)}
	                            className={`bg-card border rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer ${selectedProject?.id === sr.id ? "border-primary/60 shadow-sm" : "border-border/50"}`}
	                        >
	                            <div className="flex items-start justify-between gap-4">
	                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 flex-wrap mb-2">
                                        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border">{sr.projectCode || `SR-#${sr.id}`}</span>
                                        {sr.externalProjectCode && (
                                            <span className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{sr.externalProjectCode}</span>
                                        )}
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusInfo.color}`}>
                                            <StatusIcon status={sr.status} />
                                            {statusInfo.label}
                                        </span>
                                        {sr.marginWarning && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                                                <AlertTriangle className="w-3 h-3" /> 毛利警告
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-base font-bold text-foreground mb-2">{sr.title}</h3>
	                                    <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                                        {sr.customerName && <span>客戶: <span className="font-semibold text-foreground">{sr.customerName}</span></span>}
                                        {sr.externalServiceType && <span>服務類型: <span className="font-semibold text-foreground">{sr.externalServiceType}</span></span>}
	                                        {sr.permissions?.canViewFinancials && <span>合約報價: <span className="font-semibold text-foreground">NT$ {sr.contractAmount?.toLocaleString()}</span></span>}
                                            {sr.permissions?.canViewFinancials && <span>最終成交金額: <span className="font-semibold text-foreground">NT$ {(sr.finalPrice ?? sr.contractAmount ?? 0).toLocaleString()}</span></span>}
                                        {sr.externalAssignments?.length > 0 && (
                                            <span>匯入工時: <span className="font-semibold text-foreground">
                                                {sr.externalAssignments.reduce((sum: number, a: any) => sum + (a.actualHours || 0), 0).toLocaleString()}
                                                /
                                                {sr.externalAssignments.reduce((sum: number, a: any) => sum + (a.assignedHours || 0), 0).toLocaleString()}h
                                            </span></span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <BarChart3 className="w-3.5 h-3.5" />
                                            預估毛利: <span className={`font-semibold ml-1 ${sr.marginWarning ? "text-red-500" : "text-green-600"}`}>{sr.marginEstimate}%</span>
                                        </span>
                                        {sr.plannedEndDate && <span>預計結束: {new Date(sr.plannedEndDate).toLocaleDateString()}</span>}
                                        <span>建立: {new Date(sr.createdAt).toLocaleDateString()}</span>
	                                    </div>
	                                    <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
	                                        <div className="border border-border rounded-lg px-3 py-2 bg-background">
	                                            <div className="text-[11px] text-muted-foreground">WBS 完成率</div>
	                                            <div className="text-sm font-bold">{projectSummary.completionRate ?? 0}%</div>
	                                        </div>
	                                        <div className="border border-border rounded-lg px-3 py-2 bg-background">
	                                            <div className="text-[11px] text-muted-foreground">本月應完成</div>
	                                            <div className="text-sm font-bold">{projectSummary.dueThisMonthHours ?? 0}h</div>
	                                        </div>
	                                        <div className="border border-border rounded-lg px-3 py-2 bg-background">
	                                            <div className="text-[11px] text-muted-foreground">本月結算率</div>
	                                            <div className="text-sm font-bold">{projectSummary.monthlyCompletionRate === null ? "-" : `${projectSummary.monthlyCompletionRate ?? 0}%`}</div>
	                                        </div>
	                                        <div className="border border-border rounded-lg px-3 py-2 bg-background">
	                                            <div className="text-[11px] text-muted-foreground">逾期 WBS</div>
	                                            <div className={`text-sm font-bold ${(projectSummary.overdueItems || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>{projectSummary.overdueItems ?? 0}</div>
	                                        </div>
	                                        <div className="border border-border rounded-lg px-3 py-2 bg-background">
	                                            <div className="text-[11px] text-muted-foreground">資料異常</div>
	                                            <div className="text-sm font-bold">{(anomalyCounts.missingAssignee || 0) + (anomalyCounts.missingSchedule || 0) + (anomalyCounts.zeroEstimate || 0)}</div>
	                                        </div>
	                                    </div>
	                                    {projectSummary.pendingApprovalDepartments?.length > 0 && (
	                                        <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
	                                            待核准部門：{projectSummary.pendingApprovalDepartments.join("、")}
	                                        </div>
	                                    )}
	                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {canArchiveProject(sr) && (
                                        showArchived ? (
                                            <button
                                                type="button"
                                                onClick={event => {
                                                    event.stopPropagation();
                                                    restoreProject.mutate({ id: sr.id });
                                                }}
                                                className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"
                                                title="還原專案"
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={event => {
                                                    event.stopPropagation();
                                                    if (window.confirm(`封存專案「${sr.title}」？`)) archiveProject.mutate({ id: sr.id });
                                                }}
                                                className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"
                                                title="封存專案"
                                            >
                                                <Archive className="h-4 w-4" />
                                            </button>
                                        )
                                    )}
                                    {canDelete && showArchived && (
                                        <button
                                            type="button"
                                            onClick={event => {
                                                event.stopPropagation();
                                                if (window.confirm(`永久刪除專案「${sr.title}」？僅無關聯資料時可刪除。`)) deleteSr.mutate({ id: sr.id });
                                            }}
                                            className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                                            title="永久刪除"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                    <div className="relative">
                                        {changingStatus === sr.id ? (
                                            <div className="flex gap-1 flex-wrap">
                                                {SR_STATUSES.filter(s => s.value !== sr.status).map(s => (
                                                    <button
                                                        key={s.value}
                                                        onClick={() => {
                                                            const isPlatformOwnerOverride =
                                                                user?.isPlatformOwner === true
                                                                && ["closed", "completed", "cancelled"].includes(sr.status);
                                                            const requiresReason =
                                                                ["on_hold", "closed", "cancelled"].includes(s.value)
                                                                || isPlatformOwnerOverride;
                                                            const reason = requiresReason
                                                                ? window.prompt(
                                                                    isPlatformOwnerOverride
                                                                        ? `Platform Owner 強制將「${getStatusInfo(sr.status).label}」改為「${s.label}」，請輸入調整原因`
                                                                        : `請輸入「${s.label}」原因`
                                                                )?.trim()
                                                                : undefined;
                                                            if (requiresReason && !reason) return;
                                                            updateStatus.mutate({ id: sr.id, status: s.value as SRStatus, reason });
                                                            setChangingStatus(null);
                                                        }}
                                                        className={`px-2 py-1 text-xs rounded-full border font-medium ${s.color} hover:opacity-80 transition-opacity`}
                                                    >
                                                        → {s.label}
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={() => setChangingStatus(null)}
                                                    className="px-2 py-1 text-xs rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
                                                >
                                                    取消
                                                </button>
                                            </div>
                                        ) : (
                                            canOperateProject(sr) && (
                                                <button
                                                    onClick={() => setChangingStatus(sr.id)}
                                                    className={`px-3 py-1.5 text-xs border rounded-lg transition-colors whitespace-nowrap ${
                                                        user?.isPlatformOwner && ["closed", "completed", "cancelled"].includes(sr.status)
                                                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                                            : "border-border text-muted-foreground hover:bg-muted"
                                                    }`}
                                                    title={user?.isPlatformOwner ? "Platform Owner 可強制調整所有專案狀態，操作將保留歷程" : undefined}
                                                >
                                                    {user?.isPlatformOwner && ["closed", "completed", "cancelled"].includes(sr.status)
                                                        ? "管理員調整狀態"
                                                        : "更改狀態"}
                                                </button>
                                            )
                                        )}
                                    </div>
                                    <Link href={`/service-requests/${sr.id}`}>
                                        <a className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap">
                                            管理 WBS <ChevronRight className="w-3.5 h-3.5" />
                                        </a>
                                    </Link>
	                                    {canDelete && (
                                        <button
                                            onClick={() => {
                                                if (confirm("確定要刪除此專案與 SR 嗎？此操作無法復原。")) {
                                                    deleteSr.mutate({ id: sr.id });
                                                }
                                            }}
                                            className="px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap"
                                        >
                                            刪除專案
                                        </button>
	                                    )}
                                        {sr.permissions?.canEditFinancials && (
                                            <button
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleUpdateFinalPrice(sr);
                                                }}
                                                className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground whitespace-nowrap"
                                            >
                                                更新最終成交金額
                                            </button>
                                        )}
                                </div>
                            </div>
	                        </div>
	                    );
	                })}

	                {(srs ?? []).length === 0 && (
                    <div className="p-12 text-center bg-card border border-dashed rounded-xl">
                        <FolderKanban className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                        <h3 className="text-lg font-medium">{search || filterStatus !== "all" ? "找不到符合條件的專案" : "尚無服務請求 (SR)"}</h3>
                        <p className="text-muted-foreground mt-1 text-sm">
                            {search || filterStatus !== "all" ? "請調整搜尋條件或篩選器" : "從商機介面轉換已成交的商機後顯示於此"}
                        </p>
	                    </div>
	                )}
	                </div>
	                {selectedProject && (
	                    <aside className="bg-card border border-border/50 rounded-xl p-5 shadow-sm sticky top-4 space-y-4">
	                        <div>
	                            <div className="text-xs text-muted-foreground">專案摘要</div>
	                            <h3 className="font-bold mt-1">{selectedProject.title}</h3>
	                            {selectedProject.customerName && <div className="text-sm text-muted-foreground mt-1">{selectedProject.customerName}</div>}
	                        </div>
	                        <div className="grid grid-cols-2 gap-2">
	                            {[
	                                { label: "WBS 項目", value: `${selectedProject.projectSummary?.completedItems || 0}/${selectedProject.projectSummary?.totalItems || 0}` },
	                                { label: "完成率", value: `${selectedProject.projectSummary?.completionRate || 0}%` },
	                                { label: "本月應完成", value: `${selectedProject.projectSummary?.dueThisMonthHours || 0}h` },
	                                { label: "本月結算率", value: selectedProject.projectSummary?.monthlyCompletionRate === null ? "-" : `${selectedProject.projectSummary?.monthlyCompletionRate || 0}%` },
	                                { label: "逾期 WBS", value: selectedProject.projectSummary?.overdueItems || 0 },
	                                { label: "版本狀態", value: selectedProject.projectSummary?.versionStatus || "-" },
	                            ].map((item) => (
	                                <div key={item.label} className="border border-border rounded-lg p-3 bg-background">
	                                    <div className="text-[11px] text-muted-foreground">{item.label}</div>
	                                    <div className="mt-1 text-sm font-bold">{item.value}</div>
	                                </div>
	                            ))}
	                        </div>
	                        <div className="space-y-2">
	                            <div className="text-sm font-semibold">資料品質</div>
	                            {[
	                                { label: "未指派", value: selectedProject.projectSummary?.anomalyCounts?.missingAssignee || 0 },
	                                { label: "缺起訖日期", value: selectedProject.projectSummary?.anomalyCounts?.missingSchedule || 0 },
	                                { label: "預估工時為 0", value: selectedProject.projectSummary?.anomalyCounts?.zeroEstimate || 0 },
	                            ].map((item) => (
	                                <div key={item.label} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2 bg-background">
	                                    <span className="text-muted-foreground">{item.label}</span>
	                                    <span className={item.value > 0 ? "font-bold text-amber-700" : "font-bold text-emerald-600"}>{item.value}</span>
	                                </div>
	                            ))}
	                        </div>
	                        {selectedProject.projectSummary?.pendingApprovalDepartments?.length > 0 && (
	                            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
	                                待核准：{selectedProject.projectSummary.pendingApprovalDepartments.join("、")}
	                            </div>
	                        )}
	                        <Link href={`/service-requests/${selectedProject.id}`}>
	                            <a className="w-full inline-flex justify-center items-center gap-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
	                                開啟 WBS <ChevronRight className="w-4 h-4" />
	                            </a>
	                        </Link>
	                    </aside>
	                )}
	            </div>
                )}
        </div>
    );
}
