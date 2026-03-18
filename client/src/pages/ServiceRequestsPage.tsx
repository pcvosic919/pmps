import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import { FileText, AlertTriangle, ChevronRight, BarChart3, Plus } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const srSchema = z.object({
    title: z.string().min(1, "SR 名稱不可為空"),
    contractAmount: z.number().min(0, "合約金額不能為負"),
    pmId: z.string().min(1, "請指派 PM"),
    opportunityId: z.string().optional()
});

export function ServiceRequestsPage() {
    const { data: srs, isLoading, refetch } = trpc.projects.srList.useQuery();
    const { data: opps } = trpc.opportunities.list.useInfiniteQuery({ limit: 100 });
    const { data: users } = trpc.users.list.useQuery({ limit: 100 });

    const [isCreating, setIsCreating] = useState(false);

    const createSR = trpc.projects.createSR.useMutation({
        onSuccess: (result) => {
            setIsCreating(false);
            refetch();
            form.reset();
            window.location.href = `/service-requests/${result.id}`;
        }
    });

    const form = useForm<any>({
        resolver: zodResolver(srSchema) as any,
        defaultValues: { title: "", contractAmount: 0, pmId: "", opportunityId: "" }
    });

    const handleCreate = (values: z.infer<typeof srSchema>) => {
        createSR.mutate({
            ...values,
            opportunityId: values.opportunityId === "none" || !values.opportunityId ? undefined : values.opportunityId
        });
    };

    const oppItems = opps?.pages.flatMap(p => p.items) || [];

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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">服務請求 (SR)</h2>
                    <p className="text-muted-foreground mt-1">管理各專案的服務執行狀況與毛利預期</p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md hover:shadow-lg">
                    <Plus className="w-4 h-4 mr-2" />
                    建立 SR
                </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {srs?.map((sr: any) => (
                    <div key={sr.id} className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-md transition-all relative overflow-hidden">
                        {sr.marginWarning && (
                            <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-destructive/10 -rotate-45 translate-x-8 -translate-y-8 absolute group-hover:bg-destructive/20 transition-colors" />
                                <AlertTriangle className="absolute top-2 right-2 w-4 h-4 text-destructive z-10" />
                            </div>
                        )}

                        <div className="flex justify-between items-start mb-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(sr.status)}`}>
                                {getStatusLabel(sr.status)}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md border text-right">
                                SR-#{sr.id}
                            </span>
                        </div>

                        <h3 className="text-lg font-bold text-foreground mb-3 group-hover:text-primary transition-colors line-clamp-2" title={sr.title}>
                            {sr.title}
                        </h3>

                        <div className="space-y-3 py-3 border-t border-border/60">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">合約金額</span>
                                <span className="font-bold text-foreground">NT$ {sr.contractAmount?.toLocaleString() || 0}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center">
                                    <BarChart3 className="w-3.5 h-3.5 mr-1" />
                                    預估毛利
                                </span>
                                <span className={`font-semibold ${sr.marginWarning ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                                    {sr.marginEstimate}%
                                </span>
                            </div>
                        </div>

                        <div className="pt-4 mt-2 flex justify-between items-center border-t border-border/60">
                            <span className="text-xs text-muted-foreground flex items-center">
                                建立於: {new Date(sr.createdAt).toLocaleDateString()}
                            </span>
                            <Link href={`/service-requests/${sr.id}`}>
                                <a className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                                    管理 WBS
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </a>
                            </Link>
                        </div>
                    </div>
                ))}

                {(!srs || srs.length === 0) && (
                    <div className="col-span-full p-12 text-center bg-card border border-dashed rounded-xl">
                        <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                        <h3 className="text-lg font-medium">尚無服務請求 (SR)</h3>
                        <p className="text-muted-foreground mt-1">從商機介面轉換已成交的商機後顯示於此</p>
                    </div>
                )}
            </div>
            <Dialog open={isCreating} onOpenChange={setIsCreating}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <FileText className="w-5 h-5 text-primary" />
                            <span>新增服務請求 (SR)</span>
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>SR 名稱 *</FormLabel>
                                        <FormControl>
                                            <Input placeholder="例：2026年 系統導入案" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="contractAmount"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>合約金額 (NT$) *</FormLabel>
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

                            <FormField
                                control={form.control}
                                name="pmId"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>指派 PM *</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="請選擇 PM" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {users?.items?.filter((u: any) => u.role === "pm" || u.roles?.includes("pm")).map((u: any) => (
                                                    <SelectItem key={u.id} value={u.id}>
                                                        {u.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="opportunityId"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>關聯商機 (選填)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="不綁定商機" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="none">不綁定商機</SelectItem>
                                                {oppItems.map((opp: any) => (
                                                    <SelectItem key={opp.id} value={opp.id}>
                                                        {opp.title} ({opp.customerName})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="mt-6 flex justify-end space-x-3">
                                <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>
                                    取消
                                </Button>
                                <Button type="submit" disabled={createSR.isPending}>
                                    {createSR.isPending ? "建立中..." : "建立 SR"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
