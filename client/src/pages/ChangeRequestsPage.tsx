import { trpc } from "../lib/trpc";
import { Plus, GitMerge, Search, Filter } from "lucide-react";


export function ChangeRequestsPage() {
    const { data, isLoading } = trpc.projects.crList.useQuery();
    const crs = (data || []) as any[];

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
                <button className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md hover:shadow-lg">
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
                                                    <div className="font-medium">SR-#{cr.srId}</div>
                                                    <div className="text-muted-foreground text-xs mt-0.5 line-clamp-1 truncate max-w-[150px]">{cr.srTitle}</div>
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
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
