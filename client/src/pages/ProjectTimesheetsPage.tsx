import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { cn } from "../lib/utils";
import { CalendarDays, Plus, Trash2, AlertCircle, Filter, Package } from "lucide-react";
import { useCurrentUser } from "../lib/useCurrentUser";

export function ProjectTimesheetsPage() {
    const utils = trpc.useContext();
    const { user } = useCurrentUser();
    const canDelete = user?.email?.trim().toLowerCase() === "demo@demo.com";
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");
    const [selectedWbsId, setSelectedWbsId] = useState<string>("");
    const [workDate, setWorkDate] = useState<string>(new Date().toISOString().split("T")[0]);
    const [hours, setHours] = useState<number | "">("");
    const [description, setDescription] = useState("");
    const [taskStatus, setTaskStatus] = useState<"not_started" | "in_progress" | "completed">("in_progress");

    // Filter state
    const [filterProjectId, setFilterProjectId] = useState<string>("all");
    const [viewMode, setViewMode] = useState<"list" | "week" | "month">("list");

    // Fetches
    const { data: assignments } = trpc.projects.getMyProjectAssignments.useQuery({ scope: "mine" });
    const { data: timesheets, isLoading: loadingTimesheets } = trpc.projects.getMyProjectTimesheets.useQuery();

    const statusLabels: Record<string, string> = {
        not_started: "尚未開始",
        in_progress: "進行中",
        completed: "完成"
    };

    // Mutations
    const logTime = trpc.projects.logProjectTime.useMutation({
        onSuccess: () => {
            utils.projects.getMyProjectTimesheets.invalidate();
            utils.projects.getMyProjectAssignments.invalidate();
            setSelectedProjectId("");
            setSelectedWbsId("");
            setHours("");
            setDescription("");
            setTaskStatus("in_progress");
        }
    });

    const deleteTime = trpc.projects.deleteProjectTimesheet.useMutation({
        onSuccess: () => {
            utils.projects.getMyProjectTimesheets.invalidate();
            utils.projects.getMyProjectAssignments.invalidate();
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const selectedActivity = (assignments || []).find((assignment: any) => assignment.srId === selectedProjectId);
        const canSubmitWithoutWbs = selectedActivity?.srType === "other_activity" || selectedActivity?.memberRole === "watcher" || selectedActivity?.memberRole === "participant";
        if (!selectedProjectId || (!selectedWbsId && !canSubmitWithoutWbs) || !hours || !workDate || !description) return;

        setIsSubmitting(true);
        try {
            await logTime.mutateAsync({
                wbsItemId: selectedWbsId || undefined,
                srId: selectedProjectId,
                workDate: new Date(workDate),
                hours: Number(hours),
                description,
                taskStatus,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Derived unique projects from assignments for the filter dropdown
    const assignedProjects = useMemo(() => {
        if (!assignments) return [];
        const unique = new Map<string, { id: string; title: string; srType?: string; isObserver?: boolean; isParticipant?: boolean; items: any[] }>();
        assignments.forEach((a: any) => {
            if (!a.srId) return;
            if (!unique.has(a.srId)) {
                unique.set(a.srId, { id: a.srId, title: a.srTitle, srType: a.srType, isObserver: a.memberRole === "watcher", isParticipant: a.memberRole === "participant", items: [] });
            }
            const project = unique.get(a.srId);
            if (project && a.memberRole === "watcher") project.isObserver = true;
            if (project && a.memberRole === "participant") project.isParticipant = true;
            if (project && a.wbsItemId && !project.items.some(item => item.wbsItemId === a.wbsItemId)) {
                project.items.push(a);
            }
        });
        return Array.from(unique.values());
    }, [assignments]);

    const selectedProject = assignedProjects.find((project) => project.id === selectedProjectId);
    const availableWbsItems = selectedProject?.items || [];
    const selectedWbsItem = availableWbsItems.find((item: any) => (item.wbsItemId || item.id) === selectedWbsId);
    const canSubmitWithoutWbs = selectedProject?.srType === "other_activity" || selectedProject?.isObserver || selectedProject?.isParticipant;
    const scheduledDayAssignments = useMemo(() => {
        if (!assignments || !workDate) return [];
        const selectedDay = new Date(workDate).setHours(0, 0, 0, 0);
        return assignments
            .filter((assignment: any) => assignment.wbsItemId && assignment.startDate && assignment.endDate && !assignment.isBacklog)
            .filter((assignment: any) => {
                const start = new Date(assignment.startDate).setHours(0, 0, 0, 0);
                const end = new Date(assignment.endDate).setHours(23, 59, 59, 999);
                return selectedDay >= start && selectedDay <= end;
            });
    }, [assignments, workDate]);

    const applyScheduledAssignment = (assignment: any) => {
        setSelectedProjectId(assignment.srId);
        setFilterProjectId(assignment.srId);
        setSelectedWbsId(assignment.wbsItemId || assignment.id);
        setTaskStatus(assignment.status === "completed" ? "completed" : "in_progress");
        if (!description.trim()) {
            setDescription(`處理 ${assignment.title}`);
        }
    };

    // Filtered timesheets
    const filteredTimesheets = useMemo(() => {
        if (!timesheets) return [];
        if (filterProjectId === "all") return timesheets;
        return timesheets.filter((t: any) => t.srId === filterProjectId);
    }, [timesheets, filterProjectId]);

    // Grouped timesheets for week/month view
    const groupedTimesheets = useMemo(() => {
        if (viewMode === "list") return {};
        const groups: Record<string, { totalHours: number, items: any[] }> = {};
        filteredTimesheets.forEach((t: any) => {
            const date = new Date(t.workDate);
            let key = "";
            if (viewMode === "week") {
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - (date.getDay() === 0 ? 6 : date.getDay() - 1));
                key = `${weekStart.getFullYear()}/W${Math.ceil(date.getDate() / 7)} (${weekStart.toLocaleDateString()})`;
            } else {
                key = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}月`;
            }
            if (!groups[key]) groups[key] = { totalHours: 0, items: [] };
            groups[key].items.push(t);
            groups[key].totalHours += t.hours;
        });
        return groups;
    }, [filteredTimesheets, viewMode]);

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60 flex items-center gap-2">
                        <CalendarDays className="w-8 h-8 text-primary" />
                        專案工時填寫
                    </h2>
                    <p className="text-muted-foreground mt-1">回報您在專案任務上花費的時間</p>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Form Section */}
                <div className="md:col-span-1 space-y-4">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
	                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
	                            <Plus className="w-5 h-5 text-primary" />
	                            新增工時紀錄
	                        </h3>
	                        <div className="mb-5 rounded-lg border border-border bg-muted/20 p-3">
	                            <div className="flex items-center justify-between gap-2 mb-3">
	                                <div>
	                                    <div className="text-sm font-semibold">當天排程 WBS</div>
	                                    <div className="text-xs text-muted-foreground">依工作日期自動列出已排程任務</div>
	                                </div>
	                                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{scheduledDayAssignments.length} 項</span>
	                            </div>
	                            {scheduledDayAssignments.length === 0 ? (
	                                <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3 bg-background">此日期沒有已排程 WBS，可改用下方手動選擇。</div>
	                            ) : (
	                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
	                                    {scheduledDayAssignments.map((assignment: any) => (
	                                        <button
	                                            type="button"
	                                            key={assignment.calendarTaskId || assignment.id}
	                                            onClick={() => applyScheduledAssignment(assignment)}
	                                            className={cn(
	                                                "w-full text-left rounded-md border p-3 transition-colors bg-background hover:border-primary/50",
	                                                selectedWbsId === assignment.wbsItemId ? "border-primary bg-primary/5" : "border-border"
	                                            )}
	                                        >
	                                            <div className="flex items-start justify-between gap-3">
	                                                <div className="min-w-0">
	                                                    <div className="text-[11px] text-muted-foreground truncate">{assignment.srTitle}</div>
	                                                    <div className="text-sm font-semibold truncate">{assignment.title}</div>
	                                                    <div className="mt-1 text-xs text-muted-foreground truncate">{assignment.assigneeName || "未指派"}{assignment.assigneeDepartment ? ` / ${assignment.assigneeDepartment}` : ""}</div>
	                                                </div>
	                                                <span className="shrink-0 text-[11px] border border-border rounded-full px-2 py-0.5 text-muted-foreground">{statusLabels[assignment.status || "not_started"]}</span>
	                                            </div>
	                                        </button>
	                                    ))}
	                                </div>
	                            )}
	                        </div>
	                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">對應專案</label>
                                <select
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={selectedProjectId}
                                    onChange={(e) => {
                                        setSelectedProjectId(e.target.value);
                                        setSelectedWbsId("");
                                        if (e.target.value) {
                                            setFilterProjectId(e.target.value);
                                        }
                                    }}
                                    required
                                >
                                    <option value="">-- 先選擇專案 --</option>
                                    {assignedProjects.map((project) => (
                                        <option key={project.id} value={project.id}>
                                            {project.title}
                                        </option>
                                    ))}
                                </select>
                            </div>

	                            <div>
	                                <label className="block text-sm font-medium mb-1">對應任務 (WBS)</label>
                                <select
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={selectedWbsId}
                                    onChange={(e) => setSelectedWbsId(e.target.value)}
	                                    required={!canSubmitWithoutWbs}
	                                    disabled={!selectedProjectId}
                                >
                                    <option value="">-- 再選擇該專案下的 WBS --</option>
                                    {availableWbsItems.map((a: any) => (
                                        <option key={a.wbsItemId || a.id} value={a.wbsItemId || a.id}>
                                            {a.title} ({a.estimatedHours} 天 / 已填 {a.actualHours || 0} 小時)
                                        </option>
                                    ))}
                                </select>
                                {assignments?.length === 0 && (
                                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> 找不到指派給您的專案任務
                                    </p>
                                )}
		                                {selectedProjectId && availableWbsItems.length === 0 && !canSubmitWithoutWbs && (
		                                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
		                                        <AlertCircle className="w-3 h-3" /> 此專案目前沒有可填報的 WBS 項目
		                                    </p>
		                                )}
                                        {canSubmitWithoutWbs && (
                                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" /> 其他活動、參與人員或觀察者工時可不選 WBS；觀察者工時不納入計費。
                                            </p>
                                        )}
	                                {selectedWbsItem?.status === "completed" && (
	                                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
	                                        <AlertCircle className="w-3 h-3" /> 此 WBS 已標示完成，請確認是否仍需補填工時
	                                    </p>
	                                )}
	                            </div>

	                            <div>
	                                <label className="block text-sm font-medium mb-1">Task 狀態</label>
	                                <select
	                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
	                                    value={taskStatus}
	                                    onChange={(e) => setTaskStatus(e.target.value as any)}
	                                >
	                                    <option value="not_started">尚未開始</option>
	                                    <option value="in_progress">進行中</option>
	                                    <option value="completed">完成</option>
	                                </select>
	                            </div>

	                            <div>
	                                <label className="block text-sm font-medium mb-1">工作日期</label>
                                <input
                                    type="date"
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={workDate}
                                    onChange={(e) => setWorkDate(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">花費時數</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    max="24"
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={hours}
                                    onChange={(e) => setHours(e.target.value === "" ? "" : Number(e.target.value))}
                                    placeholder="例: 4.0"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">對應任務產出說明</label>
                                <textarea
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm min-h-[100px] focus:ring-1 focus:ring-primary outline-none"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="例: 完成系統架構設計文件..."
                                    required
                                ></textarea>
                            </div>

                            <button
                                type="submit"
	                                disabled={isSubmitting || !selectedProjectId || (!selectedWbsId && !canSubmitWithoutWbs)}
                                className="w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? "送出中..." : "儲存工時"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* History Section */}
                <div className="md:col-span-2 space-y-4">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm min-h-full">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                            <h3 className="text-xl font-bold">我的任務填報紀錄</h3>
                            
                            {/* Project Filter */}
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex bg-muted/50 p-1 rounded-lg border border-border text-xs">
                                    <button 
                                        type="button"
                                        onClick={() => setViewMode("list")}
                                        className={cn("px-3 py-1.5 rounded-md font-medium transition-colors", viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                                    >
                                        清單
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setViewMode("week")}
                                        className={cn("px-3 py-1.5 rounded-md font-medium transition-colors", viewMode === "week" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                                    >
                                        按週
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setViewMode("month")}
                                        className={cn("px-3 py-1.5 rounded-md font-medium transition-colors", viewMode === "month" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                                    >
                                        按月
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
                                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">篩選專案:</span>
                                <select 
                                    className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer min-w-[120px]"
                                    value={filterProjectId}
                                    onChange={(e) => setFilterProjectId(e.target.value)}
                                >
                                    <option value="all">全部專案</option>
                                    {assignedProjects.map(p => (
                                        <option key={p.id} value={p.id}>{p.title}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        </div>

                        {loadingTimesheets ? (
                            <div className="animate-pulse space-y-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-20 bg-muted rounded-md w-full"></div>
                                ))}
                            </div>
                        ) : filteredTimesheets.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground bg-muted/20 border border-dashed border-border rounded-xl">
                                {filterProjectId === "all" ? (
                                    <>
                                        <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>您目前沒有任何專案工時紀錄</p>
                                    </>
                                ) : (
                                    <>
                                        <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>此專案尚無填報紀錄</p>
                                        <button 
                                            onClick={() => setFilterProjectId("all")}
                                            className="text-primary text-xs mt-2 hover:underline"
                                        >
                                            顯示所有專案
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div>
                                {viewMode === "list" ? (
                                    <div className="space-y-3">
                                        {filteredTimesheets.map((t: any) => (
                                            <div key={t.id} className="p-4 border border-border rounded-lg bg-background hover:border-primary/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-primary">{t.srTitle}</span>
                                                        <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{t.wbsItemTitle}</span>
                                                    </div>
                                                    <p className="text-sm">{t.description}</p>
                                                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                        <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {t.hours} 小時</span>
                                                        <span className="flex items-center gap-1">{new Date(t.workDate).toISOString().split('T')[0].replace(/-/g, '/')}</span>
                                                        <span>{t.isBillable === false ? "非計費" : `約 NT$ ${t.costAmount?.toLocaleString()}`}</span>
                                                    </div>
                                                </div>
                                                {canDelete && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => deleteTime.mutate({ id: t.id })}
                                                            className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
                                                            title="刪除"
                                                            disabled={deleteTime.isPending}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {Object.entries(groupedTimesheets).sort((a, b) => b[0].localeCompare(a[0])).map(([key, group]: any) => (
                                            <div key={key} className="bg-background border border-border rounded-xl p-4 overflow-hidden">
                                                <div className="flex justify-between items-center mb-3 bg-muted/20 -m-4 p-4 border-b">
                                                    <span className="font-bold text-sm flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-primary" /> {key}</span>
                                                    <span className="text-xs font-semibold px-2 py-0.5 bg-primary/10 text-primary rounded-full">加總: {group.totalHours} hr</span>
                                                </div>
                                                <div className="space-y-2 mt-2">
                                                    {group.items.map((t: any) => (
                                                        <div key={t.id} className="p-3 border border-border/50 rounded-lg bg-card hover:border-primary/20 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-0.5">
                                                                    <span className="font-semibold">{t.srTitle}</span>
	                                                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{t.type === "other_activity" ? "其他活動" : t.wbsItemTitle}</span>
                                                                </div>
                                                                <p className="text-muted-foreground text-xs">{t.description}</p>
                                                            </div>
                                                            <div className="flex items-center justify-between md:justify-end gap-4 min-w-[120px]">
                                                                <div className="text-xs text-muted-foreground font-medium">{t.hours} hr / {new Date(t.workDate).toLocaleDateString()}</div>
                                                                {canDelete && (
                                                                    <button
                                                                        onClick={() => deleteTime.mutate({ id: t.id })}
                                                                        className="p-1.5 text-muted-foreground hover:text-red-500 rounded-md transition-colors"
                                                                        disabled={deleteTime.isPending}
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
