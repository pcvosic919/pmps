import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import { FileText, AlertTriangle, ChevronRight, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BusinessUserPicker } from "../components/BusinessUserPicker";
import { UserSearchPicker } from "../components/UserSearchPicker";
import { CompanySearchPicker } from "../components/CompanySearchPicker";
import { useDebounce } from "../lib/useDebounce";
import { FormSection, FormSummaryPanel, StickyFormActions } from "../components/FormLayout";
import { useCurrentUser } from "../lib/useCurrentUser";

const optionalDate = z.preprocess((value) => value === "" ? undefined : value, z.coerce.date().optional());

const srSchema = z.object({
    title: z.string().min(1, "專案名稱不可為空"),
    customerName: z.string().min(1, "公司名稱不可為空"),
    salesUserId: z.string().optional(),
    salesDepartment: z.string().optional(),
    salesRep: z.string().optional(),
    externalServiceType: z.string().optional(),
    plannedStartDate: optionalDate,
    plannedEndDate: optionalDate,
    reviewDate: optionalDate,
    warrantyExpiresAt: optionalDate,
    billingAllocation: z.string().optional(),
    recognitionMonth: z.string().optional(),
    srType: z.enum(["project", "maintenance", "other_activity"]).default("project"),
    contractAmount: z.number().min(0, "合約金額不能為負").optional(),
    totalPoints: z.number().min(0).optional(),
    pointValue: z.number().min(0).optional(),
    pmId: z.string().optional(),
    joinPmAsMember: z.boolean().default(true)
});

const serviceTypeOptions = [
    "專案服務",
    "維運",
    "其他活動",
    "教育訓練",
    "內部專案",
    "活動支援",
    "遠端技術服務",
    "遠端問題解決",
    "到場服務",
    "教育訓練-其他",
    "技術諮詢",
    "託管服務",
    "MCI Activity"
] as const;

const isPresetServiceType = (value?: string) => serviceTypeOptions.some((option) => option === value);
const srTypeForServiceType = (value?: string): "project" | "maintenance" | "other_activity" => {
    if (value === "維運") return "maintenance";
    if (["其他活動", "教育訓練", "內部專案", "活動支援"].includes(value || "")) return "other_activity";
    return "project";
};

export function ServiceRequestsPage() {
    const { user, hasRole } = useCurrentUser();
    const canDelete = user?.email?.trim().toLowerCase() === "demo@demo.com";
    const { data: srs, isLoading, refetch } = trpc.projects.srList.useQuery();
    const { data: users } = trpc.users.list.useQuery({ limit: 500 });

    const [isCreating, setIsCreating] = useState(false);
    const [useCustomServiceType, setUseCustomServiceType] = useState(false);
    const [companySearch, setCompanySearch] = useState("");
    const debouncedCompanySearch = useDebounce(companySearch, 300);
    const utils = trpc.useUtils();
    const { data: companiesData } = trpc.companies.list.useQuery({ search: debouncedCompanySearch, limit: 20 });
    const companies = companiesData?.items || [];

    const createSR = trpc.projects.createSR.useMutation({
        onSuccess: (result) => {
            setIsCreating(false);
            setUseCustomServiceType(false);
            setCompanySearch("");
            refetch();
            form.reset();
            window.location.href = `/service-requests/${result.id}`;
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

    const deleteSr = trpc.projects.delete.useMutation({ 
        onSuccess: () => refetch(),
        onError: (err) => alert(err.message || "刪除失敗")
    });

    const { data: settings } = trpc.system.getSettings.useQuery();

    const form = useForm<any>({
        resolver: zodResolver(srSchema) as any,
        defaultValues: { 
            title: "", customerName: "", srType: "project", contractAmount: 0, 
            salesUserId: "", salesDepartment: "", salesRep: "",
            externalServiceType: "專案服務", plannedStartDate: "", plannedEndDate: "", reviewDate: "", warrantyExpiresAt: "",
            billingAllocation: "", recognitionMonth: "",
            totalPoints: 0, pointValue: 500, 
            pmId: "", joinPmAsMember: true 
        }
    });

    // Update default pointValue when settings are loaded
    useEffect(() => {
        if (settings?.pcMaintenancePointValue) {
            form.setValue("pointValue", settings.pcMaintenancePointValue);
        }
    }, [settings?.pcMaintenancePointValue]);

    const handleCreate = (values: z.infer<typeof srSchema>) => {
        let finalContractAmount = values.contractAmount || 0;
            if (values.srType === "maintenance") {
                finalContractAmount = (values.totalPoints || 0) * (values.pointValue || 0);
            }

        createSR.mutate({
            ...values,
            contractAmount: finalContractAmount,
            opportunityId: undefined
        });
    };

    if (isLoading) {
        return <div className="p-8 text-center">載入中...</div>;
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'new': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
            case 'in_progress': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
            case 'completed': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
            case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            new: "待指派",
            in_progress: "執行中",
            completed: "已結案",
            cancelled: "已取消"
        };
        return labels[status] || status;
    };

    const srTypeLabels: Record<string, string> = {
        project: "專案",
        maintenance: "維運",
        other_activity: "其他活動"
    };
    const watchedSrType = form.watch("srType");
    const watchedContractAmount = Number(form.watch("contractAmount") || 0);
    const watchedTotalPoints = Number(form.watch("totalPoints") || 0);
    const watchedPointValue = Number(form.watch("pointValue") || 0);
    const watchedSalesRep = form.watch("salesRep");
    const watchedSalesDepartment = form.watch("salesDepartment");
    const watchedPmId = form.watch("pmId");
    const watchedPm = users?.items?.find((item: any) => item.id === watchedPmId);
    const previewAmount = watchedSrType === "maintenance" ? watchedTotalPoints * watchedPointValue : watchedContractAmount;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">服務請求 (SR)</h2>
                    <p className="text-muted-foreground mt-1">管理各專案的服務執行狀況與毛利預期</p>
                </div>
                {(hasRole("admin") || hasRole("manager")) && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md hover:shadow-lg">
                        <Plus className="w-4 h-4 mr-2" />
                        建立 SR
                    </button>
                )}
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                <th className="px-6 py-4">狀態 / 類型</th>
                                <th className="px-6 py-4">ID / SR 名稱</th>
                                <th className="px-6 py-4">合約金額 (NT$)</th>
                                <th className="px-6 py-4">預估毛利</th>
                                <th className="px-6 py-4">建立日期</th>
                                <th className="px-6 py-4 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {srs?.map((sr: any) => (
                                <tr key={sr.id} className="group hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1.5">
                                            <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusColor(sr.status)}`}>
                                                {getStatusLabel(sr.status)}
                                            </span>
                                            <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-bold border ${sr.srType === 'maintenance' ? 'bg-purple-100 text-purple-700 border-purple-200' : sr.srType === 'other_activity' ? 'bg-cyan-100 text-cyan-700 border-cyan-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                                {sr.srType === 'maintenance' ? '維運' : sr.srType === 'other_activity' ? '其他活動' : '專案'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className="text-[10px] font-mono text-muted-foreground">SR-#{sr.id}</span>
                                                {sr.marginWarning && <span title="毛利預警"><AlertTriangle className="w-3.5 h-3.5 text-destructive animate-pulse" /></span>}
                                            </div>
                                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1" title={sr.title}>
                                                {sr.title}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {!hasRole("tech") ? (
                                            <span className="text-sm font-mono font-bold text-foreground">
                                                {sr.contractAmount?.toLocaleString() || 0}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">權限受限</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-sm font-bold ${sr.marginWarning ? 'text-destructive underline decoration-wavy' : 'text-green-600'}`}>
                                            {sr.marginEstimate}%
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-muted-foreground">
                                        {new Date(sr.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <Link href={`/service-requests/${sr.id}`}>
                                                <a className="inline-flex items-center px-3 py-1.5 text-xs font-bold bg-primary/5 text-primary border border-primary/10 rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm">
                                                    管理 WBS
                                                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                                                </a>
                                            </Link>
                                            {canDelete && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm("確定要刪除此專案與 SR 嗎？此操作無法復原。")) {
                                                            deleteSr.mutate({ id: sr.id });
                                                        }
                                                    }}
                                                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                                    title="刪除專案"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {(!srs || srs.length === 0) && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground italic">
                                        <div className="flex flex-col items-center justify-center opacity-50">
                                            <FileText className="w-10 h-10 mb-2" />
                                            <p>尚無服務請求資料</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <Dialog
                open={isCreating}
                onOpenChange={(open) => {
                    setIsCreating(open);
                    if (!open) {
                        setUseCustomServiceType(false);
                        setCompanySearch("");
                    }
                }}
            >
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-5xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <FileText className="w-5 h-5 text-primary" />
                            <span>新增服務請求 (SR)</span>
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                                <div className="space-y-4">
                                    <FormSection title="基本資料" description="建立專案、維運或其他活動的主要識別資料。">
                                        <FormField
                                            control={form.control}
                                            name="title"
                                            render={({ field }: any) => (
                                                <FormItem className="md:col-span-2">
                                                    <FormLabel>{watchedSrType === "other_activity" ? "活動名稱" : "專案名稱"} *</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder={watchedSrType === "other_activity" ? "例：業務服務內容討論" : "例：2026年 系統導入案"} {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="customerName"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>公司名稱 *</FormLabel>
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
                                            name="externalServiceType"
                                            render={({ field }: any) => {
                                                const selectedValue = useCustomServiceType || (field.value && !isPresetServiceType(field.value)) ? "custom" : field.value || "";
                                                const showCustomInput = useCustomServiceType || selectedValue === "custom";

                                                return (
                                                    <FormItem>
                                                        <FormLabel>專案/服務類型 *</FormLabel>
                                                        <Select
                                                            value={selectedValue}
                                                            onValueChange={(value) => {
                                                                if (value === "custom") {
                                                                    setUseCustomServiceType(true);
                                                                    field.onChange("");
                                                                    form.setValue("srType", "project");
                                                                    return;
                                                                }
                                                                setUseCustomServiceType(false);
                                                                field.onChange(value);
                                                                form.setValue("srType", srTypeForServiceType(value));
                                                            }}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="請選擇服務類型" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {serviceTypeOptions.map((option) => (
                                                                    <SelectItem key={option} value={option}>
                                                                        {option}
                                                                    </SelectItem>
                                                                ))}
                                                                <SelectItem value="custom">自訂服務類型</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        {showCustomInput && (
                                                            <FormControl>
                                                                <Input className="mt-2" placeholder="輸入自訂服務類型" {...field} />
                                                            </FormControl>
                                                        )}
                                                        <FormMessage />
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                    </FormSection>

                                    <FormSection title="業務與排程" description="業務部門、起訖日期與認列資訊會供報表統計使用。">
                                        <FormField
                                            control={form.control}
                                            name="salesUserId"
                                            render={({ field }: any) => (
                                                <FormItem className="md:col-span-2">
                                                    <FormLabel>業務</FormLabel>
                                                    <FormControl>
                                                        <BusinessUserPicker
                                                            users={users?.items || []}
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
                                                    <p className="text-xs text-muted-foreground">業務部門：{watchedSalesDepartment || "選擇業務帳號後自動帶入"}</p>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="plannedStartDate"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>預計開始</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="plannedEndDate"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>預計結束</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="reviewDate"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>審核日期</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="warrantyExpiresAt"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>保固到期</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="recognitionMonth"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>認列月份</FormLabel>
                                                    <FormControl>
                                                        <Input type="month" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="billingAllocation"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>{watchedSrType === "other_activity" ? "服務內容摘要" : "計費分攤"}</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder={watchedSrType === "other_activity" ? "例：已與業務確認的服務內容" : "例：部門分攤 / 客戶合約"} {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </FormSection>

                                    <FormSection title="金額與指派" description={watchedSrType === "other_activity" ? "其他活動可直接成立，不強制完整 WBS。" : "設定合約金額或維護點數，並指定主要 PM。"}>
                                        {watchedSrType !== "maintenance" ? (
                                            <FormField
                                                control={form.control}
                                                name="contractAmount"
                                                render={({ field }: any) => (
                                                    <FormItem>
                                                        <FormLabel>{watchedSrType === "other_activity" ? "活動金額 (NT$)" : "合約金額 (NT$)"} *</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                {...field}
                                                                onChange={(e) => field.onChange(Number(e.target.value))}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        ) : (
                                            <>
                                                <FormField
                                                    control={form.control}
                                                    name="totalPoints"
                                                    render={({ field }: any) => (
                                                        <FormItem>
                                                            <FormLabel>總點數 *</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="pointValue"
                                                    render={({ field }: any) => (
                                                        <FormItem>
                                                            <FormLabel>點數單價 (NT$) *</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </>
                                        )}
                                        <FormField
                                            control={form.control}
                                            name="pmId"
                                            render={({ field }: any) => (
                                                <FormItem>
                                                    <FormLabel>指派 PM</FormLabel>
                                                    <FormControl>
                                                        <UserSearchPicker
                                                            users={[...(users?.items || [])].sort((left: any, right: any) => {
                                                                const leftIsPm = left.role === "pm" || left.roles?.includes("pm");
                                                                const rightIsPm = right.role === "pm" || right.roles?.includes("pm");
                                                                return Number(rightIsPm) - Number(leftIsPm) || left.name.localeCompare(right.name, "zh-Hant");
                                                            })}
                                                            selectedUserId={field.value}
                                                            placeholder="可選，搜尋 PM 或輸入 Email 前綴..."
                                                            onSelect={(selectedUser) => field.onChange(selectedUser.id)}
                                                            onClear={() => field.onChange("")}
                                                            filterUser={(pickerUser) => pickerUser.isActive !== false}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="joinPmAsMember"
                                            render={({ field }: any) => (
                                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm md:col-span-2">
                                                    <FormControl>
                                                        <input
                                                            type="checkbox"
                                                            checked={field.value}
                                                            onChange={(e) => field.onChange(e.target.checked)}
                                                            className="mt-1 h-4 w-4 cursor-pointer rounded border-gray-300 text-primary"
                                                        />
                                                    </FormControl>
                                                    <div className="space-y-1 leading-none">
                                                        <FormLabel>將 PM 加入專案團隊成員</FormLabel>
                                                        <p className="text-sm text-muted-foreground">有指派 PM 時才會加入；未指派 PM 仍可建立專案</p>
                                                    </div>
                                                </FormItem>
                                            )}
                                        />
                                    </FormSection>
                                </div>
                                <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                                    <FormSummaryPanel
                                        items={[
                                            { label: "客戶", value: form.watch("customerName") },
                                            { label: "類型", value: srTypeLabels[watchedSrType] },
                                            { label: "業務", value: watchedSalesRep },
                                            { label: "業務部門", value: watchedSalesDepartment },
                                            { label: "PM", value: watchedPm?.name },
                                            { label: "金額", value: `NT$ ${previewAmount.toLocaleString()}` },
                                            { label: "起訖", value: [form.watch("plannedStartDate"), form.watch("plannedEndDate")].filter(Boolean).join(" ~ ") }
                                        ]}
                                    />
                                </div>
                            </div>
                            <StickyFormActions
                                submitLabel="建立 SR"
                                submittingLabel="建立中..."
                                isSubmitting={createSR.isPending}
                                onCancel={() => setIsCreating(false)}
                            />
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
