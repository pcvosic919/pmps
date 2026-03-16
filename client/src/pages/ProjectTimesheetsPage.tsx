import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { CalendarDays, Plus, Trash2, AlertCircle, Filter, Package } from "lucide-react";

export function ProjectTimesheetsPage() {
    const utils = trpc.useContext();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [selectedWbsId, setSelectedWbsId] = useState<number | "">("");
    const [workDate, setWorkDate] = useState<string>(new Date().toISOString().split("T")[0]);
    const [hours, setHours] = useState<number | "">("");
    const [description, setDescription] = useState("");

    // Filter state
    const [filterProjectId, setFilterProjectId] = useState<number | "all">("all");

    // Fetches
    const { data: assignments } = trpc.projects.getMyProjectAssignments.useQuery();
    const { data: timesheets, isLoading: loadingTimesheets } = trpc.projects.getMyProjectTimesheets.useQuery();

    // Mutations
    const logTime = trpc.projects.logProjectTime.useMutation({
        onSuccess: () => {
            utils.projects.getMyProjectTimesheets.invalidate();
            setSelectedWbsId("");
            setHours("");
            setDescription("");
        }
    });

    const deleteTime = trpc.projects.deleteProjectTimesheet.useMutation({
        onSuccess: () => {
            utils.projects.getMyProjectTimesheets.invalidate();
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedWbsId || !hours || !workDate || !description) return;

        setIsSubmitting(true);
        try {
            await logTime.mutateAsync({
                wbsItemId: Number(selectedWbsId),
                workDate: new Date(workDate),
                hours: Number(hours),
                description,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Derived unique projects from assignments for the filter dropdown
    const assignedProjects = useMemo(() => {
        if (!assignments) return [];
        const unique = new Map();
        assignments.forEach((a: any) => {
            if (!unique.has(a.srId)) {
                unique.set(a.srId, { id: a.srId, title: a.srTitle });
            }
        });
        return Array.from(unique.values());
    }, [assignments]);

    // Filtered timesheets
    const filteredTimesheets = useMemo(() => {
        if (!timesheets) return [];
        if (filterProjectId === "all") return timesheets;
        return timesheets.filter((t: any) => t.srId === filterProjectId);
    }, [timesheets, filterProjectId]);

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
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">對應任務 (WBS)</label>
                                <select
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={selectedWbsId}
                                    onChange={(e) => {
                                        const val = e.target.value === "" ? "" : Number(e.target.value);
                                        setSelectedWbsId(val);
                                        // Auto-filter history list to this project when starting to log
                                        if (val !== "") {
                                            const assignment = assignments?.find((a: any) => a.id === val);
                                            if (assignment) setFilterProjectId(assignment.srId);
                                        }
                                    }}
                                    required
                                >
                                    <option value="">-- 選擇您被指派的任務 --</option>
                                    {assignments?.map((a: any) => (
                                        <option key={a.id} value={a.id}>
                                            [{a.srTitle}] {a.title}
                                        </option>
                                    ))}
                                </select>
                                {assignments?.length === 0 && (
                                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> 找不到指派給您的專案任務
                                    </p>
                                )}
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
                                disabled={isSubmitting || !selectedWbsId}
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
                            <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
                                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">篩選專案:</span>
                                <select 
                                    className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer min-w-[120px]"
                                    value={filterProjectId}
                                    onChange={(e) => setFilterProjectId(e.target.value === "all" ? "all" : Number(e.target.value))}
                                >
                                    <option value="all">全部專案</option>
                                    {assignedProjects.map(p => (
                                        <option key={p.id} value={p.id}>{p.title}</option>
                                    ))}
                                </select>
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
                                                <span>約 NT$ {t.costAmount?.toLocaleString()}</span>
                                            </div>
                                        </div>
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
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
