import { trpc } from "../lib/trpc";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp, Users, AlertTriangle, CheckCircle, PieChart as PieChartIcon } from "lucide-react";

export function KpiDashboardPage() {
    const { data: kpiData, isLoading: kpiLoading } = trpc.analytics.getKpiData.useQuery();
    const { data: utData, isLoading: utLoading } = trpc.analytics.getUtilization.useQuery();

    const oppData = [
        { name: '待處理 / 協銷中', value: kpiData?.activeProjects || 15, color: '#3b82f6' },
        { name: '已成交', value: kpiData?.winRate || 8, color: '#10b981' },
        { name: '失敗', value: 3, color: '#ef4444' },
    ];

    const utilizationData = utData?.slice(0, 5).map(u => ({
        name: u.name,
        稼動率: u.utilizationRate,
        target: 80
    })) || [];

    if (kpiLoading || utLoading) {
        return <div className="p-8 text-center text-muted-foreground">載入 KPI 數據中...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">KPI 儀表板</h2>
                    <p className="text-muted-foreground mt-1">追蹤商機分析、毛利與技術人員稼動率</p>
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

                {/* Utilization Bar Chart */}
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
            </div>
        </div>
    );
}
