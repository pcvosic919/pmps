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
        <div className="max-w-7xl mx-auto space-y-6 relative">
            {/* Tech-style Background Elements */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

            <div className="flex items-center space-x-3 mb-6 relative">
                <div className="p-2 bg-primary/10 rounded-xl backdrop-blur-sm border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
                    <LayoutDashboard className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-blue-500 to-emerald-400 drop-shadow-sm">
                    專案高階視圖 (PM Dashboard)
                </h1>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card/70 backdrop-blur-md border border-primary/20 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-2xl p-5 hover:shadow-[0_8px_30px_rgba(var(--primary),0.1)] hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase text-xs">執行中專案數</p>
                            <h3 className="text-4xl font-black mt-2 text-foreground group-hover:text-primary transition-colors">{activeProjects.length}</h3>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-primary/10 flex items-center justify-center text-blue-500 border border-blue-500/20 shadow-inner">
                            <Briefcase className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-xs text-muted-foreground flex items-center">
                            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5 animate-pulse"></span>
                            <span className="text-foreground font-medium mr-1">{metrics.new}</span> 新收件
                            <span className="mx-2 text-border">|</span>
                            <span className="text-foreground font-medium mr-1">{metrics.active}</span> 進行中
                        </p>
                    </div>
                </div>

                <div className="bg-card/70 backdrop-blur-md border border-emerald-500/20 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-2xl p-5 hover:shadow-[0_8px_30px_rgba(16,185,129,0.1)] hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase text-xs">管理總合約額</p>
                            <h3 className="text-3xl font-black mt-2 bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-emerald-400">
                                {metrics.totalAmount >= 1000000 
                                    ? `NT$ ${(metrics.totalAmount / 1000000).toFixed(1)}M` 
                                    : `NT$ ${(metrics.totalAmount / 1000).toFixed(0)}K`}
                            </h3>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-inner">
                            <DollarSign className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-xs text-muted-foreground flex items-center">
                            <TrendingUp className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                            活躍狀態下累積合約值
                        </p>
                    </div>
                </div>

                <div className="bg-card/70 backdrop-blur-md border border-red-500/20 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-2xl p-5 hover:shadow-[0_8px_30px_rgba(239,68,68,0.1)] hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase text-xs">需關注專案</p>
                            <h3 className={`text-4xl font-black mt-2 ${metrics.atRisk > 0 ? "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "text-foreground"}`}>
                                {metrics.atRisk}
                            </h3>
                        </div>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner ${metrics.atRisk > 0 ? "bg-gradient-to-br from-red-500/20 to-orange-500/10 text-red-500 border-red-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                            <AlertTriangle className={`w-6 h-6 ${metrics.atRisk > 0 ? "animate-pulse" : ""}`} />
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-xs text-muted-foreground flex items-center">
                            系統偵測利潤告警標記
                        </p>
                    </div>
                </div>

                <div className="bg-card/70 backdrop-blur-md border border-primary/20 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-2xl p-5 hover:shadow-[0_8px_30px_rgba(var(--primary),0.1)] hover:-translate-y-1 transition-all duration-300 group">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase text-xs">近期結案 (歷史)</p>
                            <h3 className="text-4xl font-black mt-2 text-foreground group-hover:text-primary transition-colors">
                                {(projects || []).filter(p => p.status === "completed").length}
                            </h3>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-xs text-muted-foreground flex items-center">
                            已完成並歸檔的專案總數
                        </p>
                    </div>
                </div>
            </div>

            {/* Charts & Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-card/70 backdrop-blur-md border border-primary/10 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] p-6 hover:shadow-[0_8px_30px_rgba(var(--primary),0.05)] transition-shadow">
                    <h3 className="text-lg font-bold mb-6 flex items-center tracking-wide">
                        <Activity className="w-5 h-5 mr-2 text-primary drop-shadow-[0_0_5px_rgba(var(--primary),0.5)]" /> Top 10 活躍專案 (按合約額)
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(val) => `NT$${val/1000}k`} />
                                <Tooltip 
                                    formatter={(value: any) => [`NT$ ${Number(value).toLocaleString()}`, "合約金額"]}
                                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTitle || label}
                                    cursor={{fill: 'hsl(var(--primary)/0.05)'}}
                                    contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--primary)/0.2)', backgroundColor: 'hsl(var(--card)/0.9)', backdropFilter: 'blur(8px)', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                                />
                                <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={40}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.warning ? "url(#colorWarning)" : "url(#colorPrimary)"} />
                                    ))}
                                </Bar>
                                <defs>
                                    <linearGradient id="colorPrimary" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.9}/>
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                                    </linearGradient>
                                    <linearGradient id="colorWarning" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.9}/>
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.4}/>
                                    </linearGradient>
                                </defs>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-card/70 backdrop-blur-md border border-primary/10 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] p-5 flex flex-col hover:shadow-[0_8px_30px_rgba(var(--primary),0.05)] transition-shadow">
                    <h3 className="text-lg font-bold mb-5 flex items-center tracking-wide">
                        <span className="relative flex h-3 w-3 mr-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary drop-shadow-[0_0_3px_rgba(var(--primary),0.8)]"></span>
                        </span>
                        最新立項專案
                    </h3>
                    <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                        {activeProjects.slice(0, 7).map(p => (
                            <Link key={p.id} href={`/service-requests/${p.id}`}>
                                <a className="block p-4 rounded-xl border border-primary/10 bg-gradient-to-r from-card to-muted/20 hover:border-primary/40 hover:shadow-[0_4px_15px_rgba(var(--primary),0.1)] hover:-translate-x-1 transition-all group">
                                    <div className="flex justify-between items-start mb-2 line-clamp-1">
                                        <h4 className="font-bold text-sm truncate pr-2 group-hover:text-primary transition-colors">{p.title}</h4>
                                        {p.marginWarning && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 drop-shadow-md" />}
                                    </div>
                                    <div className="flex justify-between items-center text-xs mt-2">
                                        <span className="bg-primary/10 text-primary border border-primary/20 shadow-inner px-2.5 py-1 rounded-md capitalize font-semibold tracking-wide">
                                            {p.status.replace("_", " ")}
                                        </span>
                                        <span className="font-mono font-medium text-muted-foreground group-hover:text-foreground transition-colors">NT$ {p.contractAmount?.toLocaleString()}</span>
                                    </div>
                                </a>
                            </Link>
                        ))}
                        {activeProjects.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-10 flex flex-col items-center">
                                <Clock className="w-10 h-10 mb-3 opacity-20" />
                                目前尚無活躍專案
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
