import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { GlobalSearch } from "./GlobalSearch";
import {
    Activity,
    Bell,
    Building2,
    CalendarDays,
    ChevronDown,
    Clock,
    CreditCard,
    FileCheck,
    FileSpreadsheet,
    FileText,
    FolderKanban,
    Globe,
    LayoutDashboard,
    LogOut,
    Menu,
    PieChart,
    Search,
    Settings,
    Settings2,
    TrendingUp,
    Users,
    X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useMsal } from "@azure/msal-react";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useAuth } from "../lib/auth";
import { trpc } from "../lib/trpc";

interface AppLayoutProps {
    children: React.ReactNode;
}

type TopNavItem = {
    label: string;
    helper: string;
    href?: string;
    disabled?: boolean;
};

type NavItem = {
    icon: typeof LayoutDashboard;
    label: string;
    href: string;
    roles?: string[];
    badge?: "notifications";
};

type NavGroup = {
    key: string;
    label: string;
    items: NavItem[];
};

const navGroups: NavGroup[] = [
    {
        key: "workspace",
        label: "工作台",
        items: [
            { icon: LayoutDashboard, label: "儀表板", href: "/" },
            { icon: Bell, label: "通知中心", href: "/notifications", badge: "notifications" },
        ],
    },
    {
        key: "sales",
        label: "商機 / 售前",
        items: [
            // Business 只能看到商機管理? Business 可以看協銷工時嗎?
            { icon: Building2, label: "商機管理", href: "/opportunities", roles: ["admin", "manager", "business", "presales", "tech", "pm"] },
            { icon: Clock, label: "協銷工時", href: "/presales-timesheets", roles: ["admin", "manager", "presales", "tech", "pm"] },
        ],
    },
    {
        key: "delivery",
        label: "專案 / 工時",
        items: [
            { icon: LayoutDashboard, label: "專案總表", href: "/pm-dashboard", roles: ["admin", "manager", "pm"] },
            { icon: FolderKanban, label: "專案管理", href: "/projects", roles: ["admin", "manager", "pm", "tech"] },
            { icon: CalendarDays, label: "排程行事曆", href: "/calendar", roles: ["admin", "manager", "pm", "tech"] },
            { icon: Clock, label: "專案工時", href: "/project-timesheets", roles: ["admin", "manager", "pm", "tech"] },
            { icon: FileCheck, label: "變更單 (CR)", href: "/change-requests", roles: ["admin", "manager", "pm", "tech"] },
        ],
    },
    {
        key: "analytics",
        label: "分析 / 結算",
        items: [
            { icon: Users, label: "資源池", href: "/resources", roles: ["admin", "manager"] },
            { icon: Activity, label: "稼動率", href: "/utilization", roles: ["admin", "manager"] },
            { icon: PieChart, label: "KPI 儀表板", href: "/kpi", roles: ["admin", "manager"] },
            { icon: FileSpreadsheet, label: "月度結算", href: "/settlements", roles: ["admin", "manager"] },
            { icon: FileText, label: "自訂報表", href: "/reports", roles: ["admin", "manager"] },
        ],
    },
    {
        key: "formula",
        label: "公式設定",
        items: [
            { icon: CreditCard, label: "費率設定", href: "/cost-rates", roles: ["admin", "manager"] },
            { icon: Settings2, label: "自訂欄位", href: "/custom-fields", roles: ["admin", "manager"] },
            { icon: TrendingUp, label: "利潤中心公式", href: "/system-settings", roles: ["admin", "manager"] },
        ],
    },
    {
        key: "system",
        label: "系統管理",
        items: [
            { icon: Settings, label: "帳號管理", href: "/users", roles: ["admin"] },
            { icon: Settings, label: "系統設定", href: "/system-settings", roles: ["admin"] },
        ],
    },
];

const topNavItems: TopNavItem[] = [
    { label: "首頁", href: "/", helper: "返回儀表板總覽" },
    { label: "通知中心", href: "/notifications", helper: "查看系統通知與提醒" },
    { label: "系統設定", href: "/system-settings", helper: "維護平台設定" },
    { label: "公司資訊", helper: "內容建置中，暫不提供頁面", disabled: true },
];

const isNavItemVisible = (item: NavItem, roleMatcher: (role: string) => boolean) =>
    !item.roles || item.roles.length === 0 || item.roles.some(roleMatcher);

export function AppLayout({ children }: AppLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [location] = useLocation();
    const { instance } = useMsal();
    const { clearAuth } = useAuth();
    const { user } = useCurrentUser();
    const { i18n } = useTranslation();
    const { data: notifications } = trpc.analytics.getNotifications.useQuery(
        { limit: 20 },
        { staleTime: 30_000, refetchOnWindowFocus: true }
    );
    const { data: settings } = trpc.system.getSettings.useQuery(undefined, {
        staleTime: 300_000,
    });
    const companyName = settings?.companyName || "PMP System";
    const unreadCount = notifications?.filter((item) => !item.isRead).length ?? 0;

    const hasRole = (role: string) =>
        !!user && (user.role === role || user.roles.includes(role as never));

    const visibleNavGroups = navGroups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => isNavItemVisible(item, hasRole))
        }))
        .filter((group) => group.items.length > 0);

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(navGroups.map((group) => [group.key, true]))
    );

    useEffect(() => {
        setExpandedGroups((current) => {
            const next = { ...current };
            for (const group of visibleNavGroups) {
                if (group.items.some((item) => item.href === location)) {
                    next[group.key] = true;
                } else if (!(group.key in next)) {
                    next[group.key] = true;
                }
            }
            return next;
        });
    }, [location, visibleNavGroups]);

    useEffect(() => {
        setMobileSidebarOpen(false);
        setProfileMenuOpen(false);
    }, [location]);

    const handleLogout = async () => {
        clearAuth();
        try {
            await instance.logoutPopup();
        } catch {
            // popup blocked or failed, fallback to reload
        }
        window.location.href = "/login";
    };

    const renderNavItem = (item: NavItem, compact = false) => {
        const isActive = location === item.href;
        const badgeCount = item.badge === "notifications" ? unreadCount : 0;

        return (
            <Link key={item.href} href={item.href}>
                <a
                    className={cn(
                        "flex items-center rounded-lg transition-all duration-200 group",
                        compact
                            ? "justify-center px-0 py-2.5"
                            : "mx-2 px-4 py-2",
                        isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                >
                    <item.icon className={cn("h-5 w-5 flex-shrink-0", !compact && "mr-3")} />
                    {!compact && (
                        <>
                            <span className="truncate">{item.label}</span>
                            {badgeCount > 0 && (
                                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                                    {badgeCount > 99 ? "99+" : badgeCount}
                                </span>
                            )}
                        </>
                    )}
                </a>
            </Link>
        );
    };

    const renderSidebarContent = (mobile = false) => (
        <>
            <div className="h-14 flex items-center justify-between px-4 border-b border-border">
                <div className="min-w-0">
                    {(sidebarOpen || mobile) && <span className="font-bold text-primary truncate">Dispatch System</span>}
                    {(sidebarOpen || mobile) && <p className="text-[11px] text-muted-foreground mt-0.5">依角色顯示可存取模組</p>}
                </div>
                <button
                    onClick={() => mobile ? setMobileSidebarOpen(false) : setSidebarOpen(!sidebarOpen)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                    aria-label={mobile ? "關閉導覽" : "切換導覽列"}
                >
                    {mobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-4 space-y-4">
                {visibleNavGroups.map((group) => {
                    const isExpanded = expandedGroups[group.key] ?? true;
                    return (
                        <div key={group.key}>
                            {(sidebarOpen || mobile) ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !isExpanded }))}
                                        className="w-full px-4 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 flex items-center justify-between"
                                    >
                                        <span>{group.label}</span>
                                        <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                                    </button>
                                    {isExpanded && (
                                        <div className="mt-2 space-y-1">
                                            {group.items.map((item) => renderNavItem(item))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-1">
                                    {group.items.map((item) => renderNavItem(item, true))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-border">
                <div className={cn("flex items-center", !sidebarOpen && !mobile && "justify-center")}>
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                        {(user?.name?.[0] || user?.email?.[0] || "U").toUpperCase()}
                    </div>
                    {(sidebarOpen || mobile) && (
                        <div className="ml-3 min-w-0">
                            <p className="text-sm font-medium leading-none truncate">{user?.name || "使用者"}</p>
                            <p className="text-xs text-muted-foreground mt-1 truncate">{user?.role || "loading"}</p>
                        </div>
                    )}
                    {(sidebarOpen || mobile) && unreadCount > 0 && (
                        <span className="ml-auto rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                            {unreadCount} 則未讀
                        </span>
                    )}
                </div>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-background text-foreground flex">
            {mobileSidebarOpen && (
                <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
            )}

            <aside
                className={cn(
                    "hidden md:flex bg-card border-r border-border shadow-sm transition-all duration-300 flex-col relative z-20",
                    sidebarOpen ? "w-72" : "w-20"
                )}
            >
                {renderSidebarContent()}
            </aside>

            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-card border-r border-border shadow-xl transition-transform duration-300 md:hidden flex flex-col",
                    mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {renderSidebarContent(true)}
            </aside>

            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                <header className="min-h-14 bg-card/95 backdrop-blur-sm border-b border-border px-4 md:px-6 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between sticky top-0 z-10 shadow-sm">
                    <div className="flex items-start gap-3 md:items-center md:flex-1 md:min-w-0">
                        <button
                            type="button"
                            onClick={() => setMobileSidebarOpen(true)}
                            className="md:hidden rounded-md border border-border p-2 text-muted-foreground hover:bg-muted"
                            aria-label="開啟導覽"
                        >
                            <Menu className="h-5 w-5" />
                        </button>

                        <div className="flex flex-wrap items-center gap-2 md:gap-3">
                                <span
                                    key="company-info"
                                    className="inline-flex items-center gap-2 rounded-full border border-border bg-primary/5 px-3 py-1 text-sm font-semibold text-primary"
                                >
                                    <Building2 className="h-4 w-4" />
                                    {companyName}
                                </span>
                            {topNavItems.filter(i => !i.disabled).map((item) => (
                                <Link key={item.href} href={item.href!}>
                                    <a
                                        className={cn(
                                            "rounded-full px-3 py-1 text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground",
                                            location === item.href && "bg-primary text-primary-foreground"
                                        )}
                                        title={item.helper}
                                    >
                                        {item.label}
                                    </a>
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:justify-end">
                        <button
                            onClick={() => {
                                const nextLng = i18n.language === 'en' ? 'zh' : 'en';
                                i18n.changeLanguage(nextLng);
                                localStorage.setItem("pmp_language", nextLng);
                            }}
                            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted font-medium"
                        >
                            <Globe className="h-4 w-4" />
                            <span className="hidden sm:inline font-bold">{i18n.language.startsWith('en') ? 'EN' : '中文'}</span>
                        </button>
                        <button onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))} className="hidden sm:flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted font-medium bg-muted/30">
                            <Search className="h-4 w-4" />
                            <span className="text-xs border border-border/60 bg-background px-1 py-0.5 rounded shadow-sm opacity-80">⌘K</span>
                        </button>
                        <Link href="/notifications">
                            <a className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                                <Bell className="h-4 w-4" />
                                <span>通知</span>
                                {unreadCount > 0 && (
                                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                                        {unreadCount > 99 ? "99+" : unreadCount}
                                    </span>
                                )}
                            </a>
                        </Link>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setProfileMenuOpen((current) => !current)}
                                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 hover:bg-muted"
                            >
                                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-semibold text-primary">
                                    {(user?.name?.[0] || user?.email?.[0] || "U").toUpperCase()}
                                </div>
                                <div className="hidden sm:block text-left">
                                    <div className="text-sm font-medium leading-none">{user?.name || "使用者"}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{user?.role || "載入中"}</div>
                                </div>
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </button>

                            {profileMenuOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-xl border border-border bg-popover p-2 shadow-xl">
                                    <div className="rounded-lg px-3 py-2 bg-muted/50">
                                        <div className="text-sm font-semibold">{user?.name || "使用者"}</div>
                                        <div className="text-xs text-muted-foreground mt-1 break-all">{user?.email || "載入中..."}</div>
                                        <div className="mt-2 text-[11px] text-muted-foreground">目前角色：{user?.role || "—"}</div>
                                    </div>
                                    <div className="mt-2 space-y-1">
                                        <Link href="/system-settings">
                                            <a className="flex items-center rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                                                <Settings className="mr-2 h-4 w-4" />
                                                系統設定
                                            </a>
                                        </Link>
                                        <Link href="/notifications">
                                            <a className="flex items-center rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                                                <Bell className="mr-2 h-4 w-4" />
                                                通知中心
                                            </a>
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                        >
                                            <LogOut className="mr-2 h-4 w-4" />
                                            登出
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-4 md:p-6 bg-muted/20">
                    {children}
                </main>
            </div>
            <GlobalSearch />
        </div>
    );
}
