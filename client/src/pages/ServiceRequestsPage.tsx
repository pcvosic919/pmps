import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import { FileText, AlertTriangle, ChevronRight, BarChart3 } from "lucide-react";

export function ServiceRequestsPage() {
    const { data: srs, isLoading } = trpc.projects.srList.useQuery();

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
        </div>
    );
}
