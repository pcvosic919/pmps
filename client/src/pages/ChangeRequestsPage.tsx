import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Plus, GitMerge, Search, Filter, Check, X } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const crSchema = z.object({
    srId: z.string().min(1, "請選擇關聯 SR"),
    reason: z.string().min(1, "理由不可為空"),
    hoursAdjustment: z.number().default(0),
    amountAdjustment: z.number().default(0),
    wbsItemId: z.string().optional()
});


export function ChangeRequestsPage() {
    const { data, isLoading, refetch } = trpc.projects.crList.useQuery();
    const { data: srList } = trpc.projects.srList.useQuery();
    const crs = (data || []) as any[];

    // Decode token for role checking
    const token = localStorage.getItem("pmp_auth_token");
    const user = token ? JSON.parse(atob(token.split('.')[1])) : null;

    const canReview = (crStatus: string) => {
        const role = user?.role;
        const roles = user?.roles || [];
        const hasRole = (r: string) => role === r || roles.includes(r);
        
        if (hasRole("admin")) return true;
        if (crStatus === "pending_business" && hasRole("business")) return true;
        if (crStatus === "pending_manager" && hasRole("manager")) return true;
        
        return false;
    };

    const [isCreating, setIsCreating] = useState(false);

    const createCr = trpc.projects.createCr.useMutation({
        onSuccess: () => {
            setIsCreating(false);
            refetch();
            form.reset();
        }
    });

    const reviewCr = trpc.projects.reviewCr.useMutation({
        onSuccess: () => refetch()
    });

    const form = useForm<any>({
        resolver: zodResolver(crSchema) as any,
        defaultValues: { srId: "", reason: "", hoursAdjustment: 0, amountAdjustment: 0, wbsItemId: "" }
    });

    const getWbsItemTitle = (srId: string, itemId?: string) => {
        if (!itemId) return null;
        const sr = srList?.find((s: any) => s.id === srId);
        if (!sr) return null;
        for (const v of (sr.wbsVersions || [])) {
            const item = v.items?.find((i: any) => (i._id?.toString() === itemId || i.id === itemId));
            if (item) return item.title;
        }
        return null;
    };

    const selectedSrId = form.watch("srId");
    const selectedSr = srList?.find((sr: any) => sr.id === selectedSrId);
    const approvedVersions = selectedSr?.wbsVersions?.filter((v: any) => v.status === "approved") || [];
    const latestApproved = approvedVersions.sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
    const wbsItems = latestApproved?.items || [];

    const handleCreate = (values: z.infer<typeof crSchema>) => {
        createCr.mutate(values);
    };

    const handleReview = (srId: string, crId: string, action: "approved" | "rejected") => {
        if (confirm(`確定要將此 CR 設定為 ${action === 'approved' ? '核准' : '退回'} 嗎？`)) {
            reviewCr.mutate({ srId, crId, action });
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending_manager':
            case 'pending_business': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'approved': return 'bg-green-100 text-green-800 border-green-200';
            case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending_manager': return '待主管審核';
            case 'pending_business': return '待業務審核';
            case 'approved': return '已核准';
            case 'rejected': return '已退回';
            default: return status;
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">載入中...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">變更請求 (CR) 管理</h2>
                    <p className="text-muted-foreground mt-1">追蹤專案範圍調整與額外工時審核狀況</p>
                </div>
                <button 
                    onClick={() => setIsCreating(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md hover:shadow-lg">
                    <Plus className="w-4 h-4 mr-2" />
                    發起 CR
                </button>
            </div>

            <div className="flex gap-4">
                {/* Filters Panel left */}
                <div className="hidden md:block w-64 space-y-4">
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <div className="flex items-center mb-4">
                            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                            <h3 className="font-semibold">篩選狀態</h3>
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center space-x-2 text-sm">
                                <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" defaultChecked />
                                <span>待主管審核 (Pending Manager)</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm">
                                <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" defaultChecked />
                                <span>待業務審核 (Pending Business)</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm">
                                <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" defaultChecked />
                                <span>已核准 (Approved)</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm">
                                <input type="checkbox" className="rounded border-input text-primary focus:ring-primary" />
                                <span>已退回 (Rejected)</span>
                            </label>
                        </div>

                        <div className="flex items-center mb-4 mt-6">
                            <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                            <h3 className="font-semibold">關鍵字搜尋</h3>
                        </div>
                        <input type="text" placeholder="搜尋標題..." className="w-full text-sm rounded-md border border-input bg-transparent px-3 py-2 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" />
                    </div>
                </div>

                {/* Main List */}
                <div className="flex-1">
                    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                        <th className="px-6 py-3 font-medium">CR 標題 / 變更原因</th>
                                        <th className="px-6 py-3 font-medium">關聯 SR</th>
                                        <th className="px-6 py-3 font-medium">額外工時</th>
                                        <th className="px-6 py-3 font-medium">額外金額</th>
                                        <th className="px-6 py-3 font-medium">發起人 ID</th>
                                        <th className="px-6 py-3 font-medium">狀態</th>
                                        <th className="px-6 py-3 font-medium text-center">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {crs.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">目前沒有任何變更請求 (CR)</td>
                                        </tr>
                                    ) : (
                                        crs.map((cr) => (
                                            <tr key={cr.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center space-x-2">
                                                        <GitMerge className="w-4 h-4 text-muted-foreground opacity-70" />
                                                        <span className="font-medium text-foreground">
                                                            {cr.reason}
                                                        </span>
                                                    </div>
                                                    <div className="text-muted-foreground text-xs mt-1 hidden sm:block">
                                                        發起於 {new Date(cr.createdAt).toISOString().split('T')[0]}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-medium">SR-#{cr.srId.slice(-6)}</div>
                                                    <div className="text-muted-foreground text-xs mt-0.5 line-clamp-1 truncate max-w-[150px]">{cr.srTitle}</div>
                                                    {cr.wbsItemId && (
                                                        <div className="mt-1">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 text-xs font-medium">
                                                                📌 {getWbsItemTitle(cr.srId, cr.wbsItemId) || "連結 WBS Item"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 font-semibold">
                                                    {cr.hoursAdjustment > 0 ? `+${cr.hoursAdjustment} hr` : cr.hoursAdjustment < 0 ? `${cr.hoursAdjustment} hr` : '-'}
                                                </td>
                                                <td className="px-6 py-4 font-semibold text-emerald-600">
                                                    {cr.amountAdjustment > 0 ? `+$${cr.amountAdjustment.toLocaleString()}` : cr.amountAdjustment < 0 ? `-$${Math.abs(cr.amountAdjustment).toLocaleString()}` : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground">
                                                    #{cr.requesterId}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(cr.status)}`}>
                                                        {getStatusLabel(cr.status)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {canReview(cr.status) && (
                                                        <div className="flex items-center justify-center space-x-2">
                                                            <button
                                                                onClick={() => handleReview(cr.srId, cr.id, "approved")}
                                                                className="p-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-md transition-colors border border-green-200"
                                                                title="核准"
                                                            >
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleReview(cr.srId, cr.id, "rejected")}
                                                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md transition-colors border border-red-200"
                                                                title="退回"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            <Dialog open={isCreating} onOpenChange={setIsCreating}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <GitMerge className="w-5 h-5 text-primary" />
                            <span>發起變更請求 (CR)</span>
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="srId"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>關聯服務請求 (SR) *</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="請選擇 SR" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {srList?.map((sr: any) => (
                                                    <SelectItem key={sr.id} value={sr.id}>
                                                        {sr.title} (#{sr.id.slice(-6)})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {wbsItems.length > 0 && (
                                <FormField
                                    control={form.control}
                                    name="wbsItemId"
                                    render={({ field }: any) => (
                                        <FormItem>
                                            <FormLabel>調整 工作項目 (WBS Item)</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="選擇針對的 WBS (選填)" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {wbsItems.map((item: any) => (
                                                        <SelectItem key={item._id?.toString() || item.id} value={item._id?.toString() || item.id}>
                                                            {item.title} ({item.estimatedHours}h)
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <FormField
                                control={form.control}
                                name="reason"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>變更原因 / 理由 *</FormLabel>
                                        <FormControl>
                                            <Input placeholder="請簡述變更事項與原因" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="hoursAdjustment"
                                    render={({ field }: any) => (
                                        <FormItem>
                                            <FormLabel>調整工時 (小時)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    placeholder="例: 10 或 -5"
                                                    {...field}
                                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="amountAdjustment"
                                    render={({ field }: any) => (
                                        <FormItem>
                                            <FormLabel>調整金額 (NT$)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    placeholder="例: 5000 或 -2000"
                                                    {...field}
                                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="mt-6 flex justify-end space-x-3">
                                <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>
                                    取消
                                </Button>
                                <Button type="submit" disabled={createCr.isPending}>
                                    {createCr.isPending ? "送出中..." : "建立 CR"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
