import { useState } from "react";
import { CalendarDays, Users } from "lucide-react";
import { useCurrentUser } from "../lib/useCurrentUser";
import { MyScheduleView } from "./calendar/MyScheduleView";
import { TeamScheduleView } from "./calendar/TeamScheduleView";
import { setCalendarQuery } from "./calendar/scheduleUi";

export function CalendarPage() {
    const { hasRole } = useCurrentUser();
    const canViewTeam = hasRole("admin") || hasRole("manager");
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const initialTab = requestedTab === "mine" || (requestedTab === "team" && canViewTeam)
        ? requestedTab
        : canViewTeam ? "team" : "mine";
    const [tab, setTab] = useState<"mine" | "team">(initialTab);

    const changeTab = (next: "mine" | "team") => {
        setTab(next);
        setCalendarQuery({ tab: next });
    };

    return (
        <div className="mx-auto max-w-[1680px] space-y-4">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Planning · Capacity · Support</p>
                    <h1 className="mt-1 text-2xl font-bold">排程與人力</h1>
                    <p className="mt-1 text-sm text-muted-foreground">安排自己的支援時段，並從團隊負載掌握可用人力。</p>
                </div>
                <div className="flex w-fit rounded-xl border bg-card p-1 shadow-sm">
                    <button type="button" onClick={() => changeTab("mine")} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === "mine" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}><CalendarDays className="h-4 w-4" />我的排程</button>
                    {canViewTeam && <button type="button" onClick={() => changeTab("team")} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === "team" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}><Users className="h-4 w-4" />團隊負載</button>}
                </div>
            </div>
            {tab === "mine" ? <MyScheduleView /> : <TeamScheduleView />}
        </div>
    );
}
