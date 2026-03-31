import { useState } from "react";
import { trpc } from "../lib/trpc";
import { format, startOfWeek, addDays, startOfMonth, isSameMonth, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from "lucide-react";

export function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    
    // Fetch WBS items assigned to current user
    const { data: assignments, isLoading } = trpc.projects.getMyProjectAssignments.useQuery();

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const today = () => setCurrentDate(new Date());

    const startDate = startOfWeek(startOfMonth(currentDate));
    const endDate = addDays(startDate, 41); // 6 weeks

    const dateFormat = "d";

    const renderHeader = () => {
        return (
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <CalendarIcon className="w-6 h-6 text-primary" />
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                        排程行事曆
                    </h2>
                </div>
                <div className="flex items-center gap-4 bg-card border border-border/50 rounded-xl p-1 shadow-sm">
                    <button onClick={prevMonth} className="p-2 hover:bg-muted rounded-lg transition-colors"><ChevronLeft className="w-5 h-5 text-muted-foreground" /></button>
                    <span className="text-lg font-bold min-w-[140px] text-center">{format(currentDate, "yyyy 年 MM 月")}</span>
                    <button onClick={nextMonth} className="p-2 hover:bg-muted rounded-lg transition-colors"><ChevronRight className="w-5 h-5 text-muted-foreground" /></button>
                    <button onClick={today} className="ml-2 px-4 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors mr-1">今天</button>
                </div>
            </div>
        );
    };

    const renderDays = () => {
        const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
        return (
            <div className="grid grid-cols-7 border-b border-border/50 bg-muted/30 rounded-t-xl overflow-hidden">
                {weekdays.map((dayName, i) => (
                    <div className="py-3 text-center text-sm font-semibold text-muted-foreground" key={i}>
                        {dayName}
                    </div>
                ))}
            </div>
        );
    };

    const renderCells = () => {
        const rows = [];
        let daysArray = [];
        let dayCursor = startDate;
        let formattedDate = "";

        while (dayCursor <= endDate) {
            for (let i = 0; i < 7; i++) {
                formattedDate = format(dayCursor, dateFormat);
                const cloneDay = dayCursor;
                const isCurrentMonth = isSameMonth(dayCursor, currentDate);
                const isToday = isSameDay(dayCursor, new Date());

                // Find assignments falling on this day
                const dayAssignments = (assignments || []).filter((a: any) => {
                    if (!a.startDate || !a.endDate) return false;
                    const eventStart = new Date(a.startDate);
                    const eventEnd = new Date(a.endDate);
                    return cloneDay >= new Date(eventStart.setHours(0,0,0,0)) && 
                           cloneDay <= new Date(eventEnd.setHours(23,59,59,999));
                });

                daysArray.push(
                    <div 
                        className={`min-h-[120px] p-2 border-r border-b border-border/30 transition-colors 
                                   ${!isCurrentMonth ? "bg-muted/10 text-muted-foreground opacity-50" : "bg-card"} 
                                   hover:bg-muted/20`}
                        key={dayCursor.toString()}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? "bg-primary text-primary-foreground shadow-md" : "text-foreground/80"}`}>
                                {formattedDate}
                            </span>
                        </div>
                        <div className="space-y-1.5 overflow-y-auto max-h-[85px] scrollbar-thin scrollbar-thumb-border">
                            {dayAssignments.map((event: any, idx: number) => (
                                <div key={idx} className="bg-primary/10 border border-primary/20 rounded md flex flex-col p-1.5 cursor-pointer hover:bg-primary/20 transition-colors group">
                                    <div className="text-[10px] text-primary/70 font-semibold mb-0.5 truncate">{event.srTitle}</div>
                                    <div className="text-xs font-medium truncate text-foreground/90">{event.title}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center">
                                        <Clock className="w-3 h-3 mr-1" />
                                        {event.estimatedHours}h (已報 {event.actualHours}h)
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
                dayCursor = addDays(dayCursor, 1);
            }
            rows.push(
                <div className="grid grid-cols-7" key={dayCursor.toString()}>
                    {daysArray}
                </div>
            );
            daysArray = [];
        }
        return <div className="border-l border-border/30 rounded-b-xl overflow-hidden shadow-sm">{rows}</div>;
    };

    if (isLoading) return <div className="p-8 text-center animate-pulse">載入中...</div>;

    return (
        <div className="max-w-6xl mx-auto space-y-4">
            {renderHeader()}
            <div className="bg-card border border-border/50 shadow-xl rounded-xl">
                {renderDays()}
                {renderCells()}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm">
                    <h3 className="font-bold mb-2">排程總覽</h3>
                    <div className="text-3xl font-black text-primary">{assignments?.length || 0}</div>
                    <p className="text-sm text-muted-foreground mt-1">目前指派給您的總任務數</p>
                </div>
                <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm">
                    <h3 className="font-bold mb-2">待完成工時</h3>
                    <div className="text-3xl font-black text-amber-500">
                        {assignments?.reduce((sum: number, a: any) => sum + Math.max(0, a.estimatedHours - a.actualHours), 0) || 0}h
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">基於預估減去已回報工時</p>
                </div>
                <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm">
                    <h3 className="font-bold mb-2">使用提示</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        本行事曆將顯示專案經理 (PM) 於 WBS 內為您排定的起訖日期，若沒有顯示表示 PM 尚未為該任務設定排程區間。
                    </p>
                </div>
            </div>
        </div>
    );
}
