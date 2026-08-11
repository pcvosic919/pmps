import { useMemo, useState } from "react";
import { BarChart3, Calendar, Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import toast from "react-hot-toast";
import { trpc } from "../lib/trpc";
import { exportRowsToXlsx, formatExportDate, makeXlsxFileName } from "../lib/exportXlsx";

type ReportType =
    | "presales_recognition"
    | "project_recognition"
    | "open_opportunities"
    | "open_projects"
    | "pipeline"
    | "people_kpi"
    | "recognition_adjustments"
    | "project_health"
    | "data_quality"
    | "timesheet_detail";

const categoryLabels: Record<string, string> = {
    recognition: "認列結算",
    business: "商機與 Pipeline",
    delivery: "專案交付",
    people: "人員績效",
    governance: "資料治理"
};

const today = new Date();
const initialStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const initialEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

const numberValue = (value: unknown) => typeof value === "number" ? value : 0;

export function ReportCenterPage() {
    const [reportType, setReportType] = useState<ReportType>("pipeline");
    const [activeCategory, setActiveCategory] = useState("business");
    const [startDate, setStartDate] = useState(initialStart);
    const [endDate, setEndDate] = useState(initialEnd);
    const [department, setDepartment] = useState("");
    const catalogQuery = trpc.reports.catalog.useQuery();
    const reportQuery = trpc.reports.generate.useQuery({
        reportType,
        startDate,
        endDate,
        department: department.trim() || undefined
    }, { enabled: !!startDate && !!endDate });

    const catalog = catalogQuery.data || [];
    const categories = Array.from(new Set(catalog.map((item: any) => item.category)));
    const selected = catalog.find((item: any) => item.reportType === reportType);
    const rows = useMemo(
        () => (reportQuery.data || []) as Record<string, unknown>[],
        [reportQuery.data]
    );
    const visibleCards = catalog.filter((item: any) => item.category === activeCategory);

    const summary = useMemo(() => {
        if (reportType === "pipeline") return [
            ["Pipeline 商機", rows.length],
            ["原始金額", `NT$ ${rows.reduce((sum, row) => sum + numberValue(row["原始金額"]), 0).toLocaleString()}`],
            ["加權金額", `NT$ ${rows.reduce((sum, row) => sum + numberValue(row["加權金額"]), 0).toLocaleString()}`],
            ["本期新增", rows.filter((row) => row["本期新增"] === "是").length]
        ];
        if (reportType === "project_recognition" || reportType === "presales_recognition") return [
            ["資料列數", rows.length],
            ["認列金額", `NT$ ${rows.reduce((sum, row) => sum + numberValue(row[reportType === "project_recognition" ? "認列金額" : "最終認列金額"]), 0).toLocaleString()}`],
            ["系統金額", `NT$ ${rows.reduce((sum, row) => sum + numberValue(row[reportType === "project_recognition" ? "系統建議金額" : "系統金額"]), 0).toLocaleString()}`],
            ["異常／調整", rows.filter((row) => row["異動類型"] !== "base" || row["狀態"] === "not_recognized").length]
        ];
        if (reportType === "open_opportunities" || reportType === "open_projects" || reportType === "project_health") return [
            ["未完成案件", rows.length],
            ["風險案件", rows.filter((row) => !["正常", ""].includes(String(row["風險"] || ""))).length],
            ["逾期案件", rows.filter((row) => numberValue(row["逾期天數"]) > 0).length],
            ["待處理金額", `NT$ ${rows.reduce((sum, row) => sum + numberValue(row[reportType === "open_opportunities" ? "商機金額" : "專案金額"]), 0).toLocaleString()}`]
        ];
        return [["資料列數", rows.length]];
    }, [reportType, rows]);

    const selectReport = (next: ReportType) => {
        setReportType(next);
        const template = catalog.find((item: any) => item.reportType === next);
        if (template) setActiveCategory(template.category);
    };

    const exportReport = () => {
        if (rows.length === 0) return toast.error("目前沒有可匯出的資料");
        exportRowsToXlsx(rows, makeXlsxFileName(selected?.label || "報表中心", formatExportDate()), selected?.label || "報表中心");
        toast.success("Excel 報表已匯出");
    };

    const chartData = reportType === "pipeline"
        ? rows.slice(0, 12).map((row) => ({ name: String(row["商機"] || "").slice(0, 12), 原始金額: numberValue(row["原始金額"]), 加權金額: numberValue(row["加權金額"]) }))
        : reportType === "people_kpi"
            ? rows.slice(0, 12).map((row) => ({ name: String(row["人員"] || "").slice(0, 10), 業務認列: numberValue(row["業務認列業績"]), 協銷認列: numberValue(row["協銷認列金額"]), 工時: numberValue(row["填報工時"]) }))
            : [];

    return (
        <div className="mx-auto max-w-[1600px] space-y-5">
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
                <div>
                    <div className="flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">報表中心</h1></div>
                    <p className="mt-1 text-sm text-muted-foreground">即時查詢 MongoDB 的結案、認列、Pipeline 與工時資料，舊報表口徑已整併。</p>
                </div>
                <button type="button" onClick={exportReport} disabled={rows.length === 0} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Download className="mr-2 inline h-4 w-4" />匯出目前報表</button>
            </div>

            <div className="flex flex-wrap gap-2 border-b">
                {categories.map((category) => <button key={category} type="button" onClick={() => { setActiveCategory(category); const first = catalog.find((item: any) => item.category === category); if (first) setReportType(first.reportType as ReportType); }} className={`border-b-2 px-4 py-2 text-sm font-medium ${activeCategory === category ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{categoryLabels[category] || category}</button>)}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {visibleCards.map((item: any) => <button key={item.reportType} type="button" onClick={() => selectReport(item.reportType)} className={`rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary ${reportType === item.reportType ? "border-primary ring-1 ring-primary/20" : ""}`}><div className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="h-4 w-4 text-primary" />{item.label}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p></button>)}
            </div>

            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
                    <div><label className="mb-1 block text-sm font-medium">報表類型</label><select value={reportType} onChange={(event) => selectReport(event.target.value as ReportType)} className="w-full rounded-lg border bg-background px-3 py-2">{catalog.map((item: any) => <option key={item.reportType} value={item.reportType}>{item.label}</option>)}</select></div>
                    <div><label className="mb-1 flex items-center text-sm font-medium"><Calendar className="mr-1 h-4 w-4" />開始日期</label><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" /></div>
                    <div><label className="mb-1 flex items-center text-sm font-medium"><Calendar className="mr-1 h-4 w-4" />結束日期</label><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" /></div>
                    <div><label className="mb-1 block text-sm font-medium">業務部門</label><input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="留空使用權限範圍" className="w-full rounded-lg border bg-background px-3 py-2" /></div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900"><ShieldCheck className="mr-1 inline h-4 w-4" />畫面與 Excel 使用相同資料權限。認列月份、結案月份與工時日期分開計算。</div>
                    <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                        <div>資料來源：MongoDB 即時查詢</div>
                        <div>狀態：{reportQuery.isFetching ? "更新中" : reportQuery.isError ? "查詢失敗" : "已完成"}</div>
                        {reportQuery.dataUpdatedAt > 0 && <div>更新時間：{new Date(reportQuery.dataUpdatedAt).toLocaleString()}</div>}
                    </div>
                </aside>

                <section className="min-w-0 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-card p-4 shadow-sm"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>)}</div>
                    {chartData.length > 0 && <div className="h-[340px] rounded-xl border bg-card p-4 shadow-sm"><h2 className="mb-3 font-semibold">{reportType === "pipeline" ? "Pipeline 金額比較" : "人員 KPI 摘要"}</h2><ResponsiveContainer width="100%" height="90%"><BarChart data={chartData as any[]}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />{reportType === "pipeline" ? <><Bar dataKey="原始金額" fill="#94a3b8" /><Bar dataKey="加權金額" fill="#2563eb" /></> : <><Bar dataKey="業務認列" fill="#16a34a" /><Bar dataKey="協銷認列" fill="#0ea5e9" /><Bar dataKey="工時" fill="#f59e0b" /></>}</BarChart></ResponsiveContainer></div>}
                    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">{reportQuery.isLoading ? <div className="p-12 text-center text-muted-foreground">報表計算中…</div> : reportQuery.isError ? <div className="p-12 text-center text-red-600">資料庫查詢失敗：{reportQuery.error.message}</div> : rows.length === 0 ? <div className="p-12 text-center text-muted-foreground">資料庫查詢成功，但目前篩選條件沒有資料。</div> : <div className="overflow-x-auto"><table className="min-w-max w-full text-sm"><thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr>{Object.keys(rows[0]).map((key) => <th key={key} className="whitespace-nowrap px-3 py-3">{key}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t hover:bg-muted/20">{Object.values(row).map((value, cell) => <td key={cell} className="max-w-[320px] whitespace-nowrap px-3 py-3">{value instanceof Date ? value.toLocaleDateString() : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value).toLocaleDateString() : String(value ?? "")}</td>)}</tr>)}</tbody></table></div>}</div>
                </section>
            </div>
        </div>
    );
}
