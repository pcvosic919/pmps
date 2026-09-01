import { useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Clock, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { trpc } from "../lib/trpc";
import { useCurrentUser } from "../lib/useCurrentUser";

type ProjectTimesheetPanelProps = {
    projectId: string;
    projectTitle: string;
    srType: string;
    locked: boolean;
    canOperate: boolean;
    memberRole?: string;
    wbsItems: any[];
};

export function ProjectTimesheetPanel({ projectId, projectTitle, srType, locked, canOperate, memberRole, wbsItems }: ProjectTimesheetPanelProps) {
    const utils = trpc.useUtils();
    const { user } = useCurrentUser();
    const [wbsItemId, setWbsItemId] = useState("");
    const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
    const [hours, setHours] = useState("");
    const [description, setDescription] = useState("");
    const [taskStatus, setTaskStatus] = useState<"not_started" | "in_progress" | "completed">("in_progress");

    const { data: assignments } = trpc.projects.getMyProjectAssignments.useQuery({ scope: "mine" });
    const { data: timesheets, isLoading } = trpc.projects.getMyProjectTimesheets.useQuery();
    const assignedItems = useMemo(() => (assignments || []).filter((item: any) => item.srId === projectId && item.wbsItemId), [assignments, projectId]);
    const availableItems = useMemo(() => {
        const source = canOperate ? wbsItems : assignedItems;
        return Array.from(new Map(source.map((item: any) => [item.wbsItemId || item.id, {
            id: item.wbsItemId || item.id,
            title: item.title,
            code: item.code || "",
            description: item.description || "",
            status: item.status || "not_started",
            estimatedHours: item.totalEstimatedHours ?? item.estimatedHours ?? 0,
            actualHours: item.actualHours || 0
        }])).values());
    }, [assignedItems, canOperate, wbsItems]);
    const projectTimesheets = useMemo(() => (timesheets || []).filter((item: any) => item.srId === projectId), [projectId, timesheets]);
    const canSubmitWithoutWbs = srType === "other_activity" || memberRole === "participant" || canOperate;
    const canLogTime = !!user && ["admin", "tech", "presales", "pm"].includes(user.role) && memberRole !== "watcher";

    const logTime = trpc.projects.logProjectTime.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.projects.getMyProjectTimesheets.invalidate(),
                utils.projects.getMyProjectAssignments.invalidate(),
                utils.projects.srById.invalidate({ id: projectId }),
                utils.projects.getBusinessHistory.invalidate({ projectId })
            ]);
            setWbsItemId(""); setHours(""); setDescription(""); setTaskStatus("in_progress");
            toast.success("工時已新增");
        },
        onError: error => toast.error(error.message || "新增工時失敗")
    });
    const deleteTime = trpc.projects.deleteProjectTimesheet.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.projects.getMyProjectTimesheets.invalidate(),
                utils.projects.getMyProjectAssignments.invalidate(),
                utils.projects.srById.invalidate({ id: projectId }),
                utils.projects.getBusinessHistory.invalidate({ projectId })
            ]);
            toast.success("工時已刪除");
        },
        onError: error => toast.error(error.message || "刪除工時失敗")
    });

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!canLogTime || locked) return;
        const parsedHours = Number(hours);
        if ((!wbsItemId && !canSubmitWithoutWbs) || !workDate || !Number.isFinite(parsedHours) || parsedHours <= 0 || !description.trim()) {
            toast.error("請完整填寫日期、工時、說明與必要的 WBS 工項");
            return;
        }
        logTime.mutate({ srId: projectId, wbsItemId: wbsItemId || undefined, workDate: new Date(workDate), hours: parsedHours, description: description.trim(), taskStatus });
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
                <h3 className="flex items-center gap-2 text-lg font-bold"><Plus className="h-5 w-5 text-primary" />新增工時紀錄</h3>
                <p className="mt-1 text-xs text-muted-foreground">{projectTitle}</p>
                {locked && <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertCircle className="h-4 w-4 shrink-0" />專案已鎖定，僅可查看既有工時。</div>}
                {!locked && !canLogTime && <div className="mt-4 flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"><AlertCircle className="h-4 w-4 shrink-0" />您的角色在此專案僅能查看工時紀錄。</div>}
                <form onSubmit={submit} className="mt-5 space-y-4">
                    <label className="block text-sm font-medium">工作日期<input type="date" value={workDate} onChange={event => setWorkDate(event.target.value)} disabled={locked || !canLogTime} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-normal" /></label>
                    <label className="block text-sm font-medium">WBS 工項{!canSubmitWithoutWbs && " *"}<select value={wbsItemId} onChange={event => setWbsItemId(event.target.value)} disabled={locked || !canLogTime} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-normal"><option value="">{canSubmitWithoutWbs ? "不指定 WBS" : "請選擇 WBS"}</option>{availableItems.map((item: any) => <option key={item.id} value={item.id}>{item.code ? `[${item.code}] ` : ""}{item.title}（預估 {item.estimatedHours} 天／已填 {item.actualHours} 小時）</option>)}</select></label>
                    <label className="block text-sm font-medium">工時（小時）<input type="number" min="0.25" max="24" step="0.25" value={hours} onChange={event => setHours(event.target.value)} disabled={locked || !canLogTime} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-normal" /></label>
                    <label className="block text-sm font-medium">任務狀態<select value={taskStatus} onChange={event => setTaskStatus(event.target.value as typeof taskStatus)} disabled={locked || !canLogTime} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-normal"><option value="not_started">尚未開始</option><option value="in_progress">進行中</option><option value="completed">完成</option></select></label>
                    <label className="block text-sm font-medium">工作說明<textarea value={description} onChange={event => setDescription(event.target.value)} disabled={locked || !canLogTime} rows={4} className="mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 font-normal" placeholder="說明本次完成的工作內容" /></label>
                    <button type="submit" disabled={locked || !canLogTime || logTime.isPending} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{logTime.isPending ? "儲存中…" : "儲存工時"}</button>
                </form>
            </section>
            <section className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                <div className="border-b border-border/50 p-5"><h3 className="flex items-center gap-2 text-lg font-bold"><Clock className="h-5 w-5 text-primary" />本專案工時紀錄</h3><p className="mt-1 text-xs text-muted-foreground">共 {projectTimesheets.length} 筆，合計 {projectTimesheets.reduce((sum: number, item: any) => sum + Number(item.hours || 0), 0).toLocaleString()} 小時</p></div>
                <div className="max-h-[680px] divide-y divide-border/50 overflow-y-auto">
                    {isLoading && <div className="p-8 text-center text-sm text-muted-foreground">載入工時中…</div>}
                    {projectTimesheets.map((item: any) => <div key={item.id} className="grid gap-2 p-4 sm:grid-cols-[120px_minmax(0,1fr)_90px_auto] sm:items-center"><div className="text-xs text-muted-foreground"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{new Date(item.workDate).toLocaleDateString("zh-TW")}</div><div className="min-w-0"><div className="font-semibold">{item.wbsItemTitle || "未指定 WBS"}</div><div className="truncate text-xs text-muted-foreground">{item.description}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.techName || "未知人員"}{item.techDepartment ? `／${item.techDepartment}` : ""}</div></div><div className="font-semibold text-primary">{Number(item.hours).toLocaleString()} 小時</div>{user?.isPlatformOwner === true && <button type="button" onClick={() => { if (window.confirm(`確定刪除此筆 ${item.hours} 小時的工時？`)) deleteTime.mutate({ id: item.id }); }} className="rounded p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600" title="刪除工時"><Trash2 className="h-4 w-4" /></button>}</div>)}
                    {!isLoading && projectTimesheets.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">本專案尚無工時紀錄</div>}
                </div>
            </section>
        </div>
    );
}
