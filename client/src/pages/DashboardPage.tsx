import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, Clock3, FolderKanban, Search, TrendingUp, Users } from "lucide-react";
import { useCurrentUser } from "../lib/useCurrentUser";
import { cn } from "../lib/utils";

export function DashboardPage() {
    const { user, hasRole } = useCurrentUser();
    const isAdminLike = hasRole("admin") || hasRole("manager");
    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "email" | "role">("name");
    const { data: usersData, isLoading } = trpc.users.list.useQuery(
        { limit: 8, search: searchTerm, sortBy, sortOrder: "asc" },
        { enabled: isAdminLike }
    );
    const { data: activeProjects } = trpc.projects.getActiveProjectCount.useQuery(undefined, { enabled: isAdminLike });
    const { data: activeOpps } = trpc.opportunities.getActiveOpportunityCount.useQuery(undefined, { enabled: isAdminLike });
    const { data: notifications } = trpc.analytics.getNotifications.useQuery(
        { limit: 20 },
        { enabled: !!user }
    );

    const unreadNotifications = notifications?.filter((item) => !item.isRead) ?? [];
    const approvalNotifications = unreadNotifications.filter((item) => item.type === "approval");
    const todoNotifications = unreadNotifications.filter((item) => item.type === "todo");
    const warningNotifications = unreadNotifications.filter((item) => item.type === "warning");
    const managementCards = useMemo(() => [
        {
            label: "待審核 / 待核准",
            value: approvalNotifications.length,
            helper: "包含 WBS 與流程核准提醒",
            href: "/notifications",
            icon: CheckCircle2,
            tone: "text-emerald-600"
        },
        {
            label: "待辦事項",
            value: todoNotifications.length,
            helper: "建議優先處理的工作項目",
            href: hasRole("presales") || hasRole("tech") ? "/project-timesheets" : "/notifications",
            icon: Clock3,
            tone: "text-indigo-600"
        },
        {
            label: "風險 / 警示",
            value: warningNotifications.length,
            helper: "需要立即關注的異常或提醒",
            href: "/notifications",
            icon: AlertTriangle,
            tone: "text-amber-600"
        }
    ], [approvalNotifications.length, todoNotifications.length, warningNotifications.length, hasRole]);

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

                <div className="grid gap-4 md:grid-cols-3">
                    {managementCards.map((card) => (
                        <Link key={card.label} href={card.href}>
                            <a className="rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-muted-foreground">{card.label}</div>
                                        <div className="mt-2 text-2xl font-bold">{card.value}</div>
                                    </div>
                                    <card.icon className={`h-5 w-5 ${card.tone}`} />
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">{card.helper}</p>
                            </a>
                        </Link>
                    ))}
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
                    <div className="text-2xl font-bold mt-2">{activeOpps?.count ?? 0} <span className="text-sm font-normal text-muted-foreground">筆</span></div>
                    <p className="text-xs text-muted-foreground mt-1 text-blue-500">請前往商機管理進行排序與篩選</p>
                </div>

                <div className="p-6 bg-card border border-border shadow-sm rounded-xl">
                    <h3 className="font-medium text-sm text-muted-foreground flex items-center justify-between">
                        執行中專案
                        <Users className="h-4 w-4 text-green-500" />
                    </h3>
                    <div className="text-2xl font-bold mt-2">{activeProjects?.count ?? 0} <span className="text-sm font-normal text-muted-foreground">個</span></div>
                    <p className="text-xs text-muted-foreground mt-1 text-green-500">專案列表已依帳號權限過濾</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {managementCards.map((card) => (
                    <Link key={card.label} href={card.href}>
                        <a className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/40 hover:-translate-y-1">
                            <div className="relative z-10 flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</div>
                                    <div className="mt-3 text-4xl font-black tracking-tight">{card.value}</div>
                                </div>
                                <div className={cn("rounded-2xl p-3 bg-muted/50", card.tone.replace('text-', 'bg-').replace('600', '100').replace('500', '100'))}>
                                    <card.icon className={cn("h-6 w-6", card.tone)} />
                                </div>
                            </div>
                            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">{card.helper}</p>
                            <div className={cn("absolute bottom-0 left-0 h-1.5 w-0 bg-primary transition-all duration-500 group-hover:w-full", card.tone.replace('text-', 'bg-'))} />
                        </a>
                    </Link>
                ))}
            </div>

            <div className="mt-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
                    <div>
                        <h3 className="text-xl font-bold">最新活躍使用者</h3>
                        <p className="text-sm text-muted-foreground mt-1">可直接搜尋姓名、信箱，並切換排序欄位。</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative min-w-[240px]">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="搜尋使用者..."
                                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </div>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as "name" | "email" | "role")}
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            <option value="name">依姓名排序</option>
                            <option value="email">依 Email 排序</option>
                            <option value="role">依角色排序</option>
                        </select>
                    </div>
                </div>
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
