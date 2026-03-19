import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
    Building2,
    Users,
    Clock,
    FileText,
    LayoutDashboard,
    Settings,
    PieChart,
    CalendarDays,
    Menu,
    FileCheck,
    CreditCard,
    Activity,
    FileSpreadsheet,
    Bell,
    Settings2,
    FolderKanban,
    LogOut
} from "lucide-react";
import { cn } from "../lib/utils";
import { useMsal } from "@azure/msal-react";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useAuth } from "../lib/auth";

interface AppLayoutProps {
    children: React.ReactNode;
}

const navItems = [
    { icon: LayoutDashboard, label: "儀表板", href: "/" },
    { icon: Building2, label: "商機管理", href: "/opportunities" },
    { icon: FolderKanban, label: "專案管理", href: "/projects", roles: ["manager", "pm"] },
    { icon: Users, label: "資源池", href: "/resources" },
    { icon: Settings, label: "帳號管理", href: "/users" },
    { icon: CreditCard, label: "費率設定", href: "/cost-rates" },
    { icon: Activity, label: "稼動率", href: "/utilization" },
    { icon: Clock, label: "協銷工時", href: "/presales-timesheets" },
    { icon: CalendarDays, label: "專案工時", href: "/project-timesheets" },
    { icon: FileText, label: "服務請求 (SR)", href: "/service-requests" },
    { icon: FileCheck, label: "變更單 (CR)", href: "/change-requests" },
    { icon: PieChart, label: "KPI 儀表板", href: "/kpi" },
    { icon: FileSpreadsheet, label: "月度結算", href: "/settlements" },
    { icon: Bell, label: "通知中心", href: "/notifications" },
    { icon: Settings2, label: "自訂欄位", href: "/custom-fields" },
    { icon: Settings, label: "系統設定", href: "/system-settings" },
];

export function AppLayout({ children }: AppLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [location] = useLocation();
    const { instance } = useMsal();
    const { clearAuth } = useAuth();
    const { user } = useCurrentUser();

    const visibleNavItems = navItems.filter((item) => {
        if (!item.roles || item.roles.length === 0) {
            return true;
        }

        return item.roles.some((role) => user && (user.role === role || user.roles.includes(role as never)));
    });

    const handleLogout = async () => {
        clearAuth();
        // 如果有 MSAL 會話，也進行登出
        try {
            await instance.logoutPopup();
        } catch {
            // popup blocked or failed, fallback to reload
        }
        window.location.href = "/login";
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex">
            {/* Sidebar */}
            <aside
                className={cn(
                    "bg-card border-r border-border transition-all duration-300 flex flex-col",
                    sidebarOpen ? "w-64" : "w-16"
                )}
            >
                <div className="h-14 flex items-center justify-between px-4 border-b border-border">
                    {sidebarOpen && <span className="font-bold text-primary truncate">Dispatch System</span>}
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                        <Menu className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto py-4 space-y-1">
                    {visibleNavItems.map((item) => (
                        <Link key={item.href} href={item.href}>
                            <a className={cn(
                                "flex items-center px-4 py-2 mx-2 rounded-md transition-colors",
                                location === item.href
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                !sidebarOpen && "justify-center px-0"
                            )}>
                                <item.icon className={cn("w-5 h-5 flex-shrink-0", sidebarOpen && "mr-3")} />
                                {sidebarOpen && <span className="truncate">{item.label}</span>}
                            </a>
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-border">
                    <div className={cn("flex items-center", !sidebarOpen && "justify-center")}>
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {(user?.name?.[0] || user?.email?.[0] || "U").toUpperCase()}
                        </div>
                        {sidebarOpen && (
                            <div className="ml-3 flex-1">
                                <p className="text-sm font-medium leading-none">{user?.name || "使用者"}</p>
                                <p className="text-xs text-muted-foreground mt-1">{user?.role || "loading"}</p>
                            </div>
                        )}
                        {sidebarOpen && (
                            <button onClick={handleLogout} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-red-500 transition-colors" title="登出">
                                <LogOut className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top Navbar */}
                <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6">
                    <div className="flex items-center space-x-6">
                        <Link href="/"><a className="text-sm font-medium text-foreground hover:text-primary transition-colors">首頁</a></Link>
                        <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">關於我們</button>
                        <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">聯絡方式</button>
                    </div>
                    <div className="flex justify-end">
                        <div className="text-sm text-muted-foreground">
                            {user ? `${user.name} · ${user.role}` : "載入使用者資訊中..."}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-auto p-6 bg-muted/20">
                    {children}
                </main>
            </div>
        </div>
    );
}
