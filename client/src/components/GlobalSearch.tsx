import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, FileText, Building2, FolderKanban, Users, Activity, Settings } from "lucide-react";
import { useLocation } from "wouter";

export function GlobalSearch() {
    const [open, setOpen] = useState(false);
    const [, setLocation] = useLocation();
    
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const routes = [
        { href: "/opportunities", icon: Building2, label: "商機管理 (Opportunities)" },
        { href: "/projects", icon: FolderKanban, label: "專案看板 (Projects)" },
        { href: "/service-requests", icon: FileText, label: "查閱單號清單 (SR/WBS)" },
        { href: "/resources", icon: Users, label: "查閱資源池與派工 (Resources)" },
        { href: "/kpi", icon: Activity, label: "部門 KPI 分析 (KPI Dashboard)" },
        { href: "/system-settings", icon: Settings, label: "系統與背景設定 (Settings)" }
    ];

    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300" />
                <Dialog.Content className="fixed left-[50%] top-[15%] z-[110] w-[95vw] max-w-2xl translate-x-[-50%] rounded-xl bg-card border border-border shadow-2xl focus:outline-none overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center border-b border-border/50 px-4 bg-muted/20">
                        <Search className="mr-3 h-5 w-5 shrink-0 text-primary opacity-60" />
                        <input 
                            autoFocus
                            placeholder="輸入關鍵字以全域導覽... (Type a command or search)"
                            className="flex h-14 w-full rounded-md bg-transparent py-3 text-[15px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 font-medium"
                        />
                        <div className="text-[10px] text-muted-foreground border border-border bg-background px-1.5 py-0.5 rounded shadow-sm opacity-60 ml-2 whitespace-nowrap">ESC 關閉</div>
                    </div>
                    <div className="max-h-[350px] overflow-y-auto p-2">
                        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground tracking-wider mb-1">快速導覽 Shortcuts</div>
                        {routes.map((r, i) => (
                            <button
                                key={i}
                                onClick={() => { setLocation(r.href); setOpen(false); }}
                                className="relative flex w-full select-none items-center rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-primary/10 hover:text-primary transition-colors text-left group"
                            >
                                <r.icon className="mr-3 h-4 w-4 text-muted-foreground group-hover:text-primary" />
                                <span className="font-medium text-foreground group-hover:text-primary">{r.label}</span>
                                <span className="ml-auto text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">跳轉 ↵</span>
                            </button>
                        ))}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
