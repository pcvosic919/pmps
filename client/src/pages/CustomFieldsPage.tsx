import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Settings2, Plus, Trash2, Edit } from "lucide-react";

export function CustomFieldsPage() {
    const { data: fields, isLoading, refetch } = trpc.system.getCustomFields.useQuery();
    const [editingId, setEditingId] = useState<string | null>(null);
    const createField = trpc.system.createCustomField.useMutation({ onSuccess: () => { setIsModalOpen(false); refetch(); } });
    const updateField = trpc.system.updateCustomField.useMutation({ onSuccess: () => { setIsModalOpen(false); refetch(); } });
    const deleteField = trpc.system.deleteCustomField.useMutation({ onSuccess: () => refetch() });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({
        entityType: "opportunity",
        name: "",
        fieldType: "text",
        options: "",
        isRequired: false
    });

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;

    const handleSave = () => {
        const payload = {
            entityType: form.entityType as any,
            name: form.name,
            fieldType: form.fieldType as any,
            options: form.fieldType === "select" || form.fieldType === "multiselect" ? form.options.split(",").map(s => s.trim()) : undefined,
            isRequired: form.isRequired
        };

        if (editingId) {
            updateField.mutate({ id: editingId, ...payload });
        } else {
            createField.mutate(payload);
        }
    };

    const handleDelete = (id: string) => {
        if (confirm("確認刪除該自訂欄位？")) {
            deleteField.mutate({ id });
        }
    };

    const entityLabelMap: Record<string, string> = {
        opportunity: "商機 (Opportunity)",
        sr: "服務請求 (SR)",
        wbs: "WBS 任務",
        cr: "變更請求 (CR)"
    };

    const fieldTypeMap: Record<string, string> = {
        text: "單行文字",
        number: "數字",
        select: "單選下拉",
        multiselect: "多選",
        date: "日期",
        switch: "開關 (Boolean)",
        url: "網址連結"
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div className="flex items-center space-x-3">
                    <Settings2 className="w-8 h-8 text-primary" />
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">自訂欄位 (Custom Fields)</h2>
                        <p className="text-muted-foreground mt-1">設定系統各模組的擴充欄位，以適應不同客戶需求</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg flex items-center text-sm font-medium transition-all shadow-md"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    新增自訂欄位
                </button>
            </div>

            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground border-b">
                        <tr>
                            <th className="px-6 py-4 font-medium">欄位名稱</th>
                            <th className="px-6 py-4 font-medium">套用模組</th>
                            <th className="px-6 py-4 font-medium">欄位型態</th>
                            <th className="px-6 py-4 font-medium">選項值</th>
                            <th className="px-6 py-4 font-medium text-center">必填設定</th>
                            <th className="px-6 py-4 font-medium text-center">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {fields?.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">目前沒有任何自訂欄位</td>
                            </tr>
                        ) : (
                            fields?.map((f: any) => (
                                <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4 font-semibold">{f.name}</td>
                                    <td className="px-6 py-4 text-muted-foreground">{entityLabelMap[f.entityType]}</td>
                                    <td className="px-6 py-4">
                                        <span className="bg-accent text-accent-foreground px-2 py-1 rounded-md text-xs font-medium">
                                            {fieldTypeMap[f.fieldType]}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-muted-foreground max-w-xs truncate">
                                        {f.options ? (f.options as string[]).join(", ") : "-"}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {f.isRequired ? <span className="text-emerald-600 font-bold">是</span> : <span className="text-muted-foreground">否</span>}
                                    </td>
                                    <td className="px-6 py-4 text-center space-x-2">
                                        <button 
                                            onClick={() => {
                                                setEditingId(f.id);
                                                setForm({
                                                    entityType: f.entityType,
                                                    name: f.name,
                                                    fieldType: f.fieldType,
                                                    options: f.options ? (f.options as string[]).join(", ") : "",
                                                    isRequired: !!f.isRequired
                                                });
                                                setIsModalOpen(true);
                                            }}
                                            className="text-primary hover:text-primary/70 p-1"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDelete(f.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-md rounded-xl shadow-lg border p-6">
                        <h3 className="text-xl font-bold mb-4">{editingId ? "編輯自訂欄位" : "新增自訂欄位"}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">套用模組</label>
                                <select
                                    value={form.entityType}
                                    onChange={e => setForm({ ...form, entityType: e.target.value })}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    {Object.entries(entityLabelMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">欄位名稱</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    placeholder="例如：客戶ERP系統群組代碼"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">資料類型</label>
                                <select
                                    value={form.fieldType}
                                    onChange={e => setForm({ ...form, fieldType: e.target.value })}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    {Object.entries(fieldTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            {(form.fieldType === "select" || form.fieldType === "multiselect") && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">設定選項 (請以逗號分隔)</label>
                                    <input
                                        type="text"
                                        value={form.options}
                                        onChange={e => setForm({ ...form, options: e.target.value })}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        placeholder="選項 A, 選項 B, 選項 C"
                                    />
                                </div>
                            )}
                            <div className="flex items-center space-x-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="required"
                                    checked={form.isRequired}
                                    onChange={e => setForm({ ...form, isRequired: e.target.checked })}
                                    className="rounded border-input text-primary"
                                />
                                <label htmlFor="required" className="text-sm font-medium">必填欄位</label>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end space-x-3">
                            <button onClick={() => { setIsModalOpen(false); setEditingId(null); }} className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-accent transition-colors">取消</button>
                            <button onClick={handleSave} disabled={createField.isPending || updateField.isPending || !form.name.trim()} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50">
                                {createField.isPending || updateField.isPending ? "儲存中..." : "確認儲存"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
