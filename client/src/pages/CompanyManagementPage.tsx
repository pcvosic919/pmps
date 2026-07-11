import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Building2, Edit, FileSpreadsheet, Plus, Search, Trash2, Upload } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useCurrentUser } from "../lib/useCurrentUser";

type CompanyForm = {
    id?: string;
    name: string;
    taxId: string;
    industry: string;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
    isActive: boolean;
};

const emptyForm: CompanyForm = {
    name: "",
    taxId: "",
    industry: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    isActive: true
};

const getCell = (row: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
        const value = row[key];
        if (value != null && String(value).trim()) return String(value).trim();
    }
    return "";
};

export function CompanyManagementPage() {
    const [search, setSearch] = useState("");
    const [form, setForm] = useState<CompanyForm>(emptyForm);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { user } = useCurrentUser();
    const canDelete = user?.email?.trim().toLowerCase() === "demo@demo.com";
    const utils = trpc.useUtils();
    const { data, isLoading, refetch } = trpc.companies.list.useQuery({ search, limit: 500, includeInactive: true });

    const createCompany = trpc.companies.create.useMutation({
        onSuccess: async () => {
            setForm(emptyForm);
            await utils.companies.list.invalidate();
        }
    });
    const updateCompany = trpc.companies.update.useMutation({
        onSuccess: async () => {
            setForm(emptyForm);
            await utils.companies.list.invalidate();
        }
    });
    const deleteCompany = trpc.companies.delete.useMutation({
        onSuccess: async () => {
            await utils.companies.list.invalidate();
        }
    });
    const bulkUpsert = trpc.companies.bulkUpsert.useMutation({
        onSuccess: async (result) => {
            alert(`匯入完成：新增 ${result.inserted} 筆、更新 ${result.updated} 筆、略過 ${result.skipped} 筆`);
            await refetch();
        },
        onError: (error) => alert(error.message || "公司清單匯入失敗")
    });

    const companies = data?.items || [];
    const title = form.id ? "編輯公司" : "新增公司";
    const canSave = form.name.trim().length > 0 && !createCompany.isPending && !updateCompany.isPending;

    const importHints = useMemo(() => [
        "公司名稱 / 客戶名稱 / name",
        "統編 / taxId",
        "產業 / industry",
        "聯絡人 / contactName",
        "電話 / phone",
        "Email / email",
        "地址 / address",
        "備註 / notes"
    ], []);

    const handleSave = () => {
        const payload = {
            name: form.name.trim(),
            taxId: form.taxId.trim() || undefined,
            industry: form.industry.trim() || undefined,
            contactName: form.contactName.trim() || undefined,
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            address: form.address.trim() || undefined,
            notes: form.notes.trim() || undefined,
            isActive: form.isActive
        };
        if (form.id) {
            updateCompany.mutate({ id: form.id, ...payload });
        } else {
            createCompany.mutate(payload);
        }
    };

    const handleFile = async (file?: File) => {
        if (!file) return;
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
        const companies = rows.map((row) => ({
            name: getCell(row, ["公司名稱", "客戶名稱", "客戶", "name", "Name", "companyName", "customerName"]),
            taxId: getCell(row, ["統編", "統一編號", "taxId", "Tax ID"]),
            industry: getCell(row, ["產業", "行業", "industry", "Industry"]),
            contactName: getCell(row, ["聯絡人", "窗口", "contactName", "Contact"]),
            phone: getCell(row, ["電話", "phone", "Phone", "tel"]),
            email: getCell(row, ["Email", "email", "電子郵件"]),
            address: getCell(row, ["地址", "address", "Address"]),
            notes: getCell(row, ["備註", "notes", "Notes"])
        })).filter((item) => item.name);
        if (companies.length === 0) {
            alert("找不到公司名稱欄位，請確認 Excel 第一列表頭。");
            return;
        }
        bulkUpsert.mutate({ companies });
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    <Building2 className="h-8 w-8 text-primary" />
                    <div>
                        <h2 className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-3xl font-bold tracking-tight text-transparent">公司管理</h2>
                        <p className="mt-1 text-muted-foreground">維護客戶公司主檔，商機建立時可直接選擇客戶。</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(event) => void handleFile(event.target.files?.[0])}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        匯入 Excel
                    </button>
                    <button
                        type="button"
                        onClick={() => setForm(emptyForm)}
                        className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        新增公司
                    </button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                    <h3 className="mb-4 text-lg font-bold">{title}</h3>
                    <div className="space-y-3">
                        {[
                            ["name", "公司名稱 *"],
                            ["taxId", "統一編號"],
                            ["industry", "產業"],
                            ["contactName", "聯絡人"],
                            ["phone", "電話"],
                            ["email", "Email"],
                            ["address", "地址"]
                        ].map(([key, label]) => (
                            <label key={key} className="block text-sm">
                                <span className="mb-1 block font-medium text-muted-foreground">{label}</span>
                                <input
                                    value={String(form[key as keyof CompanyForm] || "")}
                                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                />
                            </label>
                        ))}
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-muted-foreground">備註</span>
                            <textarea
                                value={form.notes}
                                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                                className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={form.isActive}
                                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                            />
                            啟用公司
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={!canSave}
                                onClick={handleSave}
                                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                            >
                                儲存
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm(emptyForm)}
                                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                            >
                                清除
                            </button>
                        </div>
                    </div>
                    <div className="mt-5 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        <div className="mb-2 flex items-center font-semibold text-foreground">
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Excel 欄位支援
                        </div>
                        {importHints.map((hint) => <div key={hint}>・{hint}</div>)}
                    </div>
                </div>

                <div className="rounded-xl border bg-card shadow-sm">
                    <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-lg font-bold">公司清單</h3>
                            <p className="text-sm text-muted-foreground">共 {companies.length} 筆資料</p>
                        </div>
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="搜尋公司、統編、產業..."
                                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-muted/50 text-xs text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">公司名稱</th>
                                    <th className="px-4 py-3 font-medium">統編</th>
                                    <th className="px-4 py-3 font-medium">產業</th>
                                    <th className="px-4 py-3 font-medium">聯絡資訊</th>
                                    <th className="px-4 py-3 text-center font-medium">狀態</th>
                                    <th className="px-4 py-3 text-right font-medium">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {isLoading ? (
                                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">載入中...</td></tr>
                                ) : companies.length === 0 ? (
                                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">尚無公司資料</td></tr>
                                ) : companies.map((company: any) => (
                                    <tr key={company.id} className="hover:bg-muted/30">
                                        <td className="px-4 py-3 font-semibold">{company.name}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{company.taxId || "-"}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{company.industry || "-"}</td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            <div>{company.contactName || "-"}</div>
                                            <div>{company.phone || company.email || ""}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${company.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                                                {company.isActive ? "啟用" : "停用"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...company, notes: company.notes || "" })}
                                                className="mr-2 rounded-md p-1.5 text-primary hover:bg-primary/10"
                                                title="編輯公司"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </button>
                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (confirm(`確定要刪除公司「${company.name}」嗎？`)) {
                                                            deleteCompany.mutate({ id: company.id });
                                                        }
                                                    }}
                                                    className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                                                    title="刪除公司"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
