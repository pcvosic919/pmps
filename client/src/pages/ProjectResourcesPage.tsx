import { useEffect, useState } from "react";
import { ArrowLeft, CalendarRange, CheckCircle2, Plus, RefreshCw, Send, Users, XCircle } from "lucide-react";
import { Link, useRoute } from "wouter";
import toast from "react-hot-toast";
import { trpc } from "../lib/trpc";

type Requirement = { category: string; minimumLevel: "beginner" | "intermediate" | "advanced" | "expert" };
const roles = ["admin", "manager", "pm", "presales", "business", "tech"] as const;
const roleLabels: Record<string, string> = { admin: "系統管理", manager: "部門主管", pm: "專案經理", presales: "售前", business: "業務", tech: "技術" };
const statusLabels: Record<string, string> = { draft: "草稿", submitted: "待核定", approved: "已核定", rejected: "已退回", superseded: "已取代", cancelled: "已取消" };

const dateValue = (value?: string | Date) => value ? new Date(value).toISOString().slice(0, 10) : "";

export function ProjectResourcesPage() {
    const [, params] = useRoute("/service-requests/:id/resources");
    const srId = params?.id || "";
    const utils = trpc.useContext();
    const { data: project, isLoading } = trpc.projects.srById.useQuery({ id: srId }, { enabled: !!srId });
    const { data: allocations } = trpc.resources.listAllocations.useQuery({ projectId: srId }, { enabled: !!srId });
    const { data: departments } = trpc.users.getDepartments.useQuery();
    const { data: skillCatalog } = trpc.resources.skillCatalog.useQuery();
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState("");
    const [targetDepartment, setTargetDepartment] = useState("");
    const [requestedRole, setRequestedRole] = useState<typeof roles[number]>("tech");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [allocationPercent, setAllocationPercent] = useState(50);
    const [note, setNote] = useState("");
    const [requirements, setRequirements] = useState<Requirement[]>([]);

    useEffect(() => {
        if (!project || targetDepartment) return;
        setTargetDepartment(project.createdByDepartment || departments?.[0] || "");
        setStartDate(dateValue(project.plannedStartDate) || dateValue(new Date()));
        setEndDate(dateValue(project.plannedEndDate) || dateValue(new Date(Date.now() + 30 * 86400000)));
    }, [departments, project, targetDepartment]);

    const refresh = async () => { await Promise.all([utils.resources.listAllocations.invalidate(), utils.resources.listPeople.invalidate()]); };
    const submitMutation = trpc.resources.submit.useMutation();
    const createDraft = trpc.resources.createDraft.useMutation();
    const revise = trpc.resources.revise.useMutation();
    const cancel = trpc.resources.requestCancellation.useMutation({ onSuccess: async () => { await refresh(); toast.success("取消申請已送交主管核定"); } });

    const resetForm = () => {
        setShowForm(false); setEditingId(""); setRequestedRole("tech"); setAllocationPercent(50); setNote(""); setRequirements([]);
    };
    const openRevision = (item: any) => {
        setEditingId(item.id); setTargetDepartment(item.targetDepartment); setRequestedRole(item.requestedRole);
        setStartDate(dateValue(item.startDate)); setEndDate(dateValue(item.endDate)); setAllocationPercent(item.allocationPercent);
        setNote(item.note || ""); setRequirements(item.requiredSkills || []); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const saveAndSubmit = async () => {
        if (!targetDepartment || !startDate || !endDate) return toast.error("請填寫部門與配置期間");
        const payload = { targetDepartment, requestedRole, requiredSkills: requirements, startDate: new Date(startDate), endDate: new Date(endDate), allocationPercent, note: note || undefined };
        try {
            const draft = editingId
                ? await revise.mutateAsync({ id: editingId, ...payload })
                : await createDraft.mutateAsync({ projectId: srId, ...payload });
            await submitMutation.mutateAsync({ id: draft.id });
            await refresh(); resetForm(); toast.success(editingId ? "配置異動已送審" : "人力需求已送審");
        } catch (error: any) { toast.error(error.message || "送審失敗"); }
    };
    const addRequirement = () => {
        const next = skillCatalog?.find(skill => !requirements.some(item => item.category === skill.name));
        if (next) setRequirements(current => [...current, { category: next.name, minimumLevel: "intermediate" }]);
    };

    if (isLoading) return <div className="p-10 text-center text-muted-foreground">載入專案人力規劃中...</div>;
    if (!project) return <div className="p-10 text-center">找不到專案</div>;
    const managed = project.resourcePlanningMode === "managed";
    const canOperate = project.permissions?.canOperate === true;

    return <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-6 shadow-sm md:flex-row md:items-center">
            <div><Link href={`/service-requests/${srId}`}><a className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />返回專案 WBS</a></Link><h1 className="text-2xl font-bold">{project.title} · 人力規劃</h1><p className="mt-1 text-sm text-muted-foreground">{project.projectCode || ""} · {managed ? "核定式資源管理" : "既有專案舊制"}</p></div>
            {managed && canOperate && <button onClick={() => setShowForm(current => !current)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4" />提出人力需求</button>}
        </div>

        {!managed && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><h2 className="font-semibold">此專案維持既有派工方式</h2><p className="mt-1 text-sm">部署前建立的專案不需要重新送審，也不會限制目前的 WBS 指派。</p></div>}

        {showForm && managed && <section className="rounded-xl border bg-card p-6 shadow-sm"><div className="mb-5"><h2 className="text-lg font-semibold">{editingId ? "提出配置異動" : "新增人力需求"}</h2><p className="mt-1 text-sm text-muted-foreground">需求送出後由目標部門主管核定實際人選。</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm"><span className="mb-1 block font-medium">目標部門</span><select value={targetDepartment} onChange={e => setTargetDepartment(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2">{(departments || []).map(item => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">需求角色</span><select value={requestedRole} onChange={e => setRequestedRole(e.target.value as typeof roles[number])} className="w-full rounded-lg border bg-background px-3 py-2">{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">投入比例</span><div className="flex items-center gap-2"><input type="range" min={1} max={100} value={allocationPercent} onChange={e => setAllocationPercent(Number(e.target.value))} className="flex-1" /><strong className="w-12 text-right">{allocationPercent}%</strong></div></label>
            <div className="rounded-lg bg-muted/40 p-3 text-sm"><span className="text-muted-foreground">負載規則</span><p className="mt-1 font-medium">超過 100% 顯示警告，但不阻擋核定</p></div>
            <label className="text-sm"><span className="mb-1 block font-medium">開始日期</span><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
            <label className="text-sm"><span className="mb-1 block font-medium">結束日期</span><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
            <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium">需求說明</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="工作內容、客戶限制或人選偏好" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
        </div><div className="mt-5"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium">必備技能</h3><button onClick={addRequirement} className="text-sm text-primary">＋加入技能條件</button></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{requirements.map((requirement, index) => <div key={`${requirement.category}-${index}`} className="flex gap-2 rounded-lg border p-2"><select value={requirement.category} onChange={e => setRequirements(current => current.map((item, idx) => idx === index ? { ...item, category: e.target.value } : item))} className="min-w-0 flex-1 bg-background text-sm">{(skillCatalog || []).map(skill => <option key={skill.id} value={skill.name}>{skill.name}</option>)}</select><select value={requirement.minimumLevel} onChange={e => setRequirements(current => current.map((item, idx) => idx === index ? { ...item, minimumLevel: e.target.value as Requirement["minimumLevel"] } : item))} className="bg-background text-sm"><option value="beginner">初階</option><option value="intermediate">中階</option><option value="advanced">進階</option><option value="expert">專家</option></select><button onClick={() => setRequirements(current => current.filter((_, idx) => idx !== index))} className="text-rose-600">×</button></div>)}</div></div><div className="mt-6 flex justify-end gap-2"><button onClick={resetForm} className="rounded-lg border px-4 py-2 text-sm">取消</button><button disabled={createDraft.isPending || revise.isPending || submitMutation.isPending} onClick={saveAndSubmit} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" />送交主管核定</button></div></section>}

        <section className="rounded-xl border bg-card shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">配置紀錄</h2><p className="mt-1 text-sm text-muted-foreground">已核定人員會自動成為專案 Assignee，供 WBS 選用。</p></div><div className="divide-y">{(allocations || []).map(item => <article key={item.id} className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center"><div className="flex items-start gap-4"><div className={`rounded-full p-2 ${item.status === "approved" ? "bg-emerald-100 text-emerald-700" : item.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}>{item.status === "approved" ? <CheckCircle2 className="h-5 w-5" /> : item.status === "rejected" ? <XCircle className="h-5 w-5" /> : <CalendarRange className="h-5 w-5" />}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.assigneeName || item.preferredUserName || `${roleLabels[item.requestedRole]}需求`}</h3><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{statusLabels[item.status]}</span>{item.overCapacityAtApproval && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">超配警告</span>}</div><p className="mt-1 text-sm text-muted-foreground">{item.targetDepartment} · {item.allocationPercent}% · {new Date(item.startDate).toLocaleDateString()} 至 {new Date(item.endDate).toLocaleDateString()}</p>{item.decisionNote && <p className="mt-2 text-sm">核定說明：{item.decisionNote}</p>}</div></div>{canOperate && item.status === "approved" && item.requestType !== "cancel" && <div className="flex gap-2"><button onClick={() => openRevision(item)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" />異動</button><button onClick={() => { const reason = window.prompt("請輸入取消原因"); if (reason !== null) cancel.mutate({ id: item.id, note: reason || undefined }); }} className="rounded-lg border px-3 py-2 text-sm text-rose-600">申請取消</button></div>}</article>)}{(allocations || []).length === 0 && <div className="p-12 text-center text-muted-foreground"><Users className="mx-auto mb-3 h-10 w-10 opacity-40" />尚無人力需求或配置紀錄</div>}</div></section>
    </div>;
}
