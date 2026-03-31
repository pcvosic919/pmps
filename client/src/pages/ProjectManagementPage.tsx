import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import {
    FolderKanban, ChevronRight, AlertTriangle, BarChart3,
    CheckCircle2, Clock, XCircle, RefreshCw, Search
} from "lucide-react";
import { useDebounce } from "../lib/useDebounce";
import { useCurrentUser } from "../lib/useCurrentUser";

const SR_STATUSES = [
    { value: "new", label: "待指派", color: "bg-blue-100 text-blue-800 border-blue-200" },
    { value: "in_progress", label: "執行中", color: "bg-amber-100 text-amber-800 border-amber-200" },
    { value: "completed", label: "已結案", color: "bg-green-100 text-green-800 border-green-200" },
    { value: "cancelled", label: "已取消", color: "bg-gray-100 text-gray-800 border-gray-200" },
] as const;

type SRStatus = typeof SR_STATUSES[number]["value"];

export function ProjectManagementPage() {
    const { user, hasRole } = useCurrentUser();
    const isManager = !!user && (user.role === "manager" || user.roles.includes("manager"));
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [changingStatus, setChangingStatus] = useState<string | null>(null);
    const debouncedSearch = useDebounce(search, 300);

    const queryInput = useMemo(() => ({
        search: debouncedSearch || undefined,
        status: filterStatus === "all" ? undefined : filterStatus as SRStatus,
        limit: 200
    }), [debouncedSearch, filterStatus]);

    const { data: srs, isLoading, refetch } = trpc.projects.srList.useQuery(queryInput);
    const { data: allSrs } = trpc.projects.srList.useQuery({ limit: 200 });
    const { data: pendingWbs } = trpc.projects.getWbsPendingReview.useQuery(undefined, { enabled: isManager });
    const updateStatus = trpc.projects.updateSRStatus.useMutation({ onSuccess: () => refetch() });

    const getStatusInfo = (status: string) =>
        SR_STATUSES.find(s => s.value === status) ?? { label: status, color: "bg-gray-100 text-gray-800 border-gray-200" };

    const StatusIcon = ({ status }: { status: string }) => {
        switch (status) {
            case "new": return <Clock className="w-3.5 h-3.5" />;
            case "in_progress": return <RefreshCw className="w-3.5 h-3.5" />;
            case "completed": return <CheckCircle2 className="w-3.5 h-3.5" />;
            case "cancelled": return <XCircle className="w-3.5 h-3.5" />;
            default: return null;
        }
    };

    const summary = useMemo(() => ({
        total: allSrs?.length ?? 0,
        new: allSrs?.filter((s: any) => s.status === "new").length ?? 0,
        inProgress: allSrs?.filter((s: any) => s.status === "in_progress").length ?? 0,
        completed: allSrs?.filter((s: any) => s.status === "completed").length ?? 0,
    }), [allSrs]);

    if (isLoading) return <div className="p-8 text-center animate-pulse">載入專案列表中...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                        專案管理
                    </h2>
                    <p className="text-muted-foreground mt-1">集中查閱所有專案，並由 Manager / PM 持續追蹤進度與審核狀態</p>
                </div>
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

            {isManager && (
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
                </div>
            </div>

            <div className="space-y-3">
                {(srs ?? []).map((sr: any) => {
                    const statusInfo = getStatusInfo(sr.status);
                    return (
                        <div key={sr.id} className="bg-card border border-border/50 rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 flex-wrap mb-2">
                                        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border">SR-#{sr.id}</span>
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
                                        <span>合約金額: <span className="font-semibold text-foreground">NT$ {sr.contractAmount?.toLocaleString()}</span></span>
                                        <span className="flex items-center gap-1">
                                            <BarChart3 className="w-3.5 h-3.5" />
                                            預估毛利: <span className={`font-semibold ml-1 ${sr.marginWarning ? "text-red-500" : "text-green-600"}`}>{sr.marginEstimate}%</span>
                                        </span>
                                        <span>建立: {new Date(sr.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="relative">
                                        {changingStatus === sr.id ? (
                                            <div className="flex gap-1 flex-wrap">
                                                {SR_STATUSES.filter(s => s.value !== sr.status).map(s => (
                                                    <button
                                                        key={s.value}
                                                        onClick={() => {
                                                            updateStatus.mutate({ id: sr.id, status: s.value as SRStatus });
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
                                            (isManager || hasRole("admin") || user?.id === sr.pmId) && (
                                                <button
                                                    onClick={() => setChangingStatus(sr.id)}
                                                    className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground whitespace-nowrap"
                                                >
                                                    更改狀態
                                                </button>
                                            )
                                        )}
                                    </div>
                                    <Link href={`/service-requests/${sr.id}`}>
                                        <a className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap">
                                            管理 WBS <ChevronRight className="w-3.5 h-3.5" />
                                        </a>
                                    </Link>
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
        </div>
    );
}
