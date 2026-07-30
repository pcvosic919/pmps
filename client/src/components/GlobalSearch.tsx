import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Activity, Building2, FileSpreadsheet, FileText, FolderKanban, Search, Settings, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useCurrentUser } from "../lib/useCurrentUser";
import type { FeaturePermission, Role } from "../../../shared/types";

type GlobalSearchProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const routes = [
    { href: "/opportunities", icon: Building2, label: "商機管理 (Opportunities)", roles: ["admin", "manager", "business", "presales", "tech", "pm"], permission: "module.opportunities.view" as FeaturePermission },
    { href: "/projects", icon: FolderKanban, label: "專案管理 (Projects)", roles: ["admin", "manager", "pm", "tech"], permission: "module.projects.view" as FeaturePermission },
    { href: "/service-requests", icon: FileText, label: "服務請求管理 (SR/WBS)", roles: ["admin", "manager", "pm", "tech"] },
    { href: "/resources", icon: Users, label: "服務資源與技能矩陣 (Resources)", roles: ["admin", "manager"] },
    { href: "/kpi", icon: Activity, label: "KPI 達成率儀表板", roles: ["admin", "manager"] },
    { href: "/reports", icon: FileText, label: "自訂報表 / Excel 匯出", roles: ["admin", "manager"] },
    { href: "/settlements", icon: FileSpreadsheet, label: "月度結算與成本分攤", roles: ["admin", "manager"] },
    { href: "/system-settings", icon: Settings, label: "系統設定與整合 (Settings)", roles: ["admin"] }
];

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
    const [query, setQuery] = useState("");
    const [, setLocation] = useLocation();
    const { hasPermission, hasRole } = useCurrentUser();

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if (event.key.toLocaleLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onOpenChange(!open);
            }
        };
        document.addEventListener("keydown", handleShortcut);
        return () => document.removeEventListener("keydown", handleShortcut);
    }, [onOpenChange, open]);

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visibleRoutes = routes.filter(route =>
        (route.permission ? hasPermission(route.permission, route.roles as Role[]) : route.roles.some(hasRole)) &&
        (!normalizedQuery || `${route.label} ${route.href}`.toLocaleLowerCase().includes(normalizedQuery))
    );

    const handleOpenChange = (nextOpen: boolean) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setQuery("");
    };

    return (
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" />
                <Dialog.Content
                    aria-describedby={undefined}
                    className="fixed left-1/2 top-4 z-[110] flex max-h-[calc(100dvh-2rem)] w-[95vw] max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl focus:outline-none sm:top-[15%]"
                >
                    <Dialog.Title className="sr-only">全域功能搜尋</Dialog.Title>
                    <div className="flex items-center border-b border-border/50 bg-muted/20 px-4">
                        <Search className="mr-3 h-5 w-5 shrink-0 text-primary opacity-60" />
                        <input
                            autoFocus
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="輸入功能名稱或路徑"
                            className="flex h-14 w-full bg-transparent py-3 text-[15px] font-medium outline-none placeholder:text-muted-foreground"
                        />
                        <div className="ml-2 whitespace-nowrap rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">ESC 關閉</div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:max-h-[350px]">
                        <div className="mb-1 px-3 py-2 text-xs font-semibold tracking-wider text-muted-foreground">功能捷徑</div>
                        {visibleRoutes.map(route => (
                            <button
                                key={route.href}
                                type="button"
                                onClick={() => {
                                    setLocation(route.href);
                                    handleOpenChange(false);
                                }}
                                className="group flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-primary/10 hover:text-primary"
                            >
                                <route.icon className="mr-3 h-4 w-4 text-muted-foreground group-hover:text-primary" />
                                <span className="font-medium text-foreground group-hover:text-primary">{route.label}</span>
                            </button>
                        ))}
                        {visibleRoutes.length === 0 && (
                            <div className="px-3 py-8 text-center text-sm text-muted-foreground">找不到可存取的功能</div>
                        )}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
