import { useState } from "react";
import { trpc } from "../lib/trpc";
import { FileText, Search, Download } from "lucide-react";

export function SettlementsPage() {
    const { data: settlements, isLoading } = trpc.analytics.getSettlements.useQuery();
    const [searchTerm, setSearchTerm] = useState("");

    const filteredData = settlements?.filter(s =>
        s.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;

    const totalRevenue = settlements?.reduce((acc, s) => acc + s.contractAmount, 0) || 0;
    const totalCost = settlements?.reduce((acc, s) => acc + s.totalCost, 0) || 0;
    const totalMargin = totalRevenue - totalCost;
    const overallMarginPercent = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending_wbs': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending_wbs': return '待報價 / 待開工';
            case 'in_progress': return '進行中';
            case 'completed': return '已完成 (結案)';
            default: return status;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">月度結算 (Settlements)</h2>
                    <p className="text-muted-foreground mt-1">匯整專案與售前工時，計算應請款或內部成本，並檢視專案毛利 (Margin)</p>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="bg-primary/5 p-4 rounded-lg border border-primary/10 text-right">
                        <div className="text-sm font-medium text-muted-foreground mb-1">整體估計毛利 (Margin)</div>
                        <div className={`text-2xl font-bold ${overallMarginPercent >= 30 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {overallMarginPercent}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            ${totalMargin.toLocaleString()} / ${totalRevenue.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-card border rounded-xl shadow-sm p-4 flex justify-between items-center">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜尋專案名稱..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-input bg-background"
                    />
                </div>
                <button className="bg-outline border border-input text-foreground hover:bg-accent px-4 py-2 rounded-lg flex items-center text-sm font-medium transition-colors">
                    <Download className="w-4 h-4 mr-2" />
                    匯出結算報表
                </button>
            </div>

            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-6 py-3 font-medium">SR 單號 / 名稱</th>
                                <th className="px-6 py-3 font-medium">PM ID</th>
                                <th className="px-6 py-3 font-medium text-right">合約金額 (Revenue)</th>
                                <th className="px-6 py-3 font-medium text-right">累積成本 (Cost)</th>
                                <th className="px-6 py-3 font-medium text-right">毛利 (Margin)</th>
                                <th className="px-6 py-3 font-medium text-center">狀態</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredData?.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">找不到符合的結算資料</td>
                                </tr>
                            ) : (
                                filteredData?.map((sr) => (
                                    <tr key={sr.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-2">
                                                <FileText className="w-4 h-4 text-muted-foreground" />
                                                <span className="font-semibold text-foreground">SR-#{sr.id}</span>
                                            </div>
                                            <div className="text-muted-foreground mt-1 truncate max-w-xs">{sr.title}</div>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground">#{sr.pmId || "-"}</td>
                                        <td className="px-6 py-4 text-right font-medium">${sr.contractAmount?.toLocaleString() || "0"}</td>
                                        <td className="px-6 py-4 text-right text-rose-600 font-medium">${sr.totalCost?.toLocaleString() || "0"}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className={`font-bold ${sr.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                ${sr.margin?.toLocaleString() || "0"}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5">{sr.marginPercent}%</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getStatusColor(sr.status)}`}>
                                                {getStatusLabel(sr.status)}
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
    );
}
