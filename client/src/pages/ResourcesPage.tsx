import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Check, ClipboardCheck, Gauge, Pencil, Users } from "lucide-react";
import toast from "react-hot-toast";
import { trpc } from "../lib/trpc";
import { useCurrentUser } from "../lib/useCurrentUser";

type ResourceTab = "overview" | "allocations" | "approvals" | "people" | "utilization";
type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";

const tabLabels: Record<ResourceTab, string> = {
    overview: "資源總覽",
    allocations: "配置看板",
    approvals: "待核定",
    people: "人員與技能",
    utilization: "實際稼動"
};
const statusLabels: Record<string, string> = {
    draft: "草稿", submitted: "待核定", approved: "已核定", rejected: "已退回",
    superseded: "已取代", cancelled: "已取消"
};
const roleLabels: Record<string, string> = {
    admin: "系統管理", manager: "部門主管", pm: "專案經理", presales: "售前",
    business: "業務", tech: "技術"
};
const levelLabels: Record<SkillLevel, string> = {
    beginner: "初階", intermediate: "中階", advanced: "進階", expert: "專家"
};

const monthBounds = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const format = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    return { start: format(start), end: format(end), month: format(start).slice(0, 7) };
};

export function ResourcesPage() {
    const bounds = useMemo(() => monthBounds(), []);
    const { user, hasRole } = useCurrentUser();
    const initialTab = new URLSearchParams(window.location.search).get("tab") as ResourceTab | null;
    const [tab, setTab] = useState<ResourceTab>(initialTab && tabLabels[initialTab] ? initialTab : "overview");
    const [selectedApprovalId, setSelectedApprovalId] = useState("");
    const [selectedCandidateId, setSelectedCandidateId] = useState("");
    const [mySkills, setMySkills] = useState<Array<{ category: string; level: SkillLevel }>>([]);
    const canApprove = hasRole("admin") || hasRole("manager") || user?.isPlatformOwner;
    const canSeeActual = hasRole("admin") || hasRole("manager") || hasRole("pm") || user?.isPlatformOwner;
    const utils = trpc.useContext();

    const { data: people, isLoading } = trpc.resources.listPeople.useQuery({ startDate: new Date(bounds.start), endDate: new Date(bounds.end) });
    const { data: allocations } = trpc.resources.listAllocations.useQuery();
    const { data: skillCatalog } = trpc.resources.skillCatalog.useQuery();
    const { data: actual } = trpc.analytics.getUtilization.useQuery({ month: bounds.month }, { enabled: canSeeActual });
    const submitted = (allocations || []).filter(item => item.status === "submitted");
    const selectedApproval = submitted.find(item => item.id === selectedApprovalId);
    const { data: candidates } = trpc.resources.recommendCandidates.useQuery(
        { allocationId: selectedApprovalId },
        { enabled: !!selectedApprovalId }
    );
    const me = people?.find(person => person.id === user?.id);

    useEffect(() => {
        if (me) setMySkills((me.skills || []) as Array<{ category: string; level: SkillLevel }>);
    }, [me]);
    useEffect(() => {
        if (!selectedApprovalId && submitted[0]) setSelectedApprovalId(submitted[0].id);
    }, [selectedApprovalId, submitted]);
    useEffect(() => {
        setSelectedCandidateId(selectedApproval?.preferredUserId || candidates?.[0]?.id || "");
    }, [candidates, selectedApproval]);

    const refresh = async () => {
        await Promise.all([
            utils.resources.listPeople.invalidate(), utils.resources.listAllocations.invalidate(),
            utils.resources.capacityMatrix.invalidate(), utils.resources.recommendCandidates.invalidate()
        ]);
    };
    const updateSkills = trpc.resources.updateMySkills.useMutation({
        onSuccess: async () => { await refresh(); toast.success("技能資料已更新"); }
    });
    const updateCapacity = trpc.resources.updateCapacity.useMutation({
        onSuccess: async () => { await refresh(); toast.success("每日容量已更新"); }
    });
    const approve = trpc.resources.approve.useMutation({
        onSuccess: async result => { await refresh(); toast.success(result.overCapacity ? "已核定，並保留超配警告" : "人力需求已核定"); }
    });
    const reject = trpc.resources.reject.useMutation({
        onSuccess: async () => { await refresh(); toast.success("需求已退回"); }
    });

    const changeTab = (next: ResourceTab) => {
        setTab(next);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", next);
        window.history.replaceState({}, "", url);
    };
    const toggleSkill = (name: string) => {
        setMySkills(current => current.some(skill => skill.category === name)
            ? current.filter(skill => skill.category !== name)
            : [...current, { category: name, level: "intermediate" }]);
    };
    const setSkillLevel = (name: string, level: SkillLevel) => {
        setMySkills(current => current.map(skill => skill.category === name ? { ...skill, level } : skill));
    };
    const editCapacity = (person: any) => {
        const raw = window.prompt(`設定 ${person.name} 的每日標準工時（0–24）`, String(person.dailyCapacityHours));
        if (raw === null) return;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 24) return toast.error("請輸入 0 到 24 之間的數字");
        updateCapacity.mutate({ userId: person.id, dailyCapacityHours: value });
    };
    const rejectSelected = () => {
        if (!selectedApproval) return;
        const reason = window.prompt("請輸入退回原因");
        if (!reason?.trim()) return;
        reject.mutate({ id: selectedApproval.id, decisionNote: reason.trim() });
    };

    const approved = (allocations || []).filter(item => item.status === "approved" && item.requestType !== "cancel");
    const overAllocated = people?.filter(person => person.isOverAllocated).length || 0;
    const avgPlanned = people?.length ? Math.round(people.reduce((sum, person) => sum + person.peakAllocationPercent, 0) / people.length) : 0;

    if (isLoading) return <div className="p-10 text-center text-muted-foreground">載入人力資源資料中...</div>;

    return (
        <div className="space-y-6">
            <header className="rounded-2xl border border-border/60 bg-gradient-to-r from-slate-950 to-slate-800 p-6 text-white shadow-sm">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">People · Capacity · Allocation</p>
                        <h1 className="text-3xl font-bold">資源管理中心</h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-300">以核定配置掌握計畫負載，以填報工時追蹤實際稼動，讓跨專案派工有一致依據。</p>
                    </div>
                    <div className="rounded-xl bg-white/10 px-4 py-3 text-sm"><span className="text-slate-300">本期容量基準</span><strong className="ml-2">週一至週五</strong></div>
                </div>
            </header>

            <nav className="flex gap-2 overflow-x-auto rounded-xl border bg-card p-2">
                {(Object.keys(tabLabels) as ResourceTab[]).filter(key => key !== "approvals" || canApprove).map(key => (
                    <button key={key} onClick={() => changeTab(key)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                        {tabLabels[key]}{key === "approvals" && submitted.length > 0 ? ` (${submitted.length})` : ""}
                    </button>
                ))}
            </nav>

            {tab === "overview" && (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[
                            { label: "資源人數", value: people?.length || 0, suffix: " 人", icon: Users, color: "text-sky-600" },
                            { label: "有效配置", value: approved.length, suffix: " 筆", icon: ClipboardCheck, color: "text-emerald-600" },
                            { label: "平均計畫負載", value: avgPlanned, suffix: "%", icon: Gauge, color: "text-violet-600" },
                            { label: "超配人員", value: overAllocated, suffix: " 人", icon: AlertTriangle, color: overAllocated ? "text-rose-600" : "text-slate-500" }
                        ].map(card => <div key={card.label} className="rounded-xl border bg-card p-5 shadow-sm"><card.icon className={`mb-4 h-5 w-5 ${card.color}`} /><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-1 text-3xl font-bold">{card.value}<span className="text-base font-medium text-muted-foreground">{card.suffix}</span></p></div>)}
                    </div>
                    <div className="rounded-xl border bg-card p-5 shadow-sm">
                        <h2 className="mb-4 font-semibold">本月人力負載</h2>
                        <div className="space-y-4">
                            {(people || []).map(person => <div key={person.id} className="grid items-center gap-3 md:grid-cols-[220px_1fr_90px]">
                                <div><p className="font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.department || "未指定部門"} · {roleLabels[person.role] || person.role}</p></div>
                                <div className="h-3 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${person.peakAllocationPercent > 100 ? "bg-rose-500" : person.peakAllocationPercent >= 80 ? "bg-amber-500" : "bg-sky-500"}`} style={{ width: `${Math.min(100, person.peakAllocationPercent)}%` }} /></div>
                                <div className={`text-right font-semibold ${person.peakAllocationPercent > 100 ? "text-rose-600" : ""}`}>{person.peakAllocationPercent}%</div>
                            </div>)}
                        </div>
                    </div>
                </div>
            )}

            {tab === "allocations" && (
                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="border-b p-5"><h2 className="font-semibold">跨專案配置</h2><p className="mt-1 text-sm text-muted-foreground">計畫負載只計入已核定配置。</p></div>
                    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3">專案</th><th className="px-4 py-3">人員</th><th className="px-4 py-3">部門／角色</th><th className="px-4 py-3">期間</th><th className="px-4 py-3 text-right">投入比例</th><th className="px-4 py-3">狀態</th></tr></thead><tbody className="divide-y">
                        {(allocations || []).map(item => <tr key={item.id}><td className="px-4 py-3"><p className="font-medium">{item.projectTitle}</p><p className="text-xs text-muted-foreground">{item.projectCode}</p></td><td className="px-4 py-3">{item.assigneeName || item.preferredUserName || "待選派"}</td><td className="px-4 py-3">{item.targetDepartment} · {roleLabels[item.requestedRole] || item.requestedRole}</td><td className="px-4 py-3">{new Date(item.startDate).toLocaleDateString()} – {new Date(item.endDate).toLocaleDateString()}</td><td className="px-4 py-3 text-right font-semibold">{item.allocationPercent}%</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${item.overCapacityAtApproval ? "bg-rose-100 text-rose-700" : "bg-muted"}`}>{statusLabels[item.status] || item.status}{item.overCapacityAtApproval ? " · 超配" : ""}</span></td></tr>)}
                        {(allocations || []).length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">目前沒有可見的人力配置</td></tr>}
                    </tbody></table></div>
                </div>
            )}

            {tab === "approvals" && canApprove && (
                <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
                    <div className="rounded-xl border bg-card p-3 shadow-sm">
                        <h2 className="px-2 py-3 font-semibold">待核定需求</h2>
                        <div className="space-y-2">{submitted.map(item => <button key={item.id} onClick={() => setSelectedApprovalId(item.id)} className={`w-full rounded-lg border p-3 text-left ${selectedApprovalId === item.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><p className="font-medium">{item.projectTitle}</p><p className="mt-1 text-xs text-muted-foreground">{item.targetDepartment} · {item.allocationPercent}% · {new Date(item.startDate).toLocaleDateString()}</p></button>)}{submitted.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">目前沒有待核定需求</p>}</div>
                    </div>
                    <div className="rounded-xl border bg-card p-5 shadow-sm">
                        {!selectedApproval ? <p className="py-16 text-center text-muted-foreground">請選擇一筆需求</p> : <>
                            <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">{selectedApproval.projectCode}</p><h2 className="text-xl font-bold">{selectedApproval.projectTitle}</h2><p className="mt-1 text-sm">需要 {roleLabels[selectedApproval.requestedRole] || selectedApproval.requestedRole}，投入 {selectedApproval.allocationPercent}%</p></div><div className="flex gap-2"><button onClick={rejectSelected} className="rounded-lg border px-4 py-2 text-sm text-rose-600 hover:bg-rose-50">退回</button><button disabled={!selectedCandidateId || approve.isPending} onClick={() => approve.mutate({ id: selectedApproval.id, assigneeId: selectedCandidateId })} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">核定人選</button></div></div>
                            <div className="space-y-3">{(candidates || []).map(candidate => <label key={candidate.id} className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 ${selectedCandidateId === candidate.id ? "border-primary bg-primary/5" : ""}`}><div className="flex items-center gap-3"><input type="radio" name="candidate" checked={selectedCandidateId === candidate.id} onChange={() => setSelectedCandidateId(candidate.id)} /><div><p className="font-semibold">{candidate.name}</p><p className="text-xs text-muted-foreground">{roleLabels[candidate.role] || candidate.role} · 目前 {candidate.allocatedPercent}% · 核定後 {candidate.projectedPercent}%</p><div className="mt-2 flex flex-wrap gap-1">{candidate.missingSkills.map((skill: string) => <span key={skill} className="rounded bg-rose-100 px-2 py-0.5 text-[11px] text-rose-700">缺少 {skill}</span>)}{candidate.roleMatch && candidate.fullMatch && <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">角色技能符合</span>}</div></div></div>{candidate.isOverAllocated && <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><AlertTriangle className="h-4 w-4" />超配警告</span>}</label>)}</div>
                        </>}
                    </div>
                </div>
            )}

            {tab === "people" && (
                <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(people || []).map(person => <article key={person.id} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between"><div><h3 className="font-bold">{person.name}</h3><p className="text-xs text-muted-foreground">{person.department || "未指定部門"} · {roleLabels[person.role] || person.role}</p></div>{canApprove && <button onClick={() => editCapacity(person)} className="rounded p-1 text-muted-foreground hover:bg-muted" title="調整每日容量"><Pencil className="h-4 w-4" /></button>}</div><div className="my-4 flex items-end justify-between rounded-lg bg-muted/40 p-3"><span className="text-xs text-muted-foreground">每日標準容量</span><strong>{person.dailyCapacityHours}h</strong></div><div className="flex flex-wrap gap-1">{(person.skills || []).map((skill: { category: string; level: string }) => <span key={skill.category} className="rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-700">{skill.category} · {levelLabels[skill.level as SkillLevel]}</span>)}{person.skills.length === 0 && <span className="text-xs text-muted-foreground">尚未設定技能</span>}</div></article>)}</div>
                    <aside className="h-fit rounded-xl border bg-card p-5 shadow-sm"><h2 className="font-semibold">我的技能</h2><p className="mt-1 text-sm text-muted-foreground">更新後立即用於候選人推薦。</p><div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto">{(skillCatalog || []).map(skill => { const selected = mySkills.find(item => item.category === skill.name); return <div key={skill.id} className="rounded-lg border p-3"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!selected} onChange={() => toggleSkill(skill.name)} />{skill.name}</label>{selected && <select value={selected.level} onChange={event => setSkillLevel(skill.name, event.target.value as SkillLevel)} className="mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm">{Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</div>; })}</div><button disabled={updateSkills.isPending} onClick={() => updateSkills.mutate({ skills: mySkills })} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" />儲存我的技能</button></aside>
                </div>
            )}

            {tab === "utilization" && (
                <div className="rounded-xl border bg-card p-5 shadow-sm"><div className="mb-5"><h2 className="flex items-center gap-2 font-semibold"><Activity className="h-5 w-5 text-emerald-600" />實際稼動率</h2><p className="mt-1 text-sm text-muted-foreground">資料來自本月已填報的專案與協銷工時，不包含計畫配置。</p></div>{!canSeeActual ? <p className="py-12 text-center text-muted-foreground">此角色只能查看自己的計畫配置與技能資料。</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/50"><tr><th className="px-4 py-3">人員</th><th className="px-4 py-3">部門</th><th className="px-4 py-3 text-right">專案工時</th><th className="px-4 py-3 text-right">協銷工時</th><th className="px-4 py-3 text-right">實際稼動率</th></tr></thead><tbody className="divide-y">{(actual?.users || []).map(item => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3">{item.department || "—"}</td><td className="px-4 py-3 text-right">{item.projectHours}h</td><td className="px-4 py-3 text-right">{item.presalesHours}h</td><td className="px-4 py-3 text-right font-semibold">{item.utilizationRate}%</td></tr>)}</tbody></table></div>}</div>
            )}
        </div>
    );
}
