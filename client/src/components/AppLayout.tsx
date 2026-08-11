import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
    KeyRound,
    LogOut,
    Menu,
    Search,
    Settings,
    Settings2,
    SlidersHorizontal,
    ShieldCheck,
    ShieldAlert,
    TrendingUp,
    Users,
    X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useMsal } from "@azure/msal-react";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useAuth } from "../lib/auth";
import { trpc } from "../lib/trpc";
import type { FeaturePermission, Role } from "../../../shared/types";
import { usePlatformConfiguration } from "../lib/usePlatformConfiguration";

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
    permission?: FeaturePermission;
    badge?: "notifications";
    platformOwnerOnly?: boolean;
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
            { icon: Building2, label: "商機管理", href: "/opportunities", roles: ["admin", "manager", "business", "presales", "tech", "pm"], permission: "module.opportunities.view" },
            { icon: Clock, label: "協銷工時", href: "/presales-timesheets", roles: ["admin", "manager", "presales", "tech", "pm"] },
        ],
    },
    {
        key: "delivery",
        label: "專案 / 工時",
        items: [
            { icon: LayoutDashboard, label: "專案總表", href: "/pm-dashboard", roles: ["admin", "manager", "pm", "presales"] },
            { icon: FolderKanban, label: "專案管理", href: "/projects", roles: ["admin", "manager", "pm", "tech", "presales"], permission: "module.projects.view" },
            { icon: Clock, label: "專案工時", href: "/project-timesheets", roles: ["admin", "manager", "pm", "tech", "presales"] },
            { icon: FileCheck, label: "變更單 (CR)", href: "/change-requests", roles: ["admin", "manager", "pm", "tech", "presales", "business"] },
        ],
    },
    {
        key: "schedule",
        label: "排程",
        items: [
            { icon: CalendarDays, label: "排程行事曆", href: "/calendar", roles: ["admin", "manager", "pm", "tech", "presales"], permission: "module.calendar.view" },
        ],
    },
    {
        key: "people",
        label: "人力管理",
        items: [
            { icon: Users, label: "資源池", href: "/resources", roles: ["admin", "manager"] },
            { icon: Activity, label: "稼動率", href: "/utilization", roles: ["admin", "manager"] },
        ],
    },
    {
        key: "kpiReports",
        label: "KPI / 報表",
        items: [
            { icon: TrendingUp, label: "KPI 達成儀表板", href: "/kpi", roles: ["admin", "manager"] },
            { icon: FileText, label: "報表中心", href: "/reports", roles: ["admin", "manager", "business"] },
        ],
    },
    {
        key: "settlement",
        label: "結算",
        items: [
            { icon: FileSpreadsheet, label: "認列結算中心", href: "/settlements", roles: ["admin", "manager", "business"] },
        ],
    },
    {
        key: "formula",
        label: "公式設定",
        items: [
            { icon: CreditCard, label: "費率設定", href: "/cost-rates", roles: ["admin", "manager"] },
            { icon: Settings2, label: "自訂欄位", href: "/custom-fields", platformOwnerOnly: true },
            { icon: TrendingUp, label: "利潤中心公式", href: "/formula/profit-center", platformOwnerOnly: true },
        ],
    },
    {
        key: "system",
        label: "系統管理",
        items: [
            { icon: Settings, label: "帳號管理", href: "/users", roles: ["admin"] },
            { icon: ShieldAlert, label: "指派資料檢查", href: "/assignment-integrity", roles: ["admin"] },
            { icon: Building2, label: "公司管理", href: "/companies", roles: ["admin"] },
            { icon: Settings, label: "系統設定", href: "/system-settings", platformOwnerOnly: true },
            { icon: SlidersHorizontal, label: "平台控制中心", href: "/platform-control", platformOwnerOnly: true },
            { icon: ShieldCheck, label: "Audit 稽核中心", href: "/audit", platformOwnerOnly: true },
        ],
    },
];

const topNavItems: TopNavItem[] = [
    { label: "首頁", href: "/", helper: "返回儀表板總覽" },
    { label: "通知中心", href: "/notifications", helper: "查看系統通知與提醒" },
    { label: "系統設定", href: "/system-settings", helper: "維護平台設定" },
    { label: "公司資訊", helper: "內容建置中，暫不提供頁面", disabled: true },
];

export function AppLayout({ children }: AppLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [location] = useLocation();
    const { instance } = useMsal();
    const { clearAuth } = useAuth();
    const { user, hasPermission } = useCurrentUser();
    const { i18n } = useTranslation();
    const { data: notifications } = trpc.analytics.getNotifications.useQuery(
        { limit: 20 },
        { staleTime: 30_000, refetchOnWindowFocus: true }
    );
    const { data: settings } = trpc.system.getPublicSettings.useQuery(undefined, {
        staleTime: 300_000,
    });
    const platform = usePlatformConfiguration();
    const trackLogout = trpc.audit.trackLogout.useMutation();
    const companyName = settings?.companyName || "PMP System";
    const brandName = platform.getString("text.brandName", "PMPS");
    const brandSubtitle = platform.getString("text.brandSubtitle", "專案管理平台");
    const sidebarWidth = platform.getNumber("layout.sidebarWidth", 288);
    const compactSidebarWidth = platform.getNumber("layout.compactSidebarWidth", 80);
    const contentMaxWidth = platform.getNumber("layout.contentMaxWidth", 1600);
    const pagePadding = platform.getNumber("layout.pagePadding", 24);
    const fontScale = platform.getNumber("layout.fontScale", 1);
    const dialogSize = platform.getString("layout.dialogSize", "lg");
    const unreadCount = notifications?.filter((item) => !item.isRead).length ?? 0;

    const hasRole = (role: string) =>
        !!user && user.role === role;

    const visibleNavGroups = navGroups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) =>
                item.platformOwnerOnly && !user?.isPlatformOwner
                    ? false
                    : item.permission
                    ? hasPermission(item.permission, (item.roles || []) as Role[])
                    : !item.roles || item.roles.length === 0 || item.roles.some(hasRole)
            )
        }))
        .filter((group) => group.items.length > 0);

    const visibleTopNavItems = topNavItems.filter(
        (item) => item.href !== "/system-settings" || user?.isPlatformOwner
    );

    useEffect(() => {
        const root = document.documentElement;
        const previous = root.style.fontSize;
        const previousDialogWidth = root.style.getPropertyValue("--pmps-dialog-max-width");
        const dialogWidths: Record<string, string> = { sm: "24rem", md: "28rem", lg: "32rem", xl: "48rem", full: "calc(100vw - 2rem)" };
        root.style.fontSize = `${16 * Math.min(1.25, Math.max(0.85, fontScale))}px`;
        root.style.setProperty("--pmps-dialog-max-width", dialogWidths[dialogSize] || dialogWidths.lg);
        return () => {
            root.style.fontSize = previous;
            if (previousDialogWidth) root.style.setProperty("--pmps-dialog-max-width", previousDialogWidth);
            else root.style.removeProperty("--pmps-dialog-max-width");
        };
    }, [dialogSize, fontScale]);

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
        try {
            await trackLogout.mutateAsync();
        } catch {
            // Audit failure must not block logout.
        }
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
                            <span className="truncate">{platform.getString(`text.nav.${item.href.replace(/[^A-Za-z0-9]+/g, "_")}`, item.label)}</span>
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
                    {(sidebarOpen || mobile) && <span className="font-bold text-primary truncate">{brandName}</span>}
                    {(sidebarOpen || mobile) && <p className="text-[11px] text-muted-foreground mt-0.5">{brandSubtitle}</p>}
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
                                        <span>{platform.getString(`text.navGroup.${group.key}`, group.label)}</span>
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
                className="hidden md:flex bg-card border-r border-border shadow-sm transition-all duration-300 flex-col relative z-20"
                style={{ width: sidebarOpen ? sidebarWidth : compactSidebarWidth }}
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
                            {visibleTopNavItems.filter(i => !i.disabled).map((item) => (
                                <Link key={item.href} href={item.href!}>
                                    <a
                                        className={cn(
                                            "rounded-full px-3 py-1 text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground",
                                            location === item.href && "bg-primary text-primary-foreground"
                                        )}
                                        title={item.helper}
                                    >
                                        {platform.getString(`text.topNav.${item.href?.replace(/[^A-Za-z0-9]+/g, "_") || "item"}`, item.label)}
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
                        <button type="button" onClick={() => setGlobalSearchOpen(true)} className="hidden sm:flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted font-medium bg-muted/30">
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

                            {profileMenuOpen && createPortal(
                                <>
                                <button
                                    type="button"
                                    aria-label="關閉使用者選單"
                                    className="fixed inset-0 z-[190] cursor-default"
                                    onClick={() => setProfileMenuOpen(false)}
                                />
                                <div className="fixed right-4 top-16 z-[200] w-64 rounded-xl border border-border bg-popover p-2 shadow-xl">
                                    <div className="rounded-lg px-3 py-2 bg-muted/50">
                                        <div className="text-sm font-semibold">{user?.name || "使用者"}</div>
                                        <div className="text-xs text-muted-foreground mt-1 break-all">{user?.email || "載入中..."}</div>
                                        <div className="mt-2 text-[11px] text-muted-foreground">目前角色：{user?.role || "—"}</div>
                                    </div>
                                    <div className="mt-2 space-y-1">
                                        {user?.isPlatformOwner && (
                                            <Link href="/system-settings">
                                                <a className="flex items-center rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                                                    <Settings className="mr-2 h-4 w-4" />
                                                    系統設定
                                                </a>
                                            </Link>
                                        )}
                                        {user?.isPlatformOwner && (
                                            <Link href="/platform-control">
                                                <a className="flex items-center rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                                                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                                                    平台控制中心
                                                </a>
                                            </Link>
                                        )}
                                        <Link href="/account-security">
                                            <a className="flex items-center rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                                                <KeyRound className="mr-2 h-4 w-4" />
                                                帳號安全
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
                                </>,
                                document.body
                            )}
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto bg-muted/20" style={{ padding: pagePadding }}>
                    <div className="mx-auto w-full" style={{ maxWidth: contentMaxWidth > 0 ? contentMaxWidth : undefined }}>
                        {children}
                    </div>
                </main>
            </div>
            <GlobalSearch open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
        </div>
    );
}
