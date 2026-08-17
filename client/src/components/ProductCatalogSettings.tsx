import { useMemo, useState } from "react";
import { Check, ChevronRight, Edit3, FolderTree, Plus, X } from "lucide-react";
import toast from "react-hot-toast";
import { trpc } from "../lib/trpc";
import { useCurrentUser } from "../lib/useCurrentUser";

type CatalogItem = {
    id: string;
    code: string;
    name: string;
    level: 1 | 2 | 3;
    parentId: string;
    isActive: boolean;
    sortOrder: number;
};

const statusLabels: Record<string, string> = { pending: "待核准", approved: "已核准", rejected: "已退回" };

export function ProductCatalogSettings() {
    const { user, hasRole } = useCurrentUser();
    const utils = trpc.useUtils();
    const { data: catalog } = trpc.system.getProductCatalog.useQuery();
    const { data: changes } = trpc.system.listProductCatalogChanges.useQuery();
    const [editing, setEditing] = useState<CatalogItem | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [level, setLevel] = useState<1 | 2 | 3>(1);
    const [parentId, setParentId] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [sortOrder, setSortOrder] = useState(0);
    const canReview = hasRole("admin") || user?.isPlatformOwner === true;

    const submit = trpc.system.submitProductCatalogChange.useMutation({
        onSuccess: async () => {
            await utils.system.listProductCatalogChanges.invalidate();
            resetForm();
            toast.success("產品主檔異動已送交核准");
        },
        onError: error => {
            toast.error(error.message || "產品主檔送審失敗");
        }
    });
    const review = trpc.system.reviewProductCatalogChange.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.system.getProductCatalog.invalidate(),
                utils.system.getProductCategories.invalidate(),
                utils.system.listProductCatalogChanges.invalidate(),
                utils.system.getSettings.invalidate()
            ]);
            toast.success("產品主檔申請已完成審核");
        },
        onError: error => {
            toast.error(error.message || "產品主檔審核失敗");
        }
    });

    const items = (catalog || []) as CatalogItem[];
    const byParent = useMemo(() => {
        const result = new Map<string, CatalogItem[]>();
        for (const item of items) {
            const key = item.parentId || "root";
            result.set(key, [...(result.get(key) || []), item]);
        }
        return result;
    }, [items]);
    const parentOptions = items.filter(item => item.level === level - 1 && item.isActive);

    function resetForm() {
        setEditing(null); setShowForm(false); setCode(""); setName(""); setLevel(1);
        setParentId(""); setIsActive(true); setSortOrder(0);
    }
    const openCreate = (nextLevel: 1 | 2 | 3, nextParentId = "") => {
        resetForm(); setLevel(nextLevel); setParentId(nextParentId); setShowForm(true);
    };
    const openEdit = (item: CatalogItem) => {
        setEditing(item); setCode(item.code); setName(item.name); setLevel(item.level);
        setParentId(item.parentId || ""); setIsActive(item.isActive); setSortOrder(item.sortOrder); setShowForm(true);
    };
    const handleSubmit = () => {
        if (!code.trim() || !name.trim()) return toast.error("請填寫產品代碼與名稱");
        if (level > 1 && !parentId) return toast.error(`第 ${level} 階產品必須指定上層`);
        submit.mutate({
            action: editing ? "update" : "create",
            targetId: editing?.id,
            payload: { code: code.trim().toUpperCase(), name: name.trim(), level, parentId: parentId || undefined, isActive, sortOrder }
        });
    };
    const rejectChange = (id: string) => {
        const reason = window.prompt("請輸入退回原因");
        if (!reason?.trim()) return;
        review.mutate({ id, decision: "rejected", reason: reason.trim() });
    };

    const renderItem = (item: CatalogItem) => (
        <div key={item.id} className={`rounded-lg border p-3 ${item.isActive ? "bg-card" : "bg-muted/40 opacity-70"}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.code} · 第 {item.level} 階{!item.isActive ? " · 已停用" : ""}</p></div>
                <button type="button" onClick={() => openEdit(item)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="提出修改"><Edit3 className="h-4 w-4" /></button>
            </div>
            {item.level < 3 && item.isActive && <button type="button" onClick={() => openCreate((item.level + 1) as 2 | 3, item.id)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"><Plus className="h-3 w-3" />新增下一階</button>}
        </div>
    );

    return <div className="space-y-6">
        <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
            <div><h3 className="flex items-center gap-2 text-lg font-bold"><FolderTree className="h-5 w-5 text-primary" />三階產品主檔</h3><p className="mt-1 text-sm text-muted-foreground">管理者可提出新增或修改；核准前不會影響商機可選產品。</p></div>
            <button type="button" onClick={() => openCreate(1)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4" />新增第一階</button>
        </div>

        {showForm && <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="mb-4 flex items-center justify-between"><h4 className="font-semibold">{editing ? `修改「${editing.name}」` : `新增第 ${level} 階產品`}</h4><button type="button" onClick={resetForm}><X className="h-4 w-4" /></button></div>
            <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm"><span className="mb-1 block font-medium">階層</span><select value={level} disabled={!!editing} onChange={event => { const next = Number(event.target.value) as 1 | 2 | 3; setLevel(next); setParentId(""); }} className="w-full rounded-lg border bg-background px-3 py-2 disabled:opacity-60"><option value={1}>第一階：產品群組</option><option value={2}>第二階：產品類別</option><option value={3}>第三階：正式產品</option></select></label>
                <label className="text-sm"><span className="mb-1 block font-medium">上層項目</span><select value={parentId} disabled={level === 1} onChange={event => setParentId(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 disabled:opacity-60"><option value="">{level === 1 ? "第一階不需上層" : "請選擇上層"}</option>{parentOptions.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                <label className="text-sm"><span className="mb-1 block font-medium">代碼</span><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} className="w-full rounded-lg border bg-background px-3 py-2 font-mono" placeholder="例如 CLOUD" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium">名稱</span><input value={name} onChange={event => setName(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" placeholder="例如 雲端服務" /></label>
                <label className="text-sm"><span className="mb-1 block font-medium">排序</span><input type="number" min={0} value={sortOrder} onChange={event => setSortOrder(Number(event.target.value))} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
                <label className="flex items-center gap-2 self-end rounded-lg border bg-background px-3 py-2 text-sm"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} />核准後啟用此項目</label>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={resetForm} className="rounded-lg border px-4 py-2 text-sm">取消</button><button type="button" disabled={submit.isPending} onClick={handleSubmit} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">送交核准</button></div>
        </div>}

        <div className="grid gap-4 lg:grid-cols-3">
            <section><div className="mb-2 flex items-center justify-between"><h4 className="font-semibold">第一階</h4><span className="text-xs text-muted-foreground">產品群組</span></div><div className="space-y-2">{(byParent.get("root") || []).filter(item => item.level === 1).map(renderItem)}</div></section>
            <section><div className="mb-2 flex items-center justify-between"><h4 className="font-semibold">第二階</h4><span className="text-xs text-muted-foreground">產品類別</span></div><div className="space-y-2">{items.filter(item => item.level === 2).map(item => <div key={item.id}>{renderItem(item)}<p className="mt-1 flex items-center gap-1 pl-2 text-[11px] text-muted-foreground"><ChevronRight className="h-3 w-3" />{items.find(parent => parent.id === item.parentId)?.name || "未指定上層"}</p></div>)}</div></section>
            <section><div className="mb-2 flex items-center justify-between"><h4 className="font-semibold">第三階</h4><span className="text-xs text-muted-foreground">商機可選產品</span></div><div className="space-y-2">{items.filter(item => item.level === 3).map(item => <div key={item.id}>{renderItem(item)}<p className="mt-1 flex items-center gap-1 pl-2 text-[11px] text-muted-foreground"><ChevronRight className="h-3 w-3" />{items.find(parent => parent.id === item.parentId)?.name || "舊資料／未分類"}</p></div>)}</div></section>
        </div>

        <section className="overflow-hidden rounded-xl border"><div className="border-b bg-muted/30 p-4"><h4 className="font-semibold">新增／修改核准紀錄</h4></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3">申請內容</th><th className="px-4 py-3">申請人</th><th className="px-4 py-3">狀態</th><th className="px-4 py-3">結果</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y">{(changes || []).map(change => {
                    const mayDecide = canReview && (user?.isPlatformOwner === true || change.requestedById !== user?.id);
                    return <tr key={change.id}><td className="px-4 py-3"><p className="font-medium">{change.action === "create" ? "新增" : "修改"}第 {change.payload.level} 階「{change.payload.name}」</p><p className="text-xs text-muted-foreground">{change.payload.code}</p></td><td className="px-4 py-3">{change.requestedByName}<p className="text-xs text-muted-foreground">{new Date(change.requestedAt).toLocaleString()}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${change.status === "approved" ? "bg-emerald-100 text-emerald-700" : change.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{statusLabels[change.status]}</span></td><td className="px-4 py-3 text-xs text-muted-foreground">{change.decisionReason || change.decidedByName || "—"}</td><td className="px-4 py-3 text-right">{mayDecide && change.status === "pending" ? <div className="flex justify-end gap-1"><button type="button" disabled={review.isPending} onClick={() => review.mutate({ id: change.id, decision: "approved" })} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs text-white"><Check className="h-3 w-3" />核准</button><button type="button" disabled={review.isPending} onClick={() => rejectChange(change.id)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700">退回</button></div> : change.status === "pending" && change.requestedById === user?.id && !user?.isPlatformOwner ? <span className="text-xs text-muted-foreground">需由其他管理者審核</span> : null}</td></tr>;
                })}{(changes || []).length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">尚無產品主檔申請</td></tr>}</tbody></table></div></section>
    </div>;
}
