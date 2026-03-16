import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import { CheckCircle2, AlertCircle, TrendingUp, Users } from "lucide-react";

export function DashboardPage() {
    const { data: usersData, isLoading } = trpc.users.list.useQuery({ limit: 5 });

    // For demo: default to a business user view if we are "demo_business@demo.com", otherwise admin
    // We'll simulate this by just rendering a role-based conditional UI.
    // In a real app we'd fetch the current user's role from a `/api/me` or similar.
    const isBusinessRole = false; // Mock toggle for demo

    if (isBusinessRole) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">業務首頁 (Business Dashboard)</h2>
                    <p className="text-muted-foreground mt-1">追蹤您的商機轉換與目標達成率</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-6 bg-card border border-border shadow-sm rounded-xl hover:border-primary/50 transition-colors">
                        <h3 className="font-medium text-sm text-muted-foreground mb-2">本季目標達成</h3>
                        <div className="text-3xl font-bold text-primary">68%</div>
                        <div className="w-full bg-muted rounded-full h-2 mt-3">
                            <div className="bg-primary h-2 rounded-full" style={{ width: '68%' }}></div>
                        </div>
                    </div>
                    <div className="p-6 bg-card border border-border shadow-sm rounded-xl hover:border-primary/50 transition-colors">
                        <h3 className="font-medium text-sm text-muted-foreground mb-2 flex items-center">
                            <AlertCircle className="w-4 h-4 mr-1 text-amber-500" />
                            需推動商機
                        </h3>
                        <div className="text-3xl font-bold">3</div>
                        <p className="text-xs text-muted-foreground mt-2">停滯超過 14 天</p>
                    </div>
                    <div className="p-6 bg-card border border-border shadow-sm rounded-xl hover:border-primary/50 transition-colors">
                        <h3 className="font-medium text-sm text-muted-foreground mb-2 flex items-center">
                            <CheckCircle2 className="w-4 h-4 mr-1 text-green-500" />
                            已成交金額
                        </h3>
                        <div className="text-3xl font-bold">NT$ 2.4M</div>
                        <p className="text-xs text-muted-foreground mt-2">超越去年同期 12%</p>
                    </div>
                </div>

                <div className="bg-card border rounded-xl p-6 shadow-sm">
                    <h3 className="text-lg font-bold mb-4">最近商機動態</h3>
                    <p className="text-muted-foreground text-sm">此區塊將顯示您負責的商機狀態變更。請前往<Link href="/opportunities"><a className="text-primary hover:underline ml-1">商機管理</a></Link>查看所有項目。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">管理員儀表板 (Admin Dashboard)</h2>
                <p className="text-muted-foreground mt-1">系統全局概覽與使用者狀態</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-6 bg-card border border-border shadow-sm rounded-xl">
                    <h3 className="font-medium text-sm text-muted-foreground flex items-center justify-between">
                        待指派商機
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </h3>
                    <div className="text-2xl font-bold mt-2">12</div>
                    <p className="text-xs text-muted-foreground mt-1 text-blue-500">+2% from last month</p>
                </div>

                <div className="p-6 bg-card border border-border shadow-sm rounded-xl">
                    <h3 className="font-medium text-sm text-muted-foreground flex items-center justify-between">
                        執行中 SR
                        <Users className="h-4 w-4 text-green-500" />
                    </h3>
                    <div className="text-2xl font-bold mt-2">8</div>
                    <p className="text-xs text-muted-foreground mt-1 text-green-500">+18% from last month</p>
                </div>
            </div>

            <div className="mt-8">
                <h3 className="text-xl font-bold mb-4">最新活躍使用者 (API 連線測試)</h3>
                {isLoading ? (
                    <div className="text-center py-10 text-muted-foreground">載入中... (Loading users)</div>
                ) : (
                    <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">姓名</th>
                                    <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">Email</th>
                                    <th className="px-5 py-3.5 text-left font-medium text-muted-foreground">主角色</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {usersData?.items?.map((u: any) => (
                                    <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-5 py-3 font-medium">{u.name}</td>
                                        <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                                        <td className="px-5 py-3">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary capitalize">
                                                {u.role}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
