import { useMemo, useState } from "react";
import { addDays, addWeeks, format, parseISO, startOfWeek } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight, MessageSquarePlus, X } from "lucide-react";
import toast from "react-hot-toast";
import { trpc } from "../../lib/trpc";
import { dateKey, setCalendarQuery, slotLabels, sourceLabels, type ScheduleSlot, type ScheduleSourceType } from "./scheduleUi";

const roleLabels: Record<string, string> = {
    admin: "Admin", manager: "Manager", pm: "PM", presales: "Presales", tech: "Tech", business: "Business"
};

type MatrixMode = "busy" | "allocation" | "gap";

const getCellTone = (value: number, overloaded: boolean, weekend: boolean) => {
    if (overloaded) return "border-rose-400 bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-100";
    if (weekend && value > 0) return "border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100";
    if (value >= 100) return "border-emerald-400 bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100";
    if (value >= 50) return "border-sky-300 bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100";
    if (value > 0) return "border-violet-300 bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100";
    return "border-transparent bg-muted/20 text-muted-foreground";
};

export function TeamScheduleView() {
    const utils = trpc.useContext();
    const params = new URLSearchParams(window.location.search);
    const initialDate = params.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("date")!) ? parseISO(params.get("date")!) : new Date();
    const [anchor, setAnchor] = useState(initialDate);
    const [range, setRange] = useState<"week" | "four_weeks">(params.get("range") === "four_weeks" ? "four_weeks" : "week");
    const [mode, setMode] = useState<MatrixMode>((["allocation", "gap"].includes(params.get("mode") || "") ? params.get("mode") : "busy") as MatrixMode);
    const [department, setDepartment] = useState("");
    const [userId, setUserId] = useState("");
    const [role, setRole] = useState("");
    const [projectId, setProjectId] = useState("");
    const [selectedDate, setSelectedDate] = useState(dateKey(initialDate));
    const [selectedCell, setSelectedCell] = useState<any>(null);
    const [noteContent, setNoteContent] = useState("");

    const bounds = useMemo(() => {
        const start = startOfWeek(anchor, { weekStartsOn: 0 });
        return { from: dateKey(start), to: dateKey(addDays(start, range === "week" ? 6 : 27)) };
    }, [anchor, range]);
    const input = {
        ...bounds,
        department: department || undefined,
        userId: userId || undefined,
        role: role || undefined,
        projectId: projectId || undefined
    };
    const { data, isLoading, isFetching } = trpc.schedule.getCapacityMatrix.useQuery(input);
    const { data: sources } = trpc.schedule.listSources.useQuery(bounds);
    const noteMutation = trpc.schedule.createManagerNote.useMutation({
        onSuccess: async () => {
            setNoteContent("");
            await Promise.all([utils.schedule.getCapacityMatrix.invalidate(), utils.schedule.listTeam.invalidate(), utils.schedule.listManagerNotes.invalidate(), utils.schedule.listMine.invalidate()]);
            toast.success("已留下主管標記並通知 member");
        },
        onError: error => toast.error(error.message)
    });

    const navigate = (next: Date) => {
        setAnchor(next);
        const key = dateKey(next);
        setSelectedDate(key);
        setCalendarQuery({ date: key, range, mode });
    };
    const updateRange = (next: "week" | "four_weeks") => {
        setRange(next);
        setCalendarQuery({ range: next, mode, date: dateKey(anchor) });
    };
    const updateMode = (next: MatrixMode) => {
        setMode(next);
        setCalendarQuery({ mode: next, range, date: dateKey(anchor) });
    };

    const cellMap = new Map((data?.cells || []).map((cell: any) => [`${cell.userId}:${cell.date}`, cell]));
    const selectedCells = (data?.cells || []).filter((cell: any) => cell.date === selectedDate);
    const summary = selectedCells.reduce((result: Record<string, number>, cell: any) => {
        if (cell.isOverloaded) result.overloaded += 1;
        else if (cell.scheduledPercent >= 100) result.full += 1;
        else if (cell.scheduledPercent >= 50) result.half += 1;
        else result.empty += 1;
        return result;
    }, { empty: 0, half: 0, full: 0, overloaded: 0 });
    const selectedUser = selectedCell ? data?.users.find((user: any) => user.id === selectedCell.userId) : null;

    if (isLoading) return <div className="p-12 text-center text-muted-foreground">載入團隊負載…</div>;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => navigate(addWeeks(anchor, range === "week" ? -1 : -4))} className="rounded-lg border p-2 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" onClick={() => navigate(new Date())} className="rounded-lg border px-3 py-2 text-sm font-medium">今天</button>
                    <button type="button" onClick={() => navigate(addWeeks(anchor, range === "week" ? 1 : 4))} className="rounded-lg border p-2 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <div className="min-w-44 font-bold">{format(parseISO(bounds.from), "yyyy/MM/dd")}－{format(parseISO(bounds.to), "MM/dd")}</div>
                <div className="flex rounded-lg border bg-muted/30 p-1 text-sm">
                    <button type="button" onClick={() => updateRange("week")} className={`rounded-md px-3 py-1.5 ${range === "week" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>一週</button>
                    <button type="button" onClick={() => updateRange("four_weeks")} className={`rounded-md px-3 py-1.5 ${range === "four_weeks" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>四週</button>
                </div>
                <div className="flex rounded-lg border bg-muted/30 p-1 text-sm">
                    {(["busy", "allocation", "gap"] as MatrixMode[]).map(value => <button key={value} type="button" onClick={() => updateMode(value)} className={`rounded-md px-3 py-1.5 ${mode === value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{value === "busy" ? "已排忙碌" : value === "allocation" ? "核定配置" : "配置缺口"}</button>)}
                </div>
                {isFetching && <span className="text-xs text-muted-foreground">更新中…</span>}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                    ["未排", summary.empty, "bg-muted/30"],
                    ["半天", summary.half, "bg-sky-50 dark:bg-sky-950/30"],
                    ["全天", summary.full, "bg-emerald-50 dark:bg-emerald-950/30"],
                    ["超載", summary.overloaded, "bg-rose-50 dark:bg-rose-950/30"]
                ].map(([label, value, tone]) => <button type="button" key={String(label)} className={`rounded-xl border p-4 text-left ${tone}`}><div className="text-xs text-muted-foreground">{selectedDate} · {label}</div><div className="mt-1 text-2xl font-bold">{value}</div></button>)}
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3 shadow-sm">
                <select value={department} onChange={event => { setDepartment(event.target.value); setUserId(""); }} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">全部部門</option>{(data?.departments || []).map((value: string) => <option key={value} value={value}>{value}</option>)}</select>
                <select value={userId} onChange={event => setUserId(event.target.value)} className="min-w-44 rounded-lg border bg-background px-3 py-2 text-sm"><option value="">全部 member</option>{(data?.users || []).map((user: any) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
                <select value={role} onChange={event => setRole(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">全部角色</option>{["manager", "pm", "presales", "tech"].map(value => <option key={value} value={value}>{roleLabels[value]}</option>)}</select>
                <select value={projectId} onChange={event => setProjectId(event.target.value)} className="min-w-52 rounded-lg border bg-background px-3 py-2 text-sm"><option value="">全部專案</option>{(sources?.projects || []).map((project: any) => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
            </div>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-max border-collapse text-sm">
                        <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur">
                            <tr>
                                <th className="sticky left-0 z-30 min-w-48 border-b border-r bg-muted px-3 py-3 text-left">Member</th>
                                {(data?.dates || []).map((date: string) => {
                                    const parsed = parseISO(date);
                                    return <th key={date} onClick={() => setSelectedDate(date)} className={`min-w-20 cursor-pointer border-b border-r px-2 py-2 text-center ${selectedDate === date ? "bg-primary/10 text-primary" : ""} ${[0, 6].includes(parsed.getDay()) ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}><div className="text-[10px] text-muted-foreground">{format(parsed, "EEE")}</div><div>{format(parsed, "MM/dd")}</div></th>;
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {(data?.users || []).map((user: any) => <tr key={user.id} className="border-b">
                                <th className="sticky left-0 z-10 border-r bg-card px-3 py-2 text-left"><div className="font-semibold">{user.name}</div><div className="text-xs font-normal text-muted-foreground">{user.department || "未指定"} · {roleLabels[user.role] || user.role}</div></th>
                                {(data?.dates || []).map((date: string) => {
                                    const cell: any = cellMap.get(`${user.id}:${date}`) || { scheduledPercent: 0, allocationPercent: 0, gapPercent: 0, amCount: 0, pmCount: 0 };
                                    const value = mode === "busy" ? cell.scheduledPercent : mode === "allocation" ? cell.allocationPercent : cell.gapPercent;
                                    const overloaded = mode === "busy" && cell.isOverloaded;
                                    return <td key={date} className="border-r p-1 text-center"><button type="button" onClick={() => { setSelectedDate(date); setSelectedCell(cell); }} className={`min-h-12 w-full rounded-md border px-1.5 py-1 text-xs font-semibold transition hover:brightness-95 ${getCellTone(value, overloaded, cell.isWeekend)}`}>
                                        {range === "week" && mode === "busy" ? <><div>AM {cell.amCount}</div><div>PM {cell.pmCount}</div></> : <div>{value}%</div>}
                                        {cell.notes?.length > 0 && <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-violet-600" />}
                                    </button></td>;
                                })}
                            </tr>)}
                            {(data?.users || []).length === 0 && <tr><td colSpan={(data?.dates?.length || 0) + 1} className="p-12 text-center text-muted-foreground">沒有符合條件的 member</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {selectedCell && selectedUser && (
                <div className="fixed inset-0 z-[70] flex justify-end bg-black/25" onClick={() => setSelectedCell(null)}>
                    <aside className="h-full w-full max-w-lg overflow-y-auto border-l bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card p-4"><div><p className="text-xs text-muted-foreground">團隊排程詳情</p><h2 className="font-bold">{selectedUser.name} · {selectedCell.date}</h2><p className="text-xs text-muted-foreground">{selectedUser.department || "未指定部門"} · {roleLabels[selectedUser.role] || selectedUser.role}</p></div><button type="button" onClick={() => setSelectedCell(null)} className="rounded p-2 hover:bg-muted"><X className="h-5 w-5" /></button></div>
                        <div className="grid grid-cols-3 gap-2 border-b p-4"><div className="rounded-lg bg-muted/30 p-3"><div className="text-xs text-muted-foreground">已排</div><strong>{selectedCell.scheduledPercent}%</strong></div><div className="rounded-lg bg-muted/30 p-3"><div className="text-xs text-muted-foreground">核定</div><strong>{selectedCell.allocationPercent}%</strong></div><div className="rounded-lg bg-muted/30 p-3"><div className="text-xs text-muted-foreground">缺口</div><strong>{selectedCell.gapPercent}%</strong></div></div>
                        {selectedCell.isOverloaded && <div className="m-4 flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />此日為週末或存在時段衝突／超載。</div>}
                        <div className="space-y-2 p-4">
                            <h3 className="font-semibold">排程內容</h3>
                            {(selectedCell.blocks || []).map((block: any) => <div key={block.id} className="rounded-lg border bg-background p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{block.projectTitle || block.opportunityTitle || block.title}</strong><span className="rounded bg-muted px-2 py-0.5 text-xs">{slotLabels[block.slot as ScheduleSlot]}</span></div><div className="mt-1 text-xs text-muted-foreground">{sourceLabels[block.sourceType as ScheduleSourceType]}{block.workContent ? ` · ${block.workContent}` : ""}</div>{block.overCapacityReason && <div className="mt-2 text-xs text-rose-600">超載原因：{block.overCapacityReason}</div>}</div>)}
                            {(selectedCell.blocks || []).length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">此日沒有排程</p>}
                        </div>
                        <div className="border-t p-4">
                            <h3 className="mb-2 font-semibold">主管標記事項</h3>
                            <div className="space-y-2">{(selectedCell.notes || []).map((note: any) => <div key={note.id} className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900 dark:bg-violet-950/30 dark:text-violet-100"><div>{note.content}</div><div className="mt-1 text-xs opacity-70">{note.managerName} · {new Date(note.createdAt).toLocaleString()}</div></div>)}</div>
                            <textarea value={noteContent} onChange={event => setNoteContent(event.target.value)} rows={3} maxLength={2000} placeholder="留下提醒或調度建議，不會修改 member 排程" className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                            <button type="button" disabled={!noteContent.trim() || noteMutation.isPending} onClick={() => noteMutation.mutate({ assigneeId: selectedUser.id, date: selectedCell.date, content: noteContent.trim() })} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><MessageSquarePlus className="h-4 w-4" />留下標記並通知</button>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}
