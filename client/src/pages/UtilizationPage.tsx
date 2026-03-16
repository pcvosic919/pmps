import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Search, Download } from "lucide-react";

export function UtilizationPage() {
    const { data, isLoading } = trpc.analytics.getUtilization.useQuery();
    const utilizationData = (data || []) as any[];
    const [searchTerm, setSearchTerm] = useState("");

    const filteredData = utilizationData?.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.department && u.department.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const getUtilizationColor = (rate: number) => {
        if (rate >= 100) return "text-red-700 bg-red-100 border-red-200";
        if (rate >= 80) return "text-emerald-700 bg-emerald-100 border-emerald-200";
        if (rate >= 50) return "text-amber-700 bg-amber-100 border-amber-200";
        return "text-gray-700 bg-gray-100 border-gray-200";
    };

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;

    // Averages
    const avgUtilization = utilizationData && utilizationData.length > 0
        ? Math.round(utilizationData.reduce((acc, u) => acc + u.utilizationRate, 0) / utilizationData.length)
        : 0;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">稼動率看板 (Utilization)</h2>
                    <p className="text-muted-foreground mt-1">追蹤本月份人員的可計費時數與整體負載率 (基準為 160 小時/月)</p>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="text-right">
                        <div className="text-sm font-medium text-muted-foreground">本月平均稼動率</div>
                        <div className={`text-2xl font-bold ${avgUtilization >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {avgUtilization}%
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-card border rounded-xl shadow-sm p-4 flex justify-between items-center">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜尋人員姓名或部門..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-input bg-background"
                    />
                </div>
                <button className="bg-outline border border-input text-foreground hover:bg-accent px-4 py-2 rounded-lg flex items-center text-sm font-medium transition-colors">
                    <Download className="w-4 h-4 mr-2" />
                    匯出報表
                </button>
            </div>

            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-6 py-3 font-medium">人員</th>
                                <th className="px-6 py-3 font-medium">部門</th>
                                <th className="px-6 py-3 font-medium text-right">角色</th>
                                <th className="px-6 py-3 font-medium text-right">專案工時</th>
                                <th className="px-6 py-3 font-medium text-right">協銷/售前工時</th>
                                <th className="px-6 py-3 font-medium text-right font-bold text-foreground">總計</th>
                                <th className="px-6 py-3 font-medium text-center">稼動率</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredData?.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">找不到符合的人員</td>
                                </tr>
                            ) : (
                                filteredData?.map((user) => (
                                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4 font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                                                    {user.name.charAt(0)}
                                                </div>
                                                {user.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground">{user.department || "-"}</td>
                                        <td className="px-6 py-4 text-right uppercase text-xs font-semibold">{user.role}</td>
                                        <td className="px-6 py-4 text-right">{user.projectHours} hr</td>
                                        <td className="px-6 py-4 text-right">{user.presalesHours} hr</td>
                                        <td className="px-6 py-4 text-right font-bold text-foreground">{user.totalHours} hr</td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${user.utilizationRate >= 100 ? 'bg-red-500' : user.utilizationRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                        style={{ width: `${Math.min(user.utilizationRate, 100)}%` }}
                                                    />
                                                </div>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${getUtilizationColor(user.utilizationRate)}`}>
                                                    {user.utilizationRate}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
