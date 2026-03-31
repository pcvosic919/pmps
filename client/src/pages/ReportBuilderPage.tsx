import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Download, FileText, Printer, Calendar, BarChart2 } from "lucide-react";
import toast from "react-hot-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export function ReportBuilderPage() {
    const [reportType, setReportType] = useState<"timesheets" | "utilization" | "settlement">("timesheets");
    
    // Default to current month
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().substring(0, 10);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().substring(0, 10);
    
    const [startDate, setStartDate] = useState(firstDay);
    const [endDate, setEndDate] = useState(lastDay);
    const [department, setDepartment] = useState("");

    const { data: reportData, isLoading } = trpc.analytics.generateReport.useQuery({
        reportType,
        startDate,
        endDate,
        department: department || undefined
    }, {
        enabled: !!startDate && !!endDate
    });

    const exportCsv = () => {
        if (!reportData || (reportData as any[]).length === 0) {
            toast.error("無資料可供匯出");
            return;
        }

        const headers = Object.keys((reportData as any[])[0]).join(",");
        const rows = (reportData as any[]).map((row: any) => Object.values(row).map(v => `"${v}"`).join(","));
        const csvContent = [headers, ...rows].join("\n");
        
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `report_${reportType}_${startDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("CSV 匯出成功");
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50 print:hidden">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">自訂報表產生器</h2>
                    <p className="text-muted-foreground mt-1">建立效能分析報表並匯出為 CSV 檔或 PDF 格式（請運用列印功能）</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={handlePrint} className="px-4 py-2 border border-border text-foreground hover:bg-muted rounded-lg flex items-center transition-colors">
                        <Printer className="w-4 h-4 mr-2" /> 列印 / PDF
                    </button>
                    <button onClick={exportCsv} disabled={!reportData || reportData.length === 0} className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg flex items-center transition-colors disabled:opacity-50">
                        <Download className="w-4 h-4 mr-2" /> 匯出 CSV
                    </button>
                </div>
            </div>

            <div className="grid md:grid-cols-4 gap-6 print:hidden">
                <div className="bg-card border border-border p-5 rounded-xl shadow-sm space-y-4 col-span-1">
                    <h3 className="font-bold border-b border-border/50 pb-2 flex items-center"><FileText className="w-4 h-4 mr-2"/>報表條件</h3>
                    
                    <div>
                        <label className="block text-sm font-medium mb-1">報表類型</label>
                        <select className="w-full border border-border rounded-lg p-2 bg-background focus:ring-2 focus:ring-primary/50 outline-none" value={reportType} onChange={e => setReportType(e.target.value as any)}>
                            <option value="timesheets">工時清單報表 (Timesheets)</option>
                            <option value="utilization">人力稼動率報表 (Utilization)</option>
                            <option value="settlement">部門利潤結算報表 (Settlement)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 flex items-center"><Calendar className="w-3.5 h-3.5 mr-1"/>起始日期</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-border rounded-lg p-2 bg-background focus:ring-2 outline-none"/>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium mb-1 flex items-center"><Calendar className="w-3.5 h-3.5 mr-1"/>結束日期</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-border rounded-lg p-2 bg-background focus:ring-2 outline-none"/>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">部門過濾</label>
                        <input type="text" placeholder="留空白表示全部..." value={department} onChange={e => setDepartment(e.target.value)} className="w-full border border-border rounded-lg p-2 bg-background focus:ring-2 outline-none"/>
                    </div>
                </div>

                <div className="col-span-3 bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    {isLoading ? (
                        <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                            <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                            產生中...
                        </div>
                    ) : (!reportData || reportData.length === 0) ? (
                        <div className="p-12 text-center text-muted-foreground">符合條件的資料為空。</div>
                    ) : (
                        <div className="space-y-6">
                            {reportType === "utilization" && (
                                <div className="p-6 border-b border-border/50 h-[400px]">
                                    <h4 className="font-bold flex items-center mb-4 text-muted-foreground"><BarChart2 className="w-4 h-4 mr-2" /> 稼動率比較</h4>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={reportData as any[]}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="User" fontSize={12} tickMargin={10} />
                                            <YAxis fontSize={12} />
                                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                            <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                            <Bar dataKey="Project Hours" name="專案工時" stackId="a" fill="#0f172a" radius={[0, 0, 4, 4]} />
                                            <Bar dataKey="Presales Hours" name="協銷工時" stackId="a" fill="#64748b" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {reportType === "settlement" && (
                                <div className="p-6 border-b border-border/50 h-[400px]">
                                    <h4 className="font-bold flex items-center mb-4 text-muted-foreground"><BarChart2 className="w-4 h-4 mr-2" /> 專案與商機預算消耗比</h4>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={reportData as any[]}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="Name" fontSize={12} tickMargin={10} />
                                            <YAxis fontSize={12} />
                                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                            <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                            <Bar dataKey="Total Value" name="總預算 (Value)" fill="#10b981" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Period Spent" name="區間花費 (Cost)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            <div className="overflow-x-auto print:overflow-visible">
                                <table className="w-full min-w-max text-sm text-left print:text-xs">
                                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y border-border">
                                    <tr>
                                        {Object.keys((reportData as any[])[0]).map(key => (
                                            <th key={key} className="px-4 py-3">{key}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(reportData as any[]).map((row: any, i: number) => (
                                        <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                                            {Object.values(row).map((val: any, j: number) => (
                                                <td key={j} className="px-4 py-3">{val}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}
                </div>
            </div>
            
            {/* Print Only Header */}
            <div className="hidden print:block mb-6">
                <h1 className="text-2xl font-bold border-b-2 border-black pb-2 mb-4">系統過濾報表 - {reportType.toUpperCase()}</h1>
                <p className="text-sm">資料期間: {startDate} ~ {endDate}</p>
                <p className="text-sm mb-4">列印時間: {new Date().toLocaleString()}</p>
            </div>
        </div>
    );
}
