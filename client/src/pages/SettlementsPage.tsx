import { useState } from "react";
import { trpc } from "../lib/trpc";
import { FileText, Search, Download, Lock, CheckCircle, CalendarDays } from "lucide-react";

export function SettlementsPage() {
    const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));
    const [activeTab, setActiveTab] = useState<"project" | "presales">("project");
    const [searchTerm, setSearchTerm] = useState("");

    const { data: settlements, isLoading, refetch } = trpc.analytics.getSettlements.useQuery({ month: currentMonth });

    const lockSettlement = trpc.analytics.lockSettlement.useMutation({
        onSuccess: () => refetch()
    });

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;

    const projects = settlements?.projects || [];
    const presales = settlements?.presales || [];
    const isLocked = activeTab === "project" ? settlements?.isProjectLocked : settlements?.isPresalesLocked;

    const filteredProjects = projects.filter((s: any) =>
        s.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredPresales = presales.filter((s: any) =>
        (s.title.toLowerCase().includes(searchTerm.toLowerCase()) || s.customerName?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const currentData = activeTab === "project" ? filteredProjects : filteredPresales;

    // Totals for projects
    const totalRevenue = projects.reduce((acc: number, s: any) => acc + (s.contractAmount || 0), 0);
    const totalCost = projects.reduce((acc: number, s: any) => acc + (s.totalCost || 0), 0);
    const totalMargin = totalRevenue - totalCost;
    const overallMarginPercent = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending_wbs': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'won': return 'bg-green-100 text-green-800 border-green-200';
            case 'lost': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending_wbs': return '待報價 / 待開工';
            case 'in_progress': return '進行中';
            case 'completed': return '已完成 (結案)';
            case 'won': return '已贏得';
            case 'lost': return '已落失';
            default: return status;
        }
    };

    const handleExport = () => {
        if (!currentData.length) return;
        let csvContent = "\ufeff"; // BOM for excel
        if (activeTab === "project") {
            csvContent += "SR單號,名稱,金額,成本,毛利,狀態\n";
            currentData.forEach((r: any) => {
                csvContent += `SR-${r.id.slice(-6)},${r.title.replace(/,/g, ' ')},${r.contractAmount},${r.totalCost},${r.margin},${getStatusLabel(r.status)}\n`;
            });
        } else {
            csvContent += "商機單號,名稱,客戶,累積成本,狀態\n";
            currentData.forEach((r: any) => {
                csvContent += `OPP-${r.id.slice(-6)},${r.title.replace(/,/g, ' ')},${r.customerName.replace(/,/g, ' ')},${r.totalCost},${getStatusLabel(r.status)}\n`;
            });
        }
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${activeTab}_settlement_${currentMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleLock = () => {
        if (confirm(`確認要鎖定 ${currentMonth} 的 ${activeTab === "project" ? "專案" : "協銷"} 結算嗎？鎖定後將無法再異動此月份的工時時數。`)) {
            lockSettlement.mutate({ month: currentMonth, type: activeTab });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card p-6 rounded-xl shadow-sm border border-border/50 gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">月度結算 (Settlements)</h2>
                    <p className="text-muted-foreground mt-1">匯整工時與成本計支。目前檢視月份：<span className="font-semibold text-foreground">{currentMonth}</span></p>
                </div>
                <div className="flex gap-4 items-center w-full md:w-auto">
                    <div className="flex items-center gap-2 border bg-background px-3 py-1.5 rounded-lg text-sm">
                        <CalendarDays className="w-4 h-4 text-muted-foreground" />
                        <input 
                            type="month" 
                            className="bg-transparent border-0 outline-none font-medium"
                            value={currentMonth}
                            onChange={(e) => setCurrentMonth(e.target.value)}
                        />
                    </div>
                    {activeTab === "project" && (
                        <div className="bg-primary/5 p-3 rounded-lg border border-primary/10 text-right min-w-[150px]">
                            <div className="text-xs font-medium text-muted-foreground mb-0.5">專案整體估計毛利</div>
                            <div className={`text-xl font-bold ${overallMarginPercent >= 30 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {overallMarginPercent}%
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs & Trigger bar */}
            <div className="flex justify-between items-center border-b border-border/50">
                <div className="flex space-x-4">
                    <button 
                        onClick={() => setActiveTab("project")}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === "project" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                        專案結算
                    </button>
                    <button 
                        onClick={() => setActiveTab("presales")}
                        className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === "presales" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                        協銷結算
                    </button>
                </div>
                <div className="pb-2">
                    {isLocked ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-semibold shadow-sm">
                            <Lock className="w-3.5 h-3.5" /> 本月已確認結結
                        </span>
                    ) : (
                        <button 
                            onClick={handleLock}
                            disabled={lockSettlement.isPending}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg inline-flex items-center text-xs font-semibold transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                        >
                            <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> 月結確認
                        </button>
                    )}
                </div>
            </div>

            {/* Filter controls */}
            <div className="bg-card border rounded-xl shadow-sm p-4 flex justify-between items-center">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={activeTab === 'project' ? "搜尋專案名稱..." : "搜尋商機/客戶名稱..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-input bg-background"
                    />
                </div>
                <button 
                    onClick={handleExport}
                    className="bg-outline border border-input hover:bg-muted text-foreground px-4 py-2 rounded-lg flex items-center text-sm font-medium transition-colors"
                >
                    <Download className="w-4 h-4 mr-2" />
                    匯出結算報表
                </button>
            </div>

            {/* Main List */}
            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground">
                            {activeTab === "project" ? (
                                <tr>
                                    <th className="px-6 py-3 font-medium">SR 單號 / 名稱</th>
                                    <th className="px-6 py-3 font-medium">PM ID</th>
                                    <th className="px-6 py-3 font-medium text-right">合約金額 (Revenue)</th>
                                    <th className="px-6 py-3 font-medium text-right">本月工時成本 (Cost)</th>
                                    <th className="px-6 py-3 font-medium text-right">本月毛利預估</th>
                                    <th className="px-6 py-3 font-medium text-center">狀態</th>
                                </tr>
                            ) : (
                                <tr>
                                    <th className="px-6 py-3 font-medium">商機單號 / 名稱</th>
                                    <th className="px-6 py-3 font-medium">客戶名稱</th>
                                    <th className="px-6 py-3 font-medium text-right">本月協銷成本 (Cost)</th>
                                    <th className="px-6 py-3 font-medium text-center">狀態</th>
                                </tr>
                            )}
                        </thead>
                        <tbody className="divide-y divide-border">
                            {currentData.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">此月份無任何結算資料</td>
                                </tr>
                            ) : (
                                activeTab === "project" ? (
                                    (currentData as any[]).map((sr) => (
                                        <tr key={sr.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center space-x-2">
                                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                                    <span className="font-semibold text-foreground">SR-#{sr.id.slice(-6)}</span>
                                                </div>
                                                <div className="text-muted-foreground mt-1 truncate max-w-xs">{sr.title}</div>
                                            </td>
                                            <td className="px-6 py-4 text-muted-foreground">#{sr.pmId ? sr.pmId.slice(-6) : "-"}</td>
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
                                ) : (
                                    (currentData as any[]).map((opp) => (
                                        <tr key={opp.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center space-x-2">
                                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                                    <span className="font-semibold text-foreground">OPP-#{opp.id.slice(-6)}</span>
                                                </div>
                                                <div className="text-muted-foreground mt-1 truncate max-w-xs">{opp.title}</div>
                                            </td>
                                            <td className="px-6 py-4">{opp.customerName}</td>
                                            <td className="px-6 py-4 text-right text-rose-600 font-medium">${opp.totalCost?.toLocaleString() || "0"}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getStatusColor(opp.status)}`}>
                                                    {getStatusLabel(opp.status)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
