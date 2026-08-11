import { useState, useEffect, useRef } from "react";
import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import { Plus, Briefcase, ChevronRight, Building2, Search, Loader2, Trash2, Download, Upload } from "lucide-react";
import { useDebounce } from "../lib/useDebounce";
import { useCurrentUser } from "../lib/useCurrentUser";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BusinessUserPicker } from "../components/BusinessUserPicker";
import { CompanySearchPicker } from "../components/CompanySearchPicker";
import { FormSection, FormSummaryPanel, StickyFormActions } from "../components/FormLayout";
import { OpportunityImportDialog } from "../components/opportunities/OpportunityImportDialog";
import { exportOpportunitiesToXlsx } from "../lib/opportunityExcel";

const OPPORTUNITY_PROBABILITIES = [0, 20, 40, 60, 80, 100] as const;

const oppSchema = z.object({
    title: z.string().min(1, "商機名稱不可為空"),
    customerName: z.string().min(1, "客戶名稱不可為空"),
    salesUserId: z.string().optional(),
    salesDepartment: z.string().optional(),
    salesRep: z.string().optional(),
    estimatedValue: z.number().min(0, "金額不能為負數"),
    presalesAmount: z.number().min(0, "協銷金額不能為負數").optional(),
    probability: z.union([z.literal(0), z.literal(20), z.literal(40), z.literal(60), z.literal(80), z.literal(100)]),
    opportunityType: z.enum(["revenue", "presales"]),
    productNames: z.array(z.string()).optional(),
    description: z.string().optional(),
    approvedM365: z.boolean().default(false),
    approvedAzure: z.boolean().default(false),
    approvedSecurity: z.boolean().default(false)
});

const opportunityTypeLabels: Record<string, string> = {
    revenue: "營收型商機",
    presales: "協銷"
};



export function OpportunitiesPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [companySearch, setCompanySearch] = useState("");
    const [sortBy] = useState<"createdAt" | "estimatedValue" | "status">("createdAt");
    const [sortOrder] = useState<"asc" | "desc">("desc");
    const [isImportOpen, setIsImportOpen] = useState(false);

    const debouncedSearchTerm = useDebounce(searchTerm, 500);
    const debouncedCompanySearch = useDebounce(companySearch, 300);

    const {
        data,
        isLoading,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = trpc.opportunities.list.useInfiniteQuery(
        { limit: 12, search: debouncedSearchTerm, sortBy, sortOrder },
        { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );
    const exportQuery = trpc.opportunities.exportRows.useQuery(
        { search: debouncedSearchTerm, sortBy, sortOrder },
        { enabled: false }
    );

    // Flatten the infinite pages into a single array
    const opps = data?.pages.flatMap(page => page.items) || [];
    const [isCreating, setIsCreating] = useState(false);
    
    // 自訂欄位數值暫存
    const [customFieldsValues, setCustomFieldsValues] = useState<Record<string, string>>({});
    const { data: customFieldDefs } = trpc.system.getCustomFields.useQuery();
    const { data: settings } = trpc.system.getSettings.useQuery();
    const { data: usersData } = trpc.users.list.useQuery({ limit: 500 });
    const { data: companiesData } = trpc.companies.list.useQuery({ search: debouncedCompanySearch, limit: 20 });
    const availableProducts = settings?.availableProducts || [];
    const businessUsers = usersData?.items || [];
    const companies = companiesData?.items || [];
    const oppFields = customFieldDefs?.filter((f: any) => f.entityType === "opportunity") || [];
    const { user, hasRole } = useCurrentUser();
    const canDelete = user?.email?.trim().toLowerCase() === "demo@demo.com";
    const canImport = ["admin", "manager", "business", "presales"].some(hasRole);
    const utils = trpc.useUtils();

    const observerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        });
        if (observerRef.current) {
            observer.observe(observerRef.current);
        }
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const form = useForm<any>({
        resolver: zodResolver(oppSchema) as any,
        defaultValues: {
            title: "",
            customerName: "",
            salesUserId: "",
            salesDepartment: "",
            salesRep: "",
            estimatedValue: 0,
            presalesAmount: 0,
            probability: 0,
            opportunityType: "revenue",
            productNames: [],
            description: "",
            approvedM365: false,
            approvedAzure: false,
            approvedSecurity: false
        }
    });

    const createOpp = trpc.opportunities.create.useMutation({
        onSuccess: () => {
            setIsCreating(false);
            refetch();
            form.reset();
            setCompanySearch("");
            setCustomFieldsValues({}); // 清空
        }
    });
    const createCompany = trpc.companies.create.useMutation({
        onSuccess: async (result) => {
            form.setValue("customerName", result.item.name, { shouldValidate: true });
            setCompanySearch(result.item.name);
            await utils.companies.list.invalidate();
        },
        onError: (err) => alert(err.message || "新增公司失敗")
    });

    const deleteOpp = trpc.opportunities.delete.useMutation({
        onSuccess: () => refetch(),
        onError: (err) => alert(err.message || "刪除失敗")
    });

    const handleCreate = (values: z.infer<typeof oppSchema>) => {
        const customFields = Object.entries(customFieldsValues).map(([fieldId, value]) => ({
            fieldId,
            value
        }));

        createOpp.mutate({
            title: values.title,
            customerName: values.customerName,
            salesUserId: values.salesUserId,
            salesDepartment: values.salesDepartment,
            salesRep: values.salesRep,
            estimatedValue: values.estimatedValue,
            presalesAmount: values.presalesAmount,
            probability: values.probability,
            opportunityType: values.opportunityType,
            productNames: values.productNames,
            description: values.description,
            approvedM365: values.approvedM365,
            approvedAzure: values.approvedAzure,
            approvedSecurity: values.approvedSecurity,
            customFields: customFields.length > 0 ? customFields : undefined
        });
    };

    const handleExport = async () => {
        const result = await exportQuery.refetch();
        if (result.error) {
            alert(result.error.message || "商機匯出失敗");
            return;
        }
        const exportData = result.data;
        if (!exportData || exportData.items.length === 0) {
            alert("目前查詢條件沒有可匯出的商機資料");
            return;
        }
        exportOpportunitiesToXlsx(exportData.items);
        if (exportData.truncated) {
            alert(`符合條件的資料超過 ${exportData.limit.toLocaleString()} 筆，本次僅匯出前 ${exportData.limit.toLocaleString()} 筆。`);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center">載入中...</div>;
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'new': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
            case 'qualified': return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
            case 'presales_active': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
            case 'quoting': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
            case 'won': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
            case 'converted': return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800';
            case 'lost': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
            case 'cancelled': return 'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-600';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            new: "待處理",
            qualified: "已確認",
            presales_active: "協銷中",
            quoting: "報價中",
            won: "已成交",
            converted: "已轉案",
            lost: "已失敗",
            cancelled: "已取消"
        };
        return labels[status] || status;
    };

    const watchedOppType = form.watch("opportunityType");
    const watchedEstimatedValue = Number(form.watch("estimatedValue") || 0);
    const watchedProducts = form.watch("productNames") || [];
    const selectedSalesRep = form.watch("salesRep");
    const selectedSalesDepartment = form.watch("salesDepartment");

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 bg-card p-6 rounded-xl shadow-sm border border-border/50 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">商機管理</h2>
                    <p className="text-muted-foreground mt-1">追蹤業務商機、指派協銷與轉換 SR 狀態</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void handleExport()}
                        disabled={exportQuery.isFetching}
                        className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {exportQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        {exportQuery.isFetching ? "匯出中..." : "匯出 Excel"}
                    </button>
                    {canImport && (
                        <button
                            type="button"
                            onClick={() => setIsImportOpen(true)}
                            className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                        >
                            <Upload className="mr-2 h-4 w-4" />
                            匯入 Excel
                        </button>
                    )}
                    <button
                        onClick={() => setIsCreating(true)}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md hover:shadow-lg">
                        <Plus className="w-4 h-4 mr-2" />
                        新增商機
                    </button>
                </div>
            </div>

            <div className="bg-card border rounded-xl shadow-sm p-4 flex justify-between items-center flex-wrap gap-4">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜尋商機名稱、客戶..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>


            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                <th className="px-6 py-4">狀態</th>
                                <th className="px-6 py-4">ID / 商機名稱</th>
                                <th className="px-6 py-4">成交率</th>
                                <th className="px-6 py-4">類型</th>
                                <th className="px-6 py-4">客戶名稱</th>
                                <th className="px-6 py-4">業務</th>
                                <th className="px-6 py-4">商機金額 (NT$)</th>
                                <th className="px-6 py-4">負責人</th>
                                <th className="px-6 py-4">建立日期</th>
                                <th className="px-6 py-4 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {opps?.map((opp) => (
                                <tr key={opp.id} className="group hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusColor(opp.status)}`}>
                                            {getStatusLabel(opp.status)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-mono text-muted-foreground mb-0.5">{opp.opportunityCode || `#${opp.id}`}</span>
                                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">{opp.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex min-w-12 justify-center rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-bold text-primary">
                                            {opp.probability ?? 0}%
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${(opp as any).opportunityType === "presales" ? "bg-cyan-100 text-cyan-800 border-cyan-200" : "bg-emerald-100 text-emerald-800 border-emerald-200"}`}>
                                            {opportunityTypeLabels[(opp as any).opportunityType] || opportunityTypeLabels[Number(opp.estimatedValue || 0) > 0 ? "revenue" : "presales"]}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center text-sm text-foreground/80">
                                            <Building2 className="w-3.5 h-3.5 mr-2 opacity-50" />
                                            {opp.customerName}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-foreground/80">
                                            <div className="font-medium">{(opp as any).salesRep || "未填寫"}</div>
                                            <div className="text-xs text-muted-foreground">{(opp as any).salesDepartment || "未填寫部門"}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-mono font-bold text-foreground">
                                            {Number(opp.finalDealAmount ?? opp.quotedAmount ?? opp.estimatedValue).toLocaleString()}
                                        </span>
                                        {opp.presalesAmount !== undefined && opp.presalesAmount > 0 && (
                                            <div className="mt-1 text-[10px] text-muted-foreground">協銷 {opp.presalesAmount.toLocaleString()}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-primary/80">
                                        {(opp as any).ownerName || "—"}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-muted-foreground">
                                        {new Date(opp.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            {canDelete && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`確定要刪除商機「${opp.title}」嗎？此操作無法復原。`)) {
                                                            deleteOpp.mutate({ id: opp.id });
                                                        }
                                                    }}
                                                    disabled={deleteOpp.isPending}
                                                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                                    title="刪除商機"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <Link href={`/opportunities/${opp.id}`}>
                                                <a className="inline-flex items-center px-3 py-1.5 text-xs font-bold bg-primary/5 text-primary border border-primary/10 rounded-lg hover:bg-primary hover:text-white transition-all">
                                                    詳細資訊
                                                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                                                </a>
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {(!opps || opps.length === 0) && (
                                <tr>
                                                <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground italic">
                                        <div className="flex flex-col items-center justify-center opacity-50">
                                            <Briefcase className="w-10 h-10 mb-2" />
                                            <p>尚無商機資料</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div ref={observerRef} className="flex justify-center mt-6">
                {isFetchingNextPage && (
                    <div className="text-muted-foreground text-sm flex items-center gap-1">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" /> 載入中...
                    </div>
                )}
            </div>

            <OpportunityImportDialog
                open={isImportOpen}
                onOpenChange={setIsImportOpen}
                onImported={async () => {
                    await utils.opportunities.list.invalidate();
                    await refetch();
                }}
            />

            {/* Create Modal */}
            <Dialog open={isCreating} onOpenChange={setIsCreating}>
                <DialogContent className="sm:max-w-5xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <Briefcase className="w-5 h-5 text-primary" />
                            <span>新增商機</span>
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                                <div className="space-y-4">
                                    <FormSection title="基本與業務" description="先填客戶、業務與商機金額，方便後續報表歸屬。">
                                        <FormField
                                            control={form.control}
                                            name="title"
                                            render={({ field }: any) => (
                                                <FormItem className="md:col-span-2">
                                                    <FormLabel>商機名稱 *</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="例：M365 導入協銷" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="probability"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>成交率</FormLabel>
                                                    <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                                                        <FormControl>
                                                            <SelectTrigger><SelectValue placeholder="選擇成交率" /></SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {OPPORTUNITY_PROBABILITIES.map((probability) => (
                                                                <SelectItem key={probability} value={String(probability)}>{probability}%</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="customerName"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>客戶名稱 *</FormLabel>
                                                    <FormControl>
                                                        <CompanySearchPicker
                                                            value={field.value}
                                                            search={companySearch}
                                                            companies={companies}
                                                            isCreating={createCompany.isPending}
                                                            onSearchChange={setCompanySearch}
                                                            onValueChange={field.onChange}
                                                            onCreateCompany={(name) => createCompany.mutate({ name })}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="salesUserId"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>業務</FormLabel>
                                                    <FormControl>
                                                        <BusinessUserPicker
                                                            users={businessUsers}
                                                            selectedUserId={field.value}
                                                            legacyName={form.watch("salesRep")}
                                                            onSelect={(selectedUser) => {
                                                                field.onChange(selectedUser.id);
                                                                form.setValue("salesRep", selectedUser.name);
                                                                form.setValue("salesDepartment", selectedUser.department || "");
                                                            }}
                                                            onClear={() => {
                                                                field.onChange("");
                                                                form.setValue("salesRep", "");
                                                                form.setValue("salesDepartment", "");
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <p className="text-xs text-muted-foreground">業務部門：{selectedSalesDepartment || "選擇業務帳號後自動帶入"}</p>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="opportunityType"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>商機類型</FormLabel>
                                                    <Select value={field.value} onValueChange={field.onChange}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="選擇商機類型" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="revenue">營收型商機</SelectItem>
                                                            <SelectItem value="presales">協銷</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="estimatedValue"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>商機金額 (NT$)</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.onChange(Number(e.target.value))}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        {watchedOppType === "presales" && (
                                            <FormField
                                                control={form.control}
                                                name="presalesAmount"
                                                render={({ field }: any) => (
                                                    <FormItem>
                                                        <FormLabel>協銷金額 (NT$)</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                {...field}
                                                                onChange={(event: React.ChangeEvent<HTMLInputElement>) => field.onChange(Number(event.target.value))}
                                                            />
                                                        </FormControl>
                                                        <p className="text-xs text-muted-foreground">與預估金額、報價金額及最終成交金額分開保存。</p>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </FormSection>

                                    <FormSection title="產品與核准項目" description="勾選相關產品與核准範圍，作為協銷與後續分析依據。">
                                        <FormField
                                            control={form.control}
                                            name="productNames"
                                            render={({ field }: any) => (
                                                <FormItem className="md:col-span-2">
                                                    <FormLabel>產品名稱</FormLabel>
                                                    <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
                                                        {availableProducts.map((p: string) => (
                                                            <label key={p} className="flex cursor-pointer items-center space-x-2 rounded p-1 text-sm transition-colors hover:bg-muted/50">
                                                                <input
                                                                    type="checkbox"
                                                                    value={p}
                                                                    checked={field.value?.includes(p)}
                                                                    onChange={(e) => {
                                                                        const val = e.target.checked
                                                                            ? [...(field.value || []), p]
                                                                            : field.value?.filter((v: string) => v !== p);
                                                                        field.onChange(val);
                                                                    }}
                                                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                                />
                                                                <span>{p}</span>
                                                            </label>
                                                        ))}
                                                        {availableProducts.length === 0 && (
                                                            <span className="col-span-full text-xs italic text-muted-foreground">請至「系統設定」維護產品清單</span>
                                                        )}
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        {[
                                            ["approvedM365", "M365"],
                                            ["approvedAzure", "Azure"],
                                            ["approvedSecurity", "資安"]
                                        ].map(([name, label]) => (
                                            <FormField
                                                key={name}
                                                control={form.control}
                                                name={name}
                                                render={({ field }: any) => (
                                                    <FormItem className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                                                        <FormControl>
                                                            <input
                                                                type="checkbox"
                                                                checked={field.value}
                                                                onChange={(e) => field.onChange(e.target.checked)}
                                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="mb-0">{label}</FormLabel>
                                                    </FormItem>
                                                )}
                                            />
                                        ))}
                                    </FormSection>

                                    <FormSection title="備註與自訂欄位" description="補充商機背景與組織自訂欄位。" columns={1}>
                                        <FormField
                                            control={form.control}
                                            name="description"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>商機描述</FormLabel>
                                                    <FormControl>
                                                        <textarea
                                                            {...field}
                                                            className="min-h-[100px] w-full rounded-lg border border-input bg-background/50 p-2.5 text-sm transition-colors focus:bg-background"
                                                            placeholder="請輸入更多詳細資訊..."
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        {oppFields.map((f: any) => (
                                            <FormItem key={f.id}>
                                                <FormLabel className="text-sm font-medium">自訂：{f.name} {f.isRequired && <span className="text-destructive">*</span>}</FormLabel>
                                                <FormControl>
                                                    {f.fieldType === "select" ? (
                                                        <Select onValueChange={(val) => setCustomFieldsValues(p => ({ ...p, [f.id]: val }))}>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder={`選擇 ${f.name}`} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {f.options?.map((opt: string) => (
                                                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : f.fieldType === "switch" ? (
                                                        <div className="flex items-center space-x-2 pt-1">
                                                            <input
                                                                type="checkbox"
                                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                                onChange={(e) => setCustomFieldsValues(p => ({ ...p, [f.id]: e.target.checked ? "true" : "false" }))}
                                                            />
                                                            <span className="text-xs text-muted-foreground">啟用 / 開啟</span>
                                                        </div>
                                                    ) : (
                                                        <Input
                                                            type={f.fieldType === "number" ? "number" : "text"}
                                                            placeholder={`請輸入 ${f.name}`}
                                                            onChange={(e) => setCustomFieldsValues(p => ({ ...p, [f.id]: e.target.value }))}
                                                        />
                                                    )}
                                                </FormControl>
                                            </FormItem>
                                        ))}
                                    </FormSection>
                                </div>
                                <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                                    <FormSummaryPanel
                                        items={[
                                            { label: "客戶", value: form.watch("customerName") },
                                            { label: "業務", value: selectedSalesRep },
                                            { label: "業務部門", value: selectedSalesDepartment },
                                            { label: "類型", value: opportunityTypeLabels[watchedOppType] },
                                            { label: "商機金額", value: `NT$ ${watchedEstimatedValue.toLocaleString()}` },
                                            { label: "產品", value: watchedProducts.length ? watchedProducts.join("、") : "" }
                                        ]}
                                    />
                                </div>
                            </div>
                            <StickyFormActions
                                submitLabel="建立商機"
                                submittingLabel="建立中..."
                                isSubmitting={createOpp.isPending}
                                onCancel={() => setIsCreating(false)}
                            />
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
