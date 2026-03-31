import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import { 
    LayoutDashboard, Briefcase, AlertTriangle, TrendingUp, 
    CheckCircle2, Clock, DollarSign, Activity 
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";

export function PmDashboardPage() {
    const { data: projects, isLoading } = trpc.projects.srList.useQuery({ limit: 50 });

    const activeProjects = useMemo(() => 
        (projects || []).filter(p => !["completed", "cancelled"].includes(p.status)),
    [projects]);

    const metrics = useMemo(() => {
        if (!activeProjects.length) return { totalAmount: 0, atRisk: 0, new: 0, active: 0 };
        
        return activeProjects.reduce((acc, p) => ({
            totalAmount: acc.totalAmount + (p.contractAmount || 0),
            atRisk: acc.atRisk + (p.marginWarning ? 1 : 0),
            new: acc.new + (p.status === "new" ? 1 : 0),
            active: acc.active + (p.status === "in_progress" ? 1 : 0)
        }), { totalAmount: 0, atRisk: 0, new: 0, active: 0 });
    }, [activeProjects]);

    const chartData = useMemo(() => {
        return activeProjects
            .map(p => ({
                name: p.title.length > 10 ? p.title.substring(0, 10) + '...' : p.title,
                fullTitle: p.title,
                amount: p.contractAmount || 0,
                margin: p.marginEstimate || 0,
                warning: p.marginWarning
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10); // Top 10 by amount
    }, [activeProjects]);

    if (isLoading) {
        return <div className="p-8 text-center animate-pulse text-muted-foreground">載入專案總表資料中...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center space-x-3 mb-6">
                <LayoutDashboard className="w-8 h-8 text-primary" />
                <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                    專案高階視圖 (PM Dashboard)
                </h1>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card border border-border shadow-sm rounded-xl p-5 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">執行中專案數</p>
                            <h3 className="text-3xl font-black mt-2 text-foreground">{activeProjects.length}</h3>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Briefcase className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 flex items-center">
                        <span className="text-blue-500 font-medium mr-1">{metrics.new}</span> 個新收件, <span className="text-primary font-medium mx-1">{metrics.active}</span> 個進行中
                    </p>
                </div>

                <div className="bg-card border border-border shadow-sm rounded-xl p-5 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">管理總合約額</p>
                            <h3 className="text-3xl font-black mt-2 text-emerald-600 dark:text-emerald-400">
                                {metrics.totalAmount >= 1000000 
                                    ? `NT$ ${(metrics.totalAmount / 1000000).toFixed(1)}M` 
                                    : `NT$ ${(metrics.totalAmount / 1000).toFixed(0)}K`}
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <DollarSign className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 flex items-center">
                        <TrendingUp className="w-3 h-3 mr-1" /> 活躍狀態下累積合約值
                    </p>
                </div>

                <div className="bg-card border border-border shadow-sm rounded-xl p-5 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">需關注專案</p>
                            <h3 className={`text-3xl font-black mt-2 ${metrics.atRisk > 0 ? "text-red-500" : "text-foreground"}`}>
                                {metrics.atRisk}
                            </h3>
                        </div>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${metrics.atRisk > 0 ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground"}`}>
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 flex items-center">
                        系統偵測利潤告警標記
                    </p>
                </div>

                <div className="bg-card border border-border shadow-sm rounded-xl p-5 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">近期結案 (歷史)</p>
                            <h3 className="text-3xl font-black mt-2 text-foreground">
                                {(projects || []).filter(p => p.status === "completed").length}
                            </h3>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 flex items-center">
                        已完成並歸檔的專案總數
                    </p>
                </div>
            </div>

            {/* Charts & Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-card border border-border rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-bold mb-6 flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-primary" /> Top 10 活躍專案 (按合約額)
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(val) => `NT$${val/1000}k`} />
                                <Tooltip 
                                    formatter={(value: any) => [`NT$ ${Number(value).toLocaleString()}`, "合約金額"]}
                                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTitle || label}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                                />
                                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.warning ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl shadow-sm p-4 flex flex-col">
                    <h3 className="text-lg font-bold mb-4 px-2 flex items-center">
                        <Clock className="w-5 h-5 mr-2 text-primary" /> 最新立項專案
                    </h3>
                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {activeProjects.slice(0, 7).map(p => (
                            <Link key={p.id} href={`/service-requests/${p.id}`}>
                                <a className="block p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors group">
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-semibold text-sm truncate pr-2 group-hover:text-primary transition-colors">{p.title}</h4>
                                        {p.marginWarning && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-muted-foreground mt-2">
                                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize font-medium">
                                            {p.status.replace("_", " ")}
                                        </span>
                                        <span>NT$ {p.contractAmount?.toLocaleString()}</span>
                                    </div>
                                </a>
                            </Link>
                        ))}
                        {activeProjects.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-10">目前尚無活躍專案</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
