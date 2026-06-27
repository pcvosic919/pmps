import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Database, Download, FileText, Printer, Calendar, BarChart2 } from "lucide-react";
import toast from "react-hot-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { exportKpiRevenueWorkbook, exportOpenCasesWorkbook, exportRowsToXlsx, formatExportDate, makeXlsxFileName } from "../lib/exportXlsx";

type ReportType =
    | "timesheets"
    | "utilization"
    | "settlement"
    | "project_profitability"
    | "pm_ranking"
    | "budget_variance"
    | "sla_compliance"
    | "renewal_rate"
    | "open_cases"
    | "kpi_revenue";

export function ReportBuilderPage() {
    const [reportType, setReportType] = useState<ReportType>("timesheets");
    
    // Default to current month
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().substring(0, 10);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().substring(0, 10);
    
    const [startDate, setStartDate] = useState(firstDay);
    const [endDate, setEndDate] = useState(lastDay);
    const [department, setDepartment] = useState("");
    const [userId, setUserId] = useState("");
    const { data: usersData } = trpc.users.list.useQuery({ limit: 500 });
    const { data: reportCatalog } = trpc.analytics.getReportCatalog.useQuery();
    const { data: dataSourceStatus } = trpc.analytics.getReportDataSourceStatus.useQuery();
    const allUsers = usersData?.items || [];
    const filteredUsers = allUsers.filter((user: any) => !department || user.department === department);
    const fallbackCatalog = [
        { reportType: "open_cases", label: "未結案清單匯出", category: "executive", description: "長官檢視格式。", isExecutiveFormat: true },
        { reportType: "kpi_revenue", label: "年度目標/認列/Pipeline 報表", category: "executive", description: "長官檢視格式。", isExecutiveFormat: true },
        { reportType: "settlement", label: "部門利潤結算報表", category: "finance", description: "月結與利潤中心結算用。", isExecutiveFormat: false },
        { reportType: "timesheets", label: "工時清單報表", category: "people", description: "工時明細。", isExecutiveFormat: false },
        { reportType: "utilization", label: "人力稼動率報表", category: "people", description: "人力負載分析。", isExecutiveFormat: false },
        { reportType: "project_profitability", label: "客戶/專案毛利報表", category: "project", description: "專案毛利分析。", isExecutiveFormat: false },
        { reportType: "pm_ranking", label: "PM 排行榜", category: "project", description: "PM 營收與毛利排行。", isExecutiveFormat: false },
        { reportType: "budget_variance", label: "預算偏差分析", category: "project", description: "預算與實際偏差。", isExecutiveFormat: false },
        { reportType: "sla_compliance", label: "SLA 達成率報表", category: "project", description: "專案準時狀況。", isExecutiveFormat: false },
        { reportType: "renewal_rate", label: "客戶續約/勝率報表", category: "project", description: "客戶維度勝率。", isExecutiveFormat: false },
    ];
    const catalog = reportCatalog?.length ? reportCatalog : fallbackCatalog;
    const selectedTemplate = catalog.find((template: any) => template.reportType === reportType);
    const executiveSourceKey = reportType === "open_cases" || reportType === "kpi_revenue" ? reportType : null;
    const selectedSourceStatus = executiveSourceKey ? (dataSourceStatus as any)?.[executiveSourceKey] : null;
    const categoryLabels: Record<string, string> = {
        executive: "主管檢視報表",
        finance: "財務結算報表",
        people: "人力資源報表",
        project: "專案管理報表",
        system: "系統報表"
    };
    const groupedTemplates = catalog.reduce((groups: Record<string, any[]>, template: any) => {
        if (!groups[template.category]) groups[template.category] = [];
        groups[template.category].push(template);
        return groups;
    }, {});

    const { data: reportData, isLoading } = trpc.analytics.generateReport.useQuery({
        reportType,
        startDate,
        endDate,
        department: department || undefined,
        userId: userId || undefined
    }, {
        enabled: !!startDate && !!endDate
    });

    const exportXlsx = () => {
        if (!reportData || (reportData as any[]).length === 0) {
            toast.error("無資料可供匯出");
            return;
        }

        const exportDate = formatExportDate();
        const reportLabel = selectedTemplate?.label || reportType;
        if (reportType === "open_cases") {
            exportOpenCasesWorkbook(reportData as any[], makeXlsxFileName("未結案清單匯出", exportDate));
        } else if (reportType === "kpi_revenue") {
            exportKpiRevenueWorkbook(reportData as any[], makeXlsxFileName("年度目標認列報表", exportDate));
        } else {
            exportRowsToXlsx(reportData as any[], makeXlsxFileName(reportLabel, exportDate), reportType);
        }
        toast.success("Excel 匯出成功");
    };

    const handlePrint = () => {
        window.print();
    };

    const getEmptyMessage = () => {
        if (!selectedTemplate?.isExecutiveFormat || !selectedSourceStatus) return "符合條件的資料為空。";
        if (selectedSourceStatus.dataRows === 0) return "系統內目前沒有符合此主管報表口徑的資料，請確認專案、WBS、金額或年度目標設定。";
        return "系統資料已有內容，但目前篩選條件下沒有資料。";
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50 print:hidden">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">自訂報表產生器</h2>
                    <p className="text-muted-foreground mt-1">建立效能分析報表並匯出為 Excel 檔或 PDF 格式（請運用列印功能）</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={handlePrint} className="px-4 py-2 border border-border text-foreground hover:bg-muted rounded-lg flex items-center transition-colors">
                        <Printer className="w-4 h-4 mr-2" /> 列印 / PDF
                    </button>
                    <button onClick={exportXlsx} disabled={!reportData || reportData.length === 0} className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg flex items-center transition-colors disabled:opacity-50">
                        <Download className="w-4 h-4 mr-2" /> 匯出 Excel
                    </button>
                </div>
            </div>

            <div className="grid md:grid-cols-4 gap-6 print:hidden">
                <div className="bg-card border border-border p-5 rounded-xl shadow-sm space-y-4 col-span-1">
                    <h3 className="font-bold border-b border-border/50 pb-2 flex items-center"><FileText className="w-4 h-4 mr-2"/>報表條件</h3>
                    
                    <div>
                        <label className="block text-sm font-medium mb-1">報表類型</label>
                        <select className="w-full border border-border rounded-lg p-2 bg-background focus:ring-2 focus:ring-primary/50 outline-none" value={reportType} onChange={e => setReportType(e.target.value as any)}>
                            {Object.entries(groupedTemplates).map(([category, templates]) => (
                                <optgroup key={category} label={categoryLabels[category] || category}>
                                    {(templates as any[]).map((template: any) => (
                                        <option key={template.reportType} value={template.reportType}>
                                            {template.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        {selectedTemplate && (
                            <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                                <div className="font-semibold text-foreground">{categoryLabels[selectedTemplate.category] || selectedTemplate.category}</div>
                                <div className="mt-0.5">{selectedTemplate.description}</div>
                                {selectedTemplate.isExecutiveFormat && <div className="mt-1 text-primary font-medium">長官格式：會維持指定 Excel 欄位與工作表。</div>}
                            </div>
                        )}
                        {selectedSourceStatus && (
                            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                                <div className="font-semibold flex items-center gap-1.5">
                                    <Database className="w-3.5 h-3.5" />
                                    系統資料狀態
                                </div>
                                <div className="mt-2 space-y-1 text-emerald-800">
                                    <div>來源：{selectedSourceStatus.sourceName || "系統資料庫"}</div>
                                    <div>統計時間：{selectedSourceStatus.checkedAt ? new Date(selectedSourceStatus.checkedAt).toLocaleString() : "-"}</div>
                                    <div>資料口徑：{selectedSourceStatus.description || "-"}</div>
                                    <div>目前資料列：{selectedSourceStatus.dataRows}</div>
                                    {selectedSourceStatus.detail && <div>{selectedSourceStatus.detail}</div>}
                                </div>
                            </div>
                        )}
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
                        <input type="text" placeholder="留空白表示全部..." value={department} onChange={e => { setDepartment(e.target.value); setUserId(""); }} className="w-full border border-border rounded-lg p-2 bg-background focus:ring-2 outline-none"/>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">人員過濾</label>
                        <select value={userId} onChange={e => setUserId(e.target.value)} className="w-full border border-border rounded-lg p-2 bg-background focus:ring-2 outline-none">
                            <option value="">留空白表示全部...</option>
                            {filteredUsers.map((user: any) => (
                                <option key={user.id} value={user.id}>
                                    {user.name}{user.department ? ` - ${user.department}` : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="col-span-3 bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    {isLoading ? (
                        <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                            <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                            產生中...
                        </div>
                    ) : (!reportData || reportData.length === 0) ? (
                        <div className="p-12 text-center text-muted-foreground">{getEmptyMessage()}</div>
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
                                {reportData && (reportData as any[]).length > 0 && typeof (reportData as any[])[0] === 'object' ? (
                                    <table className="w-full min-w-max text-sm text-left print:text-xs">
                                        <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-y border-border">
                                        <tr>
                                            {Object.keys((reportData as any[])[0] || {}).map(key => (
                                                <th key={key} className="px-4 py-3">{key}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(reportData as any[]).map((row: any, i: number) => (
                                            <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                                                {Object.values(row || {}).map((val: any, j: number) => (
                                                    <td key={j} className="px-4 py-3">{val}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                ) : (
                                    <div className="p-8 text-center text-muted-foreground">報表資料格式不正確或為空。</div>
                                )}
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
