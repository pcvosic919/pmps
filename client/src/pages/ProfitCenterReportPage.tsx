import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Calculator, Download, Calendar, TrendingUp, AlertTriangle, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProfitCenterReportPage() {
    const today = new Date();
    const [startDate, setStartDate] = useState(
        new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(
        new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]
    );

    const { data: report, isLoading, refetch } = trpc.analytics.getProfitCenterReport.useQuery({
        startDate,
        endDate
    });

    const handleExportCSV = () => {
        if (!report) return;
        
        const rows = [
            ["類別", "總收入 (NT$)", "直接成本 (NT$)", "貢獻毛利 (NT$)"],
            ["協銷 (Presales)", report.presales.revenue, report.presales.cost, report.presales.margin],
            ["專案 (Project)", report.project.revenue, report.project.cost, report.project.margin],
            ["維運 (Maintenance)", report.maintenance.revenue, report.maintenance.cost, report.maintenance.margin],
            ["", "", "", ""],
            ["總計", report.total.revenue, report.total.directCost, report.total.margin],
            ["共同成本 (Overhead)", "", "", report.total.overheadCost],
            ["淨貢獻毛利", "", "", report.total.netContributionMargin],
            ["ROI (%)", "", "", report.total.roi.toFixed(2) + "%"]
        ];

        let csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `profit_center_report_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatCurrency = (val: number) => `NT$ ${Math.round(val).toLocaleString()}`;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                        利潤中心業績結算儀表板
                    </h2>
                    <p className="text-muted-foreground mt-1">統一檢視協銷、專案、維運三大收入貢獻與成本效益 (ROI)</p>
                </div>
                <Button onClick={handleExportCSV} disabled={!report || isLoading} variant="outline" className="shadow-sm">
                    <Download className="w-4 h-4 mr-2" />
                    匯出 CSV
                </Button>
            </div>

            <div className="bg-card border rounded-xl shadow-sm p-5 flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">開始日期</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="pl-9 w-[160px]"
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">結束日期</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="pl-9 w-[160px]"
                        />
                    </div>
                </div>
                <Button onClick={() => refetch()} className="shadow-sm">
                    重新計算
                </Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : report ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Presales Card */}
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="font-bold text-lg mb-4 flex items-center border-b pb-3">
                                <span className="bg-blue-100 text-blue-700 p-2 rounded-lg mr-3">協銷毛利</span>
                                Presales
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">收入 (總時數 × 單價)</span>
                                    <span className="font-semibold">{formatCurrency(report.presales.revenue)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">直接成本 (時薪)</span>
                                    <span className="font-semibold text-destructive">{formatCurrency(report.presales.cost)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-3 border-t font-bold text-base">
                                    <span>貢獻毛利</span>
                                    <span className={report.presales.margin >= 0 ? "text-green-600" : "text-destructive"}>
                                        {formatCurrency(report.presales.margin)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Project Card */}
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="font-bold text-lg mb-4 flex items-center border-b pb-3">
                                <span className="bg-emerald-100 text-emerald-700 p-2 rounded-lg mr-3">專案毛利</span>
                                Projects
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">合約收入</span>
                                    <span className="font-semibold">{formatCurrency(report.project.revenue)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">直接成本 (專案時薪)</span>
                                    <span className="font-semibold text-destructive">{formatCurrency(report.project.cost)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-3 border-t font-bold text-base">
                                    <span>貢獻毛利</span>
                                    <span className={report.project.margin >= 0 ? "text-green-600" : "text-destructive"}>
                                        {formatCurrency(report.project.margin)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Maintenance Card */}
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="font-bold text-lg mb-4 flex items-center border-b pb-3">
                                <span className="bg-purple-100 text-purple-700 p-2 rounded-lg mr-3">維運毛利</span>
                                Maintenance
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">點數合約收入</span>
                                    <span className="font-semibold">{formatCurrency(report.maintenance.revenue)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">直接成本 (維運時薪)</span>
                                    <span className="font-semibold text-destructive">{formatCurrency(report.maintenance.cost)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-3 border-t font-bold text-base">
                                    <span>貢獻毛利</span>
                                    <span className={report.maintenance.margin >= 0 ? "text-green-600" : "text-destructive"}>
                                        {formatCurrency(report.maintenance.margin)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Summary Card */}
                    <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-8 shadow-sm">
                        <h3 className="font-bold text-xl mb-6 flex items-center">
                            <Calculator className="w-6 h-6 mr-2 text-primary" />
                            利潤中心總結算 (Profit Center Summary)
                        </h3>
                        
                        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-3 bg-background/50 rounded-lg">
                                    <span className="font-medium text-muted-foreground">三大類總收入</span>
                                    <span className="font-bold text-lg">{formatCurrency(report.total.revenue)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-background/50 rounded-lg">
                                    <span className="font-medium text-muted-foreground">總直接成本</span>
                                    <span className="font-bold text-lg text-destructive">{formatCurrency(report.total.directCost)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-background/50 rounded-lg border border-border">
                                    <span className="font-medium">初階貢獻毛利</span>
                                    <span className="font-bold text-lg">{formatCurrency(report.total.margin)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-destructive/5 rounded-lg border border-destructive/10">
                                    <span className="font-medium text-muted-foreground">共同管銷成本 (Overhead)</span>
                                    <span className="font-bold text-lg text-destructive">{formatCurrency(report.total.overheadCost)}</span>
                                </div>
                            </div>

                            <div className="flex flex-col justify-center space-y-6">
                                <div className="text-center p-6 bg-background rounded-xl shadow-sm border border-border">
                                    <p className="text-sm font-medium text-muted-foreground mb-2">淨貢獻毛利 (Net Contribution Margin)</p>
                                    <p className={`text-4xl font-extrabold ${report.total.netContributionMargin >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                                        {formatCurrency(report.total.netContributionMargin)}
                                    </p>
                                </div>

                                <div className="text-center p-6 bg-primary text-primary-foreground rounded-xl shadow-md">
                                    <p className="text-sm font-medium opacity-90 mb-2">利潤中心 ROI (淨利 / 總成本資產)</p>
                                    <div className="flex justify-center items-center">
                                        {report.total.roi >= 30 ? (
                                            <TrendingUp className="w-8 h-8 mr-3" />
                                        ) : report.total.roi > 0 ? (
                                            <TrendingUp className="w-8 h-8 mr-3 opacity-70" />
                                        ) : (
                                            <TrendingDown className="w-8 h-8 mr-3" />
                                        )}
                                        <p className="text-5xl font-black tracking-tight">
                                            {report.total.roi.toFixed(1)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
