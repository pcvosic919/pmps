import { useMemo, useState } from "react";
import { Archive, History, LayoutTemplate, Plus, RotateCcw, Save, Settings2, Type } from "lucide-react";
import toast from "react-hot-toast";
import { trpc } from "../lib/trpc";

type Category = "layout" | "text" | "parameter";
type ValueType = "string" | "number" | "boolean" | "json";

const categoryMeta: Record<Category, { label: string; icon: typeof LayoutTemplate; description: string }> = {
    layout: { label: "版面設定", icon: LayoutTemplate, description: "控制內容寬度、選單、卡片、表單及對話框尺寸。" },
    text: { label: "頁面文字", icon: Type, description: "管理已接入設定代碼的標題、選單與提示文字。" },
    parameter: { label: "平台參數", icon: Settings2, description: "管理非敏感的預設值及介面行為參數。" }
};

const makeEmptyForm = (category: Category) => ({
    id: undefined as string | undefined,
    category,
    key: `${category}.`,
    label: "",
    description: "",
    valueType: "string" as ValueType,
    valueText: "",
    scope: "global" as "global" | "page" | "component",
    target: "",
    device: "all" as "all" | "desktop" | "tablet" | "mobile",
    constraintsText: "{}",
    reason: ""
});

export function PlatformControlPage() {
    const [category, setCategory] = useState<Category>("layout");
    const [form, setForm] = useState(() => makeEmptyForm("layout"));
    const [revisionConfigId, setRevisionConfigId] = useState<string>();
    const utils = trpc.useUtils();
    const managedQuery = trpc.platform.listManaged.useQuery();
    const publishedQuery = trpc.platform.getPublished.useQuery();
    const revisionsQuery = trpc.platform.revisions.useQuery(
        { configurationId: revisionConfigId || "", limit: 30 },
        { enabled: Boolean(revisionConfigId) }
    );

    const refresh = async () => {
        await Promise.all([
            utils.platform.listManaged.invalidate(),
            utils.platform.getPublished.invalidate(),
            revisionConfigId ? utils.platform.revisions.invalidate({ configurationId: revisionConfigId, limit: 30 }) : Promise.resolve()
        ]);
    };
    const upsert = trpc.platform.upsert.useMutation({
        onSuccess: async () => { toast.success("平台設定已發布"); await refresh(); },
        onError: (error) => toast.error(error.message)
    });
    const archive = trpc.platform.archive.useMutation({
        onSuccess: async () => { toast.success("設定已停用"); setRevisionConfigId(undefined); await refresh(); },
        onError: (error) => toast.error(error.message)
    });
    const restore = trpc.platform.restore.useMutation({
        onSuccess: async () => { toast.success("已還原指定版本"); await refresh(); },
        onError: (error) => toast.error(error.message)
    });

    const rows = useMemo(
        () => (managedQuery.data || []).filter((item) => item.category === category),
        [category, managedQuery.data]
    );
    const effective = useMemo(
        () => new Map((publishedQuery.data || []).map((item) => [item.key, item.value])),
        [publishedQuery.data]
    );

    const edit = (item: any) => {
        setCategory(item.category);
        setForm({
            id: item.id,
            category: item.category,
            key: item.key,
            label: item.label,
            description: item.description || "",
            valueType: item.valueType,
            valueText: item.valueType === "json" ? JSON.stringify(item.value, null, 2) : String(item.value),
            scope: item.scope || "global",
            target: item.target || "",
            device: item.device || "all",
            constraintsText: JSON.stringify(item.constraints || {}, null, 2),
            reason: ""
        });
        setRevisionConfigId(item.id);
    };

    const parseValue = () => {
        if (form.valueType === "number") {
            const value = Number(form.valueText);
            if (!Number.isFinite(value)) throw new Error("請輸入有效數字");
            return value;
        }
        if (form.valueType === "boolean") return form.valueText === "true";
        if (form.valueType === "json") return JSON.parse(form.valueText);
        return form.valueText;
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        try {
            upsert.mutate({
                id: form.id,
                category: form.category,
                key: form.key,
                label: form.label,
                description: form.description || undefined,
                value: parseValue(),
                valueType: form.valueType,
                scope: form.scope,
                target: form.target,
                device: form.device,
                constraints: JSON.parse(form.constraintsText || "{}"),
                reason: form.reason
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "設定格式不正確");
        }
    };

    const contentWidth = Number(effective.get("layout.contentMaxWidth") || 1600);
    const sidebarWidth = Number(effective.get("layout.sidebarWidth") || 288);
    const pagePadding = Number(effective.get("layout.pagePadding") || 24);
    const cardGap = Number(effective.get("layout.cardGap") || 16);

    return (
        <div className="mx-auto max-w-[1700px] space-y-5">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
                <h1 className="text-2xl font-bold">平台控制中心</h1>
                <p className="mt-1 text-sm text-muted-foreground">只有 Platform Owner 可以新增、修改、停用及還原平台設定。所有變更均保留版本與操作原因。</p>
            </div>

            <div className="flex flex-wrap gap-2 border-b">
                {(Object.keys(categoryMeta) as Category[]).map((key) => {
                    const Icon = categoryMeta[key].icon;
                    return <button key={key} onClick={() => { setCategory(key); setForm(makeEmptyForm(key)); setRevisionConfigId(undefined); }} className={`inline-flex items-center border-b-2 px-4 py-3 text-sm font-medium ${category === key ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}><Icon className="mr-2 h-4 w-4" />{categoryMeta[key].label}</button>;
                })}
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{categoryMeta[category].description} 不允許儲存密碼、Token、Secret、任意 CSS 或 JavaScript。</div>

            {category === "layout" && (
                <div className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold">即時版面摘要</div>
                    <div className="overflow-x-auto rounded-lg bg-muted/40 p-4">
                        <div className="flex min-w-[720px] overflow-hidden rounded-lg border bg-background" style={{ maxWidth: Math.min(contentWidth, 1100) }}>
                            <div className="shrink-0 border-r bg-card p-3 text-xs text-muted-foreground" style={{ width: Math.min(sidebarWidth, 320) }}>側邊選單 {sidebarWidth}px</div>
                            <div className="flex-1" style={{ padding: pagePadding }}>
                                <div className="grid grid-cols-3" style={{ gap: cardGap }}>{[1, 2, 3].map((item) => <div key={item} className="h-20 rounded-lg border bg-card p-3 text-xs">卡片 {item}</div>)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
                <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b p-4">
                        <div><h2 className="font-semibold">{categoryMeta[category].label}</h2><p className="text-xs text-muted-foreground">共 {rows.length} 筆設定</p></div>
                        <button onClick={() => { setForm(makeEmptyForm(category)); setRevisionConfigId(undefined); }} className="inline-flex items-center rounded-lg border px-3 py-2 text-sm hover:bg-muted"><Plus className="mr-1 h-4 w-4" />新增</button>
                    </div>
                    <div className="divide-y">
                        {managedQuery.isLoading ? <div className="p-8 text-center text-muted-foreground">載入中…</div> : rows.length === 0 ? <div className="p-8 text-center text-muted-foreground">尚無設定</div> : rows.map((item) => (
                            <button key={`${item.category}-${item.key}-${item.device}-${item.target}`} onClick={() => edit(item)} className={`w-full p-4 text-left hover:bg-muted/40 ${form.key === item.key && form.device === item.device ? "bg-primary/5" : ""}`}>
                                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.label}</span>{item.isDefault && <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">系統預設</span>}{!item.isActive && <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] text-red-600">已停用</span>}<span className="ml-auto text-xs text-muted-foreground">v{item.version}</span></div>
                                <div className="mt-1 font-mono text-xs text-muted-foreground">{item.key}</div>
                                <div className="mt-2 truncate text-sm">{typeof item.value === "object" ? JSON.stringify(item.value) : String(item.value)}</div>
                            </button>
                        ))}
                    </div>
                </section>

                <div className="space-y-5">
                    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
                        <div className="flex items-center justify-between"><h2 className="font-semibold">{form.id || rows.some((item) => item.key === form.key && item.isDefault) ? "修改設定" : "新增設定"}</h2>{form.id && <button type="button" onClick={() => { if (window.confirm("確定停用此設定？")) archive.mutate({ id: form.id!, reason: form.reason || "由平台控制中心停用" }); }} className="inline-flex items-center text-sm text-red-600"><Archive className="mr-1 h-4 w-4" />停用</button>}</div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1 text-sm"><span>設定代碼</span><input value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} required className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs" /></label>
                            <label className="space-y-1 text-sm"><span>顯示名稱</span><input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} required className="w-full rounded-lg border bg-background px-3 py-2" /></label>
                            <label className="space-y-1 text-sm"><span>資料類型</span><select value={form.valueType} onChange={(event) => setForm({ ...form, valueType: event.target.value as ValueType, valueText: event.target.value === "boolean" ? "false" : "" })} className="w-full rounded-lg border bg-background px-3 py-2"><option value="string">文字</option><option value="number">數字</option><option value="boolean">布林值</option><option value="json">JSON</option></select></label>
                            <label className="space-y-1 text-sm"><span>裝置</span><select value={form.device} onChange={(event) => setForm({ ...form, device: event.target.value as any })} className="w-full rounded-lg border bg-background px-3 py-2"><option value="all">全部</option><option value="desktop">桌面</option><option value="tablet">平板</option><option value="mobile">手機</option></select></label>
                            <label className="space-y-1 text-sm"><span>範圍</span><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value as any })} className="w-full rounded-lg border bg-background px-3 py-2"><option value="global">全站</option><option value="page">頁面</option><option value="component">元件</option></select></label>
                            <label className="space-y-1 text-sm"><span>目標頁面／元件</span><input value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} placeholder="例如 /opportunities" className="w-full rounded-lg border bg-background px-3 py-2" /></label>
                        </div>
                        <label className="block space-y-1 text-sm"><span>設定值</span>{form.valueType === "boolean" ? <select value={form.valueText} onChange={(event) => setForm({ ...form, valueText: event.target.value })} className="w-full rounded-lg border bg-background px-3 py-2"><option value="true">啟用</option><option value="false">停用</option></select> : <textarea value={form.valueText} onChange={(event) => setForm({ ...form, valueText: event.target.value })} rows={form.valueType === "json" ? 6 : 3} required className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm" />}</label>
                        <label className="block space-y-1 text-sm"><span>限制條件（JSON）</span><textarea value={form.constraintsText} onChange={(event) => setForm({ ...form, constraintsText: event.target.value })} rows={3} className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs" /></label>
                        <label className="block space-y-1 text-sm"><span>說明</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} className="w-full rounded-lg border bg-background px-3 py-2" /></label>
                        <label className="block space-y-1 text-sm"><span>修改原因</span><input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} minLength={3} required className="w-full rounded-lg border bg-background px-3 py-2" /></label>
                        <button disabled={upsert.isPending} className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"><Save className="mr-2 h-4 w-4" />{upsert.isPending ? "儲存中…" : "儲存並發布"}</button>
                    </form>

                    {revisionConfigId && (
                        <section className="rounded-xl border bg-card p-5 shadow-sm">
                            <div className="mb-3 flex items-center gap-2"><History className="h-5 w-5 text-primary" /><h2 className="font-semibold">版本紀錄</h2></div>
                            <div className="max-h-72 space-y-2 overflow-y-auto">
                                {(revisionsQuery.data || []).map((revision) => <div key={revision.id} className="rounded-lg border p-3 text-xs"><div className="flex items-center"><span className="font-semibold">v{revision.version} · {revision.action}</span><span className="ml-auto text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</span></div><div className="mt-1 text-muted-foreground">{revision.actorName}：{revision.reason}</div>{revision.after && <button onClick={() => restore.mutate({ revisionId: revision.id, reason: `還原至 v${revision.version}` })} className="mt-2 inline-flex items-center text-primary"><RotateCcw className="mr-1 h-3.5 w-3.5" />還原此版本</button>}</div>)}
                                {!revisionsQuery.isLoading && (revisionsQuery.data || []).length === 0 && <div className="text-sm text-muted-foreground">尚無版本紀錄</div>}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
