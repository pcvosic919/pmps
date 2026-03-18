import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import { CheckCircle2, TrendingUp, Users, FolderKanban, Clock3 } from "lucide-react";
import { useCurrentUser } from "../lib/useCurrentUser";

export function DashboardPage() {
    const { user, hasRole } = useCurrentUser();
    const isAdminLike = hasRole("admin") || hasRole("manager");
    const { data: usersData, isLoading } = trpc.users.list.useQuery(
        { limit: 5 },
        { enabled: isAdminLike }
    );

    if (!user) {
        return <div className="p-8 text-center text-muted-foreground">載入使用者資訊中...</div>;
    }

    if (!isAdminLike) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{user.name} 的工作台</h2>
                    <p className="text-muted-foreground mt-1">依您的帳號權限顯示個人可存取的商機、專案與工時入口</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <Link href="/opportunities">
                        <a className="p-6 bg-card border border-border shadow-sm rounded-xl hover:border-primary/50 transition-colors">
                            <h3 className="font-medium text-sm text-muted-foreground mb-2 flex items-center">
                                <TrendingUp className="w-4 h-4 mr-1 text-primary" />
                                我的商機 / 協作商機
                            </h3>
                            <div className="text-lg font-bold">查看商機管理</div>
                            <p className="text-xs text-muted-foreground mt-2">追蹤自己可存取的商機與協銷進度</p>
                        </a>
                    </Link>
                    <Link href="/projects">
                        <a className="p-6 bg-card border border-border shadow-sm rounded-xl hover:border-primary/50 transition-colors">
                            <h3 className="font-medium text-sm text-muted-foreground mb-2 flex items-center">
                                <FolderKanban className="w-4 h-4 mr-1 text-primary" />
                                我的專案
                            </h3>
                            <div className="text-lg font-bold">查看專案管理</div>
                            <p className="text-xs text-muted-foreground mt-2">依您的帳號顯示可查看與可填報的專案</p>
                        </a>
                    </Link>
                    <Link href={hasRole("presales") || hasRole("tech") ? "/project-timesheets" : "/notifications"}>
                        <a className="p-6 bg-card border border-border shadow-sm rounded-xl hover:border-primary/50 transition-colors">
                            <h3 className="font-medium text-sm text-muted-foreground mb-2 flex items-center">
                                <Clock3 className="w-4 h-4 mr-1 text-primary" />
                                我的待辦
                            </h3>
                            <div className="text-lg font-bold">前往常用入口</div>
                            <p className="text-xs text-muted-foreground mt-2">快速進入工時填報、通知與專案作業</p>
                        </a>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">管理儀表板</h2>
                <p className="text-muted-foreground mt-1">系統全局概覽與使用者狀態</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-6 bg-card border border-border shadow-sm rounded-xl">
                    <h3 className="font-medium text-sm text-muted-foreground flex items-center justify-between">
                        待關注商機
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </h3>
                    <div className="text-2xl font-bold mt-2">即時查看</div>
                    <p className="text-xs text-muted-foreground mt-1 text-blue-500">請前往商機管理進行排序與篩選</p>
                </div>

                <div className="p-6 bg-card border border-border shadow-sm rounded-xl">
                    <h3 className="font-medium text-sm text-muted-foreground flex items-center justify-between">
                        執行中專案
                        <Users className="h-4 w-4 text-green-500" />
                    </h3>
                    <div className="text-2xl font-bold mt-2">依權限顯示</div>
                    <p className="text-xs text-muted-foreground mt-1 text-green-500">專案列表已依帳號權限過濾</p>
                </div>
            </div>

            <div className="mt-8">
                <h3 className="text-xl font-bold mb-4">最新活躍使用者</h3>
                {isLoading ? (
                    <div className="text-center py-10 text-muted-foreground">載入中...</div>
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

            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-bold mb-4 flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-primary" />管理建議</h3>
                <p className="text-sm text-muted-foreground">
                    請持續檢查商機轉案後是否已鎖定、WBS 是否僅由主管審核，以及月結後工時是否禁止異動。
                </p>
            </div>
        </div>
    );
}
