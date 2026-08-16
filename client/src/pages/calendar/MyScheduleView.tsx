import { useEffect, useMemo, useState } from "react";
import {
    addDays,
    addMonths,
    addWeeks,
    format,
    isSameMonth,
    parseISO,
    startOfMonth,
    startOfWeek
} from "date-fns";
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    GripVertical,
    Layers3,
    PanelRightClose,
    PanelRightOpen,
    Plus,
    Save,
    Trash2,
    X
} from "lucide-react";
import toast from "react-hot-toast";
import { trpc } from "../../lib/trpc";
import {
    applyDraftChanges,
    dateKey,
    displayBlockName,
    enumerateDateKeys,
    setCalendarQuery,
    slotLabels,
    sourceClasses,
    sourceLabels,
    type BlockFields,
    type DraftChange,
    type ScheduleSlot,
    type ScheduleSourceType
} from "./scheduleUi";

type EditorState = {
    key: string;
    block?: any;
    date: string;
    slot: ScheduleSlot;
    preset?: any;
};

const blockFields = (block: any, overrides: Partial<BlockFields> = {}): BlockFields => ({
    date: block.date,
    slot: block.slot,
    sourceType: block.sourceType,
    projectId: block.projectId || undefined,
    wbsItemId: block.wbsItemId || undefined,
    opportunityId: block.opportunityId || undefined,
    title: block.title || undefined,
    workContent: block.workContent || undefined,
    batchId: block.batchId || undefined,
    overCapacityReason: block.overCapacityReason || undefined,
    ...overrides
});

function ScheduleCard({ block, name, onClick, onDragStart }: { block: any; name: string; onClick: () => void; onDragStart: () => void }) {
    const sourceType = block.sourceType as ScheduleSourceType;
    return (
        <button
            type="button"
            draggable
            onDragStart={(event) => { event.stopPropagation(); onDragStart(); }}
            onClick={(event) => { event.stopPropagation(); onClick(); }}
            className={`group flex w-full items-center gap-1 rounded-md border-l-4 px-2 py-1.5 text-left text-xs font-semibold shadow-sm transition hover:brightness-95 ${sourceClasses[sourceType]} ${block.isDraft ? "border-dashed opacity-70" : ""} ${block.isOverloaded ? "ring-2 ring-rose-400" : ""}`}
        >
            <GripVertical className="h-3 w-3 shrink-0 opacity-40" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {block.overCapacityReason && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />}
        </button>
    );
}

function ScheduleEditor({
    editor,
    projects,
    opportunities,
    effectiveBlocks,
    onClose,
    onSubmit,
    onDelete
}: {
    editor: EditorState;
    projects: any[];
    opportunities: any[];
    effectiveBlocks: any[];
    onClose: () => void;
    onSubmit: (editor: EditorState, fields: BlockFields[]) => void;
    onDelete: (block: any) => void;
}) {
    const source = editor.block || editor.preset || {};
    const [sourceType, setSourceType] = useState<ScheduleSourceType>((source.sourceType || source.kind || "manual") as ScheduleSourceType);
    const [projectId, setProjectId] = useState(source.projectId || "");
    const [wbsItemId, setWbsItemId] = useState(source.wbsItemId || "");
    const [opportunityId, setOpportunityId] = useState(source.opportunityId || "");
    const [title, setTitle] = useState(source.title || "");
    const [workContent, setWorkContent] = useState(source.workContent || "");
    const [startDate, setStartDate] = useState(editor.block?.date || editor.date);
    const [endDate, setEndDate] = useState(editor.block?.date || editor.date);
    const [slot, setSlot] = useState<ScheduleSlot>(editor.block?.slot || editor.slot);
    const initialDay = parseISO(editor.date).getDay();
    const [weekdays, setWeekdays] = useState<number[]>(editor.block ? [initialDay] : [1, 2, 3, 4, 5]);
    const [overCapacityReason, setOverCapacityReason] = useState(source.overCapacityReason || "");
    const selectedProject = projects.find(project => project.id === projectId);
    const dayBlocks = effectiveBlocks.filter(block => block.date === startDate && block.id !== editor.block?.id);
    const isWeekend = [0, 6].includes(parseISO(startDate).getDay());
    const slotCollision = dayBlocks.some(block => block.slot === "full_day" || slot === "full_day" || block.slot === slot);
    const needsReason = isWeekend || slotCollision;
    const editingExisting = Boolean(editor.block);

    const submit = () => {
        if (sourceType === "manual" && !title.trim()) return toast.error("手動項目必須填寫標題");
        if (["wbs", "project_support"].includes(sourceType) && !projectId) return toast.error("請選擇專案");
        if (sourceType === "wbs" && !wbsItemId) return toast.error("請選擇 WBS");
        if (sourceType === "presales" && !opportunityId) return toast.error("請選擇商機");
        if (needsReason && !overCapacityReason.trim()) return toast.error("週末或衝突排程必須填寫超載原因");
        const dates = editingExisting
            ? [startDate]
            : enumerateDateKeys(startDate, endDate).filter(value => weekdays.includes(parseISO(value).getDay()));
        if (!dates.length) return toast.error("日期區間內沒有符合所選星期的日期");
        const batchId = source.batchId || crypto.randomUUID();
        onSubmit(editor, dates.map(date => ({
            date,
            slot,
            sourceType,
            projectId: ["wbs", "project_support"].includes(sourceType) ? projectId : undefined,
            wbsItemId: sourceType === "wbs" ? wbsItemId : undefined,
            opportunityId: sourceType === "presales" ? opportunityId : undefined,
            title: sourceType === "manual" ? title.trim() : title.trim() || undefined,
            workContent: workContent.trim() || undefined,
            batchId,
            overCapacityReason: overCapacityReason.trim() || undefined
        })));
    };

    return (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/25" onClick={onClose}>
            <aside className="h-full w-full max-w-md overflow-y-auto border-l bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-5 py-4">
                    <div>
                        <p className="text-xs text-muted-foreground">{editingExisting ? "編輯排程" : "新增排程"}</p>
                        <h2 className="font-bold">{format(parseISO(startDate), "yyyy/MM/dd")} · {slotLabels[slot]}</h2>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
                </div>
                <div className="space-y-5 p-5">
                    <label className="block text-sm font-medium">工作類型
                        <select value={sourceType} onChange={event => setSourceType(event.target.value as ScheduleSourceType)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2">
                            {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </label>

                    {["wbs", "project_support"].includes(sourceType) && (
                        <label className="block text-sm font-medium">專案
                            <select value={projectId} onChange={event => { setProjectId(event.target.value); setWbsItemId(""); }} className="mt-1 w-full rounded-lg border bg-background px-3 py-2">
                                <option value="">選擇專案</option>
                                {projects.map(project => <option key={project.id} value={project.id}>{project.code ? `${project.code} · ` : ""}{project.title}</option>)}
                            </select>
                        </label>
                    )}
                    {sourceType === "wbs" && (
                        <label className="block text-sm font-medium">WBS
                            <select value={wbsItemId} onChange={event => setWbsItemId(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2">
                                <option value="">選擇 WBS</option>
                                {(selectedProject?.wbsItems || []).map((item: any) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ""}{item.title}</option>)}
                            </select>
                        </label>
                    )}
                    {sourceType === "presales" && (
                        <label className="block text-sm font-medium">商機
                            <select value={opportunityId} onChange={event => setOpportunityId(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2">
                                <option value="">選擇商機</option>
                                {opportunities.map(opportunity => <option key={opportunity.id} value={opportunity.id}>{opportunity.code ? `${opportunity.code} · ` : ""}{opportunity.title}</option>)}
                            </select>
                        </label>
                    )}
                    {sourceType === "manual" && (
                        <label className="block text-sm font-medium">手動項目標題
                            <input value={title} onChange={event => setTitle(event.target.value)} maxLength={300} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" placeholder="例如：內部會議、文件整理" />
                        </label>
                    )}
                    <label className="block text-sm font-medium">工作內容（選填）
                        <textarea value={workContent} onChange={event => setWorkContent(event.target.value)} rows={3} maxLength={2000} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-sm font-medium">開始日期
                            <input type="date" value={startDate} onChange={event => { setStartDate(event.target.value); if (endDate < event.target.value) setEndDate(event.target.value); }} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
                        </label>
                        <label className="text-sm font-medium">結束日期
                            <input type="date" value={endDate} min={startDate} disabled={editingExisting} onChange={event => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 disabled:opacity-50" />
                        </label>
                    </div>
                    {!editingExisting && (
                        <div>
                            <p className="mb-2 text-sm font-medium">套用星期</p>
                            <div className="grid grid-cols-7 gap-1">
                                {["日", "一", "二", "三", "四", "五", "六"].map((label, index) => (
                                    <button key={label} type="button" onClick={() => setWeekdays(current => current.includes(index) ? current.filter(day => day !== index) : [...current, index])} className={`rounded-md border px-2 py-1.5 text-xs ${weekdays.includes(index) ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <p className="mb-2 text-sm font-medium">時段</p>
                        <div className="grid grid-cols-3 gap-2">
                            {(["am", "pm", "full_day"] as ScheduleSlot[]).map(value => <button key={value} type="button" onClick={() => setSlot(value)} className={`rounded-lg border px-3 py-2 text-sm ${slot === value ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{slotLabels[value]}</button>)}
                        </div>
                    </div>

                    <div className={`rounded-lg border p-3 text-sm ${needsReason ? "border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200" : "bg-muted/30 text-muted-foreground"}`}>
                        {isWeekend ? "此日期為週末，屬於非標準排程。" : slotCollision ? `此時段已有 ${dayBlocks.length} 項安排，儲存後會標示超載。` : "目前未偵測到時段衝突。"}
                    </div>
                    {needsReason && (
                        <label className="block text-sm font-medium">超載／週末原因
                            <textarea value={overCapacityReason} onChange={event => setOverCapacityReason(event.target.value)} rows={2} maxLength={1000} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
                        </label>
                    )}
                </div>
                <div className="sticky bottom-0 flex items-center justify-between border-t bg-card p-4">
                    <div>{editingExisting && <button type="button" onClick={() => onDelete(editor.block)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />移除</button>}</div>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">取消</button>
                        <button type="button" onClick={submit} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">加入變更</button>
                    </div>
                </div>
            </aside>
        </div>
    );
}

export function MyScheduleView() {
    const utils = trpc.useContext();
    const params = new URLSearchParams(window.location.search);
    const initialDate = params.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("date")!) ? parseISO(params.get("date")!) : new Date();
    const [anchor, setAnchor] = useState(initialDate);
    const [view, setView] = useState<"week" | "month">(params.get("view") === "month" ? "month" : "week");
    const [showBacklog, setShowBacklog] = useState(true);
    const [projectFilter, setProjectFilter] = useState("");
    const [sourceFilter, setSourceFilter] = useState("");
    const [drafts, setDrafts] = useState<DraftChange[]>([]);
    const [dragged, setDragged] = useState<any>(null);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [dayDetail, setDayDetail] = useState<string | null>(null);
    const [review, setReview] = useState<any>(null);

    const bounds = useMemo(() => {
        if (view === "month") {
            const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
            return { from: dateKey(start), to: dateKey(addDays(start, 41)) };
        }
        const start = startOfWeek(anchor, { weekStartsOn: 0 });
        return { from: dateKey(start), to: dateKey(addDays(start, 6)) };
    }, [anchor, view]);
    const { data, isLoading } = trpc.schedule.listMine.useQuery(bounds);
    const { data: sources } = trpc.schedule.listSources.useQuery(bounds);
    const previewMutation = trpc.schedule.previewChanges.useMutation();
    const commitMutation = trpc.schedule.commitChanges.useMutation({
        onSuccess: async () => {
            setDrafts([]); setReview(null);
            await Promise.all([utils.schedule.listMine.invalidate(), utils.schedule.listSources.invalidate(), utils.schedule.listTeam.invalidate(), utils.schedule.getCapacityMatrix.invalidate()]);
            toast.success("排程變更已儲存");
        },
        onError: error => toast.error(error.message)
    });
    const projects = sources?.projects || [];
    const opportunities = sources?.opportunities || [];
    const effectiveBlocks = useMemo(() => applyDraftChanges(data?.blocks || [], drafts), [data?.blocks, drafts]);
    const visibleBlocks = effectiveBlocks.filter(block =>
        (!sourceFilter || block.sourceType === sourceFilter) &&
        (!projectFilter || block.projectId === projectFilter || block.opportunityId === projectFilter)
    );

    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (!drafts.length) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [drafts.length]);

    const navigate = (next: Date, nextView = view) => {
        if (drafts.length && !window.confirm("目前有未儲存的排程變更，放棄後切換日期嗎？")) return;
        setDrafts([]); setAnchor(next); setView(nextView);
        setCalendarQuery({ date: dateKey(next), view: nextView });
    };

    const openNew = (date = dateKey(anchor), slot: ScheduleSlot = "am", preset?: any) => {
        setDayDetail(null);
        setEditor({ key: crypto.randomUUID(), date, slot, preset });
    };
    const openEdit = (block: any) => {
        setDayDetail(null);
        setEditor({ key: crypto.randomUUID(), date: block.date, slot: block.slot, block });
    };

    const stageSubmit = (state: EditorState, fieldsList: BlockFields[]) => {
        setDrafts(current => {
            if (state.block) {
                const fields = fieldsList[0];
                if (state.block.clientId) {
                    return current.map(change => change.kind === "create" && change.clientId === state.block.clientId ? { ...change, ...fields } : change);
                }
                const next: DraftChange = { kind: "update", id: state.block.id, expectedVersion: state.block.version, ...fields };
                return [...current.filter(change => !(change.kind !== "create" && change.id === state.block.id)), next];
            }
            return [...current, ...fieldsList.map(fields => ({ kind: "create" as const, clientId: crypto.randomUUID(), ...fields }))];
        });
        setEditor(null);
    };

    const stageDelete = (block: any) => {
        setDrafts(current => block.clientId
            ? current.filter(change => !(change.kind === "create" && change.clientId === block.clientId))
            : [...current.filter(change => !(change.kind !== "create" && change.id === block.id)), { kind: "cancel", id: block.id, expectedVersion: block.version }]);
        setEditor(null);
    };

    const dropOnSlot = (date: string, slot: ScheduleSlot) => {
        if (!dragged) return;
        if (dragged.backlog) {
            const item = dragged.backlog;
            const sourceType = item.kind as ScheduleSourceType;
            setDrafts(current => [...current, {
                kind: "create",
                clientId: crypto.randomUUID(),
                date,
                slot,
                sourceType,
                projectId: item.projectId,
                wbsItemId: item.wbsItemId,
                opportunityId: item.opportunityId,
                title: item.title,
                workContent: undefined,
                batchId: crypto.randomUUID()
            }]);
        } else {
            const block = dragged.block;
            if (block.date === date && block.slot === slot) return setDragged(null);
            stageSubmit({ key: "drag", block, date, slot }, [blockFields(block, { date, slot })]);
        }
        setDragged(null);
    };

    const prepareReview = async () => {
        if (!drafts.length) return;
        try {
            const result = await previewMutation.mutateAsync({ changes: drafts });
            setReview(result);
        } catch (error: any) {
            toast.error(error.message || "無法檢查排程變更");
        }
    };

    const renderSlot = (date: string, slot: "am" | "pm") => {
        const blocks = visibleBlocks.filter(block => block.date === date && block.slot === slot);
        return (
            <div
                className="min-h-24 border-t p-1.5 transition hover:bg-muted/20"
                onDragOver={event => event.preventDefault()}
                onDrop={() => dropOnSlot(date, slot)}
                onClick={() => openNew(date, slot)}
            >
                {blocks[0] && <ScheduleCard block={blocks[0]} name={displayBlockName(blocks[0], projects, opportunities)} onClick={() => openEdit(blocks[0])} onDragStart={() => setDragged({ block: blocks[0] })} />}
                {blocks.length > 1 && <button type="button" onClick={event => { event.stopPropagation(); setDayDetail(date); }} className="mt-1 w-full rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">+{blocks.length - 1} 項衝突</button>}
            </div>
        );
    };

    const weekStart = startOfWeek(anchor, { weekStartsOn: 0 });
    const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const monthStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
    const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthStart, index));
    const dayDetailBlocks = dayDetail ? effectiveBlocks.filter(block => block.date === dayDetail) : [];
    const reviewMissingReasons = review?.overloads?.flatMap((item: any) => item.missingReasonIds || []) || [];

    if (isLoading) return <div className="p-12 text-center text-muted-foreground">載入個人排程…</div>;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => navigate(view === "week" ? addWeeks(anchor, -1) : addMonths(anchor, -1))} className="rounded-lg border p-2 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" onClick={() => navigate(new Date())} className="rounded-lg border px-3 py-2 text-sm font-medium">今天</button>
                    <button type="button" onClick={() => navigate(view === "week" ? addWeeks(anchor, 1) : addMonths(anchor, 1))} className="rounded-lg border p-2 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <div className="min-w-40 font-bold">{view === "week" ? `${format(weekStart, "yyyy/MM/dd")}－${format(addDays(weekStart, 6), "MM/dd")}` : format(anchor, "yyyy 年 MM 月")}</div>
                <div className="flex rounded-lg border bg-muted/30 p-1 text-sm">
                    <button type="button" onClick={() => navigate(anchor, "week")} className={`rounded-md px-3 py-1.5 ${view === "week" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>週</button>
                    <button type="button" onClick={() => navigate(anchor, "month")} className={`rounded-md px-3 py-1.5 ${view === "month" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>月</button>
                </div>
                <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)} className="min-w-44 rounded-lg border bg-background px-3 py-2 text-sm">
                    <option value="">全部專案／商機</option>
                    {projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
                    {opportunities.map(opportunity => <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>)}
                </select>
                <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    <option value="">全部類型</option>
                    {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" onClick={() => setShowBacklog(value => !value)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">{showBacklog ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}待排項目</button>
                    <button type="button" onClick={() => openNew(dateKey(anchor), "full_day")} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><Layers3 className="h-4 w-4" />批次安排</button>
                    <button type="button" onClick={() => openNew()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />新增</button>
                </div>
            </div>

            {drafts.length > 0 && (
                <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-lg dark:bg-amber-950/80 dark:text-amber-100">
                    <div className="font-semibold">{drafts.length} 項未儲存變更</div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setDrafts([])} className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm">放棄</button>
                        <button type="button" onClick={prepareReview} disabled={previewMutation.isPending} className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />檢查並儲存</button>
                    </div>
                </div>
            )}

            <div className={`grid gap-4 ${showBacklog ? "xl:grid-cols-[minmax(0,1fr)_280px]" : ""}`}>
                {view === "week" ? (
                    <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
                        <div className="grid grid-cols-[64px_repeat(7,minmax(110px,1fr))] overflow-x-auto">
                            <div className="border-r bg-muted/30" />
                            {weekDays.map(day => <div key={day.toString()} className={`border-r px-2 py-3 text-center ${[0, 6].includes(day.getDay()) ? "bg-amber-50/70 dark:bg-amber-950/20" : "bg-muted/30"}`}><div className="text-xs text-muted-foreground">{format(day, "EEE")}</div><div className="font-bold">{format(day, "MM/dd")}</div></div>)}
                            <div className="flex min-h-48 flex-col border-r bg-muted/20 text-xs font-semibold text-muted-foreground"><div className="flex flex-1 items-center justify-center border-t">AM</div><div className="flex flex-1 items-center justify-center border-t">PM</div></div>
                            {weekDays.map(day => {
                                const key = dateKey(day);
                                const full = visibleBlocks.filter(block => block.date === key && block.slot === "full_day");
                                const halfCount = visibleBlocks.filter(block => block.date === key && block.slot !== "full_day").length;
                                return <div key={key} className={`relative min-h-48 border-r ${[0, 6].includes(day.getDay()) ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
                                    {renderSlot(key, "am")}{renderSlot(key, "pm")}
                                    {full[0] && <div className="absolute inset-2 z-10 flex flex-col rounded-lg border bg-card/95 p-2 shadow-md">
                                        <ScheduleCard block={full[0]} name={displayBlockName(full[0], projects, opportunities)} onClick={() => openEdit(full[0])} onDragStart={() => setDragged({ block: full[0] })} />
                                        <div className="mt-2 text-center text-[11px] font-semibold text-muted-foreground">全天</div>
                                        {(full.length > 1 || halfCount > 0) && <button type="button" onClick={() => setDayDetail(key)} className="mt-auto rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">另有 {full.length - 1 + halfCount} 項衝突</button>}
                                    </div>}
                                </div>;
                            })}
                        </div>
                    </section>
                ) : (
                    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                        <div className="grid grid-cols-7 border-b bg-muted/30 text-center text-xs font-semibold text-muted-foreground">{["日", "一", "二", "三", "四", "五", "六"].map(day => <div key={day} className="py-2">{day}</div>)}</div>
                        <div className="grid grid-cols-7">
                            {monthDays.map(day => {
                                const key = dateKey(day);
                                const blocks = visibleBlocks.filter(block => block.date === key);
                                const am = blocks.some(block => ["am", "full_day"].includes(block.slot));
                                const pm = blocks.some(block => ["pm", "full_day"].includes(block.slot));
                                const overloaded = blocks.filter(block => ["am", "full_day"].includes(block.slot)).length > 1 || blocks.filter(block => ["pm", "full_day"].includes(block.slot)).length > 1;
                                return <button type="button" key={key} onClick={() => setDayDetail(key)} className={`min-h-24 border-b border-r p-2 text-left hover:bg-muted/30 ${!isSameMonth(day, anchor) ? "bg-muted/10 text-muted-foreground" : ""} ${[0, 6].includes(day.getDay()) ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
                                    <div className="flex items-center justify-between"><span className="text-sm font-semibold">{format(day, "d")}</span>{overloaded && <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}</div>
                                    <div className="mt-3 flex gap-1 text-[10px]"><span className={`rounded px-1.5 py-0.5 ${am ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>AM</span><span className={`rounded px-1.5 py-0.5 ${pm ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>PM</span></div>
                                    <div className="mt-2 text-xs text-muted-foreground">{blocks.length} 項</div>
                                </button>;
                            })}
                        </div>
                    </section>
                )}

                {showBacklog && (
                    <aside className="h-fit max-h-[720px] overflow-hidden rounded-xl border bg-card shadow-sm">
                        <div className="border-b px-4 py-3"><h3 className="font-bold">待排項目</h3><p className="text-xs text-muted-foreground">拖曳到 AM／PM 時段</p></div>
                        <div className="max-h-[650px] space-y-2 overflow-y-auto p-3">
                            {(sources?.backlog || []).map((item: any) => <button key={item.id} type="button" draggable onDragStart={() => setDragged({ backlog: item })} onClick={() => openNew(dateKey(anchor), "am", { ...item, sourceType: item.kind })} className="w-full rounded-lg border bg-background p-3 text-left hover:border-primary">
                                <div className="text-[10px] font-semibold uppercase text-primary">{sourceLabels[item.kind as ScheduleSourceType]}</div>
                                <div className="truncate text-sm font-semibold">{item.title}</div>
                                <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                            </button>)}
                            {(sources?.backlog || []).length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">目前沒有待排項目</div>}
                        </div>
                    </aside>
                )}
            </div>

            {editor && <ScheduleEditor key={editor.key} editor={editor} projects={projects} opportunities={opportunities} effectiveBlocks={effectiveBlocks} onClose={() => setEditor(null)} onSubmit={stageSubmit} onDelete={stageDelete} />}

            {dayDetail && (
                <div className="fixed inset-0 z-[65] flex justify-end bg-black/25" onClick={() => setDayDetail(null)}>
                    <aside className="h-full w-full max-w-md overflow-y-auto border-l bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
                        <div className="flex items-center justify-between border-b p-4"><div><p className="text-xs text-muted-foreground">排程詳情</p><h2 className="font-bold">{format(parseISO(dayDetail), "yyyy/MM/dd")}</h2></div><button type="button" onClick={() => setDayDetail(null)} className="rounded p-2 hover:bg-muted"><X className="h-5 w-5" /></button></div>
                        <div className="space-y-2 p-4">{dayDetailBlocks.map(block => <ScheduleCard key={block.id} block={block} name={`${slotLabels[block.slot as ScheduleSlot]} · ${displayBlockName(block, projects, opportunities)}`} onClick={() => openEdit(block)} onDragStart={() => setDragged({ block })} />)}{dayDetailBlocks.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">此日尚無排程</p>}</div>
                        <div className="grid grid-cols-3 gap-2 border-t p-4">{(["am", "pm", "full_day"] as ScheduleSlot[]).map(slot => <button key={slot} type="button" onClick={() => openNew(dayDetail, slot)} className="rounded-lg border px-3 py-2 text-sm">新增{slotLabels[slot]}</button>)}</div>
                    </aside>
                </div>
            )}

            {review && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setReview(null)}>
                    <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
                        <div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">儲存前檢查</p><h2 className="text-lg font-bold">共 {review.changeCount} 項變更</h2></div><button type="button" onClick={() => setReview(null)} className="rounded p-2 hover:bg-muted"><X className="h-5 w-5" /></button></div>
                        <div className="mt-4 space-y-2">
                            {review.conflicts?.length > 0 && <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">有 {review.conflicts.length} 項版本衝突，請重新整理。</div>}
                            {review.overloads?.map((item: any) => <div key={item.date} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><strong>{item.date}</strong>：AM {item.amCount} 項、PM {item.pmCount} 項{item.isWeekend ? "，週末排程" : ""}{item.missingReasonIds?.length ? "；尚缺超載原因" : ""}</div>)}
                            {!review.overloads?.length && !review.conflicts?.length && <div className="rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-800">未偵測到衝突或超載。</div>}
                        </div>
                        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setReview(null)} className="rounded-lg border px-4 py-2 text-sm">返回調整</button><button type="button" disabled={review.conflicts?.length || reviewMissingReasons.length || commitMutation.isPending} onClick={() => commitMutation.mutate({ baseRevision: data?.revision || 0, changes: drafts })} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">確認儲存</button></div>
                    </div>
                </div>
            )}
        </div>
    );
}
