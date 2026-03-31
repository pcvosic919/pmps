import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp, Users, AlertTriangle, CheckCircle, PieChart as PieChartIcon, Download } from "lucide-react";

export function KpiDashboardPage() {
    const [filterDepts, setFilterDepts] = useState<string[]>([]);
    const [filterUsers, setFilterUsers] = useState<string[]>([]);

    const filterInput = {
        departments: filterDepts.length > 0 ? filterDepts : undefined,
        userIds: filterUsers.length > 0 ? filterUsers : undefined
    };

    const { data: usersData } = trpc.users.list.useQuery({ limit: 500 });
    const allUsers = usersData?.items || [];
    const departments = Array.from(new Set(allUsers.map((u: any) => u.department).filter(Boolean))) as string[];

    const { data: kpiData, isLoading: kpiLoading } = trpc.analytics.getKpiData.useQuery(filterInput);
    const { data: utData, isLoading: utLoading } = trpc.analytics.getUtilization.useQuery(filterInput);
    const { data: trendData, isLoading: trendLoading } = trpc.analytics.getWinRateTrend.useQuery(filterInput);
    const { data: costRevData, isLoading: costRevLoading } = trpc.analytics.getCostVsRevenuePerPerson.useQuery(filterInput);
    const { data: projectStatusData, isLoading: projectStatusLoading } = trpc.analytics.getProjectStatusData.useQuery(filterInput);
    const [visibleCharts, setVisibleCharts] = useState({
        opportunityMix: true,
        projectStatus: true,
        utilization: true,
        winRateTrend: true,
        costVsRevenue: true,
    });

    const oppData = [
        { name: '進行中 / 協銷中', value: kpiData?.pendingOpps || 0, color: '#3b82f6' },
        { name: '已成交', value: kpiData?.wonOpps || 0, color: '#10b981' },
        { name: '流標 / 失敗', value: kpiData?.lostOpps || 0, color: '#ef4444' },
    ];

    const utilizationData = utData?.slice(0, 5).map(u => ({
        name: u.name,
        稼動率: u.utilizationRate,
        target: 80
    })) || [];
    const exportRows = useMemo(() => {
        const rows = [
            ["metric", "value"],
            ["win_rate", String(kpiData?.winRate || 0)],
            ["active_projects", String(kpiData?.activeProjects || 0)],
            ["total_revenue", String(kpiData?.totalRevenue || 0)],
            ["total_margin", String(kpiData?.totalMargin || 0)],
            ["margin_percent", String(kpiData?.marginPercent || 0)],
            ["unlocked_utilization_count", String(utData?.length || 0)],
        ];

        trendData?.forEach((item) => {
            rows.push([`trend_${item.month}`, String(item.winRate)]);
        });

        return rows.map((cols) => cols.join(",")).join("\n");
    }, [kpiData, trendData, utData]);

    const handleExport = () => {
        const blob = new Blob([exportRows], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `kpi-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    if (kpiLoading || utLoading || trendLoading || costRevLoading || projectStatusLoading) {
        return <div className="p-8 text-center text-muted-foreground animate-pulse">載入 KPI 數據中...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">KPI 儀表板</h2>
                    <p className="text-muted-foreground mt-1">追蹤商機分析、毛利與技術人員稼動率</p>
                </div>
                <button
                    type="button"
                    onClick={handleExport}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                    <Download className="h-4 w-4" />
                    匯出 CSV
                </button>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                    <div className="text-sm font-semibold mb-2">資料篩選 (Data Filters)</div>
                    <div className="flex flex-wrap gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-muted-foreground font-medium">部門 (多選)</label>
                            <div className="flex flex-wrap gap-1 p-2 border border-input bg-background rounded-md min-w-[200px] max-w-[400px] max-h-[100px] overflow-y-auto">
                                <button
                                    type="button"
                                    onClick={() => setFilterDepts([])}
                                    className={`px-2 py-0.5 rounded text-xs ${filterDepts.length === 0 ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                                >
                                    全部
                                </button>
                                {departments.map(d => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => {
                                            if (filterDepts.includes(d)) setFilterDepts(filterDepts.filter(i => i !== d));
                                            else setFilterDepts([...filterDepts, d]);
                                            setFilterUsers([]);
                                        }}
                                        className={`px-2 py-0.5 rounded text-xs transition-colors ${filterDepts.includes(d) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-muted-foreground font-medium">人員 (多選)</label>
                            <div className="flex flex-wrap gap-1 p-2 border border-input bg-background rounded-md min-w-[200px] max-w-[500px] max-h-[100px] overflow-y-auto">
                                <button
                                    type="button"
                                    onClick={() => setFilterUsers([])}
                                    className={`px-2 py-0.5 rounded text-xs ${filterUsers.length === 0 ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                                >
                                    全部
                                </button>
                                {allUsers
                                    .filter((u: any) => filterDepts.length === 0 || filterDepts.includes(u.department))
                                    .map((u: any) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => {
                                                if (filterUsers.includes(u.id)) setFilterUsers(filterUsers.filter(i => i !== u.id));
                                                else setFilterUsers([...filterUsers, u.id]);
                                            }}
                                            className={`px-2 py-0.5 rounded text-xs transition-colors ${filterUsers.includes(u.id) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                                        >
                                            {u.name}
                                        </button>
                                    ))
                                }
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6">
                    <div className="text-sm font-semibold mb-2">顯示模組 (Visible Layout)</div>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { key: "opportunityMix", label: "商機狀態" },
                            { key: "projectStatus", label: "專案狀態" },
                            { key: "utilization", label: "稼動率" },
                            { key: "winRateTrend", label: "勝率趨勢" },
                            { key: "costVsRevenue", label: "成本 vs 營收" }
                        ].map((option) => {
                            const enabled = visibleCharts[option.key as keyof typeof visibleCharts] ?? true;
                            return (
                                <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => setVisibleCharts((current) => ({ ...current, [option.key]: !enabled }))}
                                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${enabled ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                                >
                                    {enabled ? "顯示" : "隱藏"} · {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="bg-card p-5 border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center text-muted-foreground mb-2">
                        <TrendingUp className="w-4 h-4 mr-2 text-green-500" />
                        <span className="text-sm font-medium">商機勝率</span>
                    </div>
                    <div className="text-2xl font-bold">{kpiData?.winRate || 0}%</div>
                    <div className="text-xs text-green-600 mt-1 dark:text-green-400">系統即時統計</div>
                </div>

                <div className="bg-card p-5 border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center text-muted-foreground mb-2">
                        <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
                        <span className="text-sm font-medium">執行中專案總數</span>
                    </div>
                    <div className="text-2xl font-bold">{kpiData?.activeProjects || 0}</div>
                    <div className="text-xs text-amber-600 mt-1 dark:text-amber-400">目前活躍的專案</div>
                </div>

                <div className="bg-card p-5 border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center text-muted-foreground mb-2">
                        <Users className="w-4 h-4 mr-2 text-blue-500" />
                        <span className="text-sm font-medium">整體累積營收</span>
                    </div>
                    <div className="text-2xl font-bold">${kpiData?.totalRevenue?.toLocaleString() || 0}</div>
                    <div className="text-xs text-muted-foreground mt-1">毛利率: {kpiData?.marginPercent || 0}%</div>
                </div>

                <div className="bg-card p-5 border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center text-muted-foreground mb-2">
                        <CheckCircle className="w-4 h-4 mr-2 text-primary" />
                        <span className="text-sm font-medium">整體累積毛利</span>
                    </div>
                    <div className="text-2xl font-bold">${kpiData?.totalMargin?.toLocaleString() || 0}</div>
                    <div className="text-xs text-muted-foreground mt-1">基於結算模型估計</div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Opp Status Pie Chart */}
                {visibleCharts.opportunityMix && (
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                        <h3 className="text-lg font-bold mb-6 flex items-center">
                            <PieChartIcon className="w-5 h-5 mr-2 text-muted-foreground" />
                            商機狀態分佈
                        </h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={oppData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {oppData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-4 mt-4 flex-wrap">
                            {oppData.map((d) => (
                                <div key={d.name} className="flex items-center text-sm">
                                    <span className="w-3 h-3 rounded-full mr-1.5" style={{ backgroundColor: d.color }}></span>
                                    {d.name} ({d.value})
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Project Status Bar Chart */}
                {visibleCharts.projectStatus && (
                    <div className="bg-card p-6 border border-border rounded-xl shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-green-500" />
                                專案狀態分佈 (營收)
                            </h3>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={projectStatusData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                                    <RechartsTooltip 
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                        formatter={(value: any) => [new Intl.NumberFormat().format(value), '金額']}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {projectStatusData?.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3b82f6'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                            {projectStatusData?.map((d: any, i: number) => (
                                <div key={i} className="bg-muted/30 p-3 rounded-lg flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">{d.name}</span>
                                    <span className="font-bold">{d.count} 筆</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Utilization Bar Chart */}
                {visibleCharts.utilization && (
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                        <h3 className="text-lg font-bold mb-6 flex items-center">
                            <Users className="w-5 h-5 mr-2 text-muted-foreground" />
                            人員稼動率分佈 (本月)
                        </h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={utilizationData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888833" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <RechartsTooltip cursor={{ fill: '#88888811' }} />
                                    <Bar dataKey="稼動率" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Win Rate Trend Line Chart */}
                {visibleCharts.winRateTrend && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold mb-6 flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2 text-muted-foreground" />
                        商機勝率趨勢 (近半年)
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888833" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                <RechartsTooltip cursor={{ fill: '#88888811' }} />
                                <Line type="monotone" dataKey="winRate" stroke="var(--color-primary)" strokeWidth={2} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                )}

                {/* Cost vs Revenue Bar Chart */}
                {visibleCharts.costVsRevenue && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold mb-6 flex items-center">
                        <PieChartIcon className="w-5 h-5 mr-2 text-muted-foreground" />
                        每人成本 vs 貢獻營收 (PM)
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={costRevData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888833" />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                <RechartsTooltip cursor={{ fill: '#88888811' }} />
                                <Bar dataKey="cost" name="成本" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="revenue" name="營收" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                )}
            </div>
        </div>
    );
}
