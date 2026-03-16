import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import { Plus, Briefcase, Calendar, ChevronRight, Building2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const oppSchema = z.object({
    title: z.string().min(1, "商機名稱不可為空"),
    customerName: z.string().min(1, "客戶名稱不可為空"),
    estimatedValue: z.number().min(0, "金額不能為負數"),
    status: z.enum(["new", "qualified", "presales_active", "won", "converted", "lost"])
});

export function OpportunitiesPage() {
    const {
        data,
        isLoading,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = trpc.opportunities.list.useInfiniteQuery(
        { limit: 12 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

    // Flatten the infinite pages into a single array
    const opps = data?.pages.flatMap(page => page.items) || [];
    const [isCreating, setIsCreating] = useState(false);

    const form = useForm<any>({
        resolver: zodResolver(oppSchema) as any,
        defaultValues: { title: "", customerName: "", estimatedValue: 0, status: "new" }
    });

    const createOpp = trpc.opportunities.create.useMutation({
        onSuccess: () => {
            setIsCreating(false);
            refetch();
            form.reset();
        }
    });

    const handleCreate = (values: z.infer<typeof oppSchema>) => {
        createOpp.mutate({
            title: values.title,
            customerName: values.customerName,
            estimatedValue: values.estimatedValue,
            status: values.status
        });
    };

    if (isLoading) {
        return <div className="p-8 text-center">載入中...</div>;
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'new': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
            case 'qualified': return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
            case 'presales_active': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
            case 'won': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
            case 'converted': return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800';
            case 'lost': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            new: "待處理",
            qualified: "已確認",
            presales_active: "協銷中",
            won: "已成交",
            converted: "已轉案",
            lost: "已失敗"
        };
        return labels[status] || status;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">商機管理</h2>
                    <p className="text-muted-foreground mt-1">追蹤業務商機、指派協銷與轉換 SR 狀態</p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md hover:shadow-lg">
                    <Plus className="w-4 h-4 mr-2" />
                    新增商機
                </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {opps?.map((opp) => (
                    <div key={opp.id} className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(opp.status)}`}>
                                {getStatusLabel(opp.status)}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md border">
                                ID: #{opp.id}
                            </span>
                        </div>

                        <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-primary transition-colors line-clamp-1">{opp.title}</h3>

                        <div className="flex items-center text-sm text-muted-foreground mb-4">
                            <Building2 className="w-4 h-4 mr-1.5 opacity-70" />
                            <span className="truncate">{opp.customerName}</span>
                        </div>

                        <div className="space-y-3 py-3 border-t border-border/60">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">預估金額</span>
                                <span className="font-bold text-foreground">NT$ {opp.estimatedValue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center">
                                    <Calendar className="w-3.5 h-3.5 mr-1" />
                                    建立日期
                                </span>
                                <span className="font-medium">{new Date(opp.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>

                        <div className="pt-4 mt-2 flex justify-end">
                            <Link href={`/opportunities/${opp.id}`}>
                                <a className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                                    查看詳情
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </a>
                            </Link>
                        </div>
                    </div>
                ))}

                {(!opps || opps.length === 0) && (
                    <div className="col-span-full p-12 text-center bg-card border border-dashed rounded-xl">
                        <Briefcase className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                        <h3 className="text-lg font-medium">尚無商機</h3>
                        <p className="text-muted-foreground mt-1">點擊上方按鈕建立您的第一筆商機</p>
                    </div>
                )}
            </div>

            {hasNextPage && (
                <div className="flex justify-center mt-6">
                    <Button
                        variant="outline"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                    >
                        {isFetchingNextPage ? "載入中..." : "載入更多"}
                    </Button>
                </div>
            )}

            {/* Create Modal */}
            <Dialog open={isCreating} onOpenChange={setIsCreating}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <Briefcase className="w-5 h-5 text-primary" />
                            <span>新增商機</span>
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>商機名稱 (Title) *</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
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
                                        <FormLabel>客戶名稱 (Customer Name) *</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="estimatedValue"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>預估金額 (Estimated Value)</FormLabel>
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
                            <FormField
                                control={form.control}
                                name="status"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>狀態 (Status)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="new">待處理 (New)</SelectItem>
                                                <SelectItem value="qualified">已確認 (Qualified)</SelectItem>
                                                <SelectItem value="presales_active">協銷中 (Presales Active)</SelectItem>
                                                <SelectItem value="won">已成交 (Won)</SelectItem>
                                                <SelectItem value="converted">已轉案 (Converted)</SelectItem>
                                                <SelectItem value="lost">已失敗 (Lost)</SelectItem>
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
                                <Button type="submit" disabled={createOpp.isPending}>
                                    {createOpp.isPending ? "建立中..." : "建立商機"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
