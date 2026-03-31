import { useState } from "react";
import { trpc } from "../lib/trpc";
import { format, startOfWeek, addDays, startOfMonth, isSameMonth, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, X, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

export function CalendarPage() {
    const utils = trpc.useContext();
    const [currentDate, setCurrentDate] = useState(new Date());
    
    // Edit state
    const [editingEvent, setEditingEvent] = useState<any>(null);
    const [editForm, setEditForm] = useState({ startDate: "", endDate: "" });

    // Fetch WBS items assigned to current user
    const { data: assignments, isLoading } = trpc.projects.getMyProjectAssignments.useQuery();

    const updateScheduleMutation = trpc.projects.updateWbsItemSchedule.useMutation({
        onSuccess: () => {
            utils.projects.getMyProjectAssignments.invalidate();
            setEditingEvent(null);
            toast.success("排程已更新");
        },
        onError: (err) => {
            toast.error(`更新失敗: ${err.message}`);
        }
    });

    const handleSaveSchedule = () => {
        if (!editForm.startDate || !editForm.endDate) {
            toast.error("請選擇起訖日期");
            return;
        }
        updateScheduleMutation.mutate({
            srId: editingEvent.srId,
            itemId: editingEvent.id,
            startDate: new Date(editForm.startDate),
            endDate: new Date(editForm.endDate)
        });
    };

    const openEditModal = (event: any) => {
        setEditingEvent(event);
        setEditForm({
            startDate: event.startDate ? new Date(event.startDate).toISOString().slice(0, 10) : "",
            endDate: event.endDate ? new Date(event.endDate).toISOString().slice(0, 10) : ""
        });
    };

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
                                <div key={idx} onClick={() => openEditModal(event)} className="bg-primary/10 border border-primary/20 rounded md flex flex-col p-1.5 cursor-pointer hover:bg-primary/20 transition-colors group">
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

    const unscheduledAssignments = (assignments || []).filter((a: any) => !a.startDate || !a.endDate);

    return (
        <div className="max-w-[1400px] mx-auto space-y-4">
            {renderHeader()}
            
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 bg-card border border-border/50 shadow-xl rounded-xl">
                    {renderDays()}
                    {renderCells()}
                </div>
                
                <div className="w-full lg:w-80 space-y-4">
                    <div className="bg-card border border-amber-200 shadow-sm rounded-xl overflow-hidden flex flex-col max-h-[600px]">
                        <div className="bg-amber-50 border-b border-amber-100 p-3 flex justify-between items-center">
                            <h3 className="font-bold text-amber-800 flex items-center text-sm">
                                <AlertCircle className="w-4 h-4 mr-2" />
                                待排程任務 ({unscheduledAssignments.length})
                            </h3>
                        </div>
                        <div className="p-3 overflow-y-auto flex-1 space-y-2 bg-amber-50/30">
                            {unscheduledAssignments.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">目前沒有待排程的任務</p>
                            ) : (
                                unscheduledAssignments.map((event: any) => (
                                    <div key={event.id} onClick={() => openEditModal(event)} className="bg-background border border-border p-2.5 rounded shadow-sm hover:border-primary cursor-pointer transition-colors group">
                                        <div className="text-[10px] text-primary/80 font-semibold mb-1 truncate">{event.srTitle}</div>
                                        <div className="text-sm font-medium text-foreground mb-1 group-hover:text-primary">{event.title}</div>
                                        <div className="text-xs text-muted-foreground flex items-center justify-between">
                                            <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> {event.estimatedHours}h</span>
                                            <span className="text-[10px] bg-muted px-1.5 rounded">點擊排程</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
                        <h3 className="font-bold mb-1 text-sm">排程狀態</h3>
                        <p className="text-xs text-muted-foreground mb-3 border-b pb-3">總任務：{assignments?.length || 0} 項</p>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">已完成排程</span>
                            <span className="font-semibold text-emerald-600 text-sm">{(assignments?.length || 0) - unscheduledAssignments.length} 項</span>
                        </div>
                    </div>
                </div>
            </div>

            {editingEvent && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden">
                        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
                            <h3 className="font-bold">設定任務排程</h3>
                            <button onClick={() => setEditingEvent(null)} className="p-1 hover:bg-muted rounded text-muted-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground mb-1">專案名稱</label>
                                <div className="text-sm border border-border/50 rounded p-2 bg-muted/50">{editingEvent.srTitle}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground mb-1">任務項目</label>
                                <div className="text-sm border border-border/50 rounded p-2 bg-muted/50 font-medium">{editingEvent.title}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1">開始日期</label>
                                    <input type="date" value={editForm.startDate} onChange={e => setEditForm({...editForm, startDate: e.target.value})}
                                        className="w-full text-sm rounded border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1">結束日期</label>
                                    <input type="date" value={editForm.endDate} onChange={e => setEditForm({...editForm, endDate: e.target.value})}
                                        min={editForm.startDate}
                                        className="w-full text-sm rounded border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-border">
                                <button onClick={() => setEditingEvent(null)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                                    取消
                                </button>
                                <button onClick={handleSaveSchedule} disabled={updateScheduleMutation.isPending}
                                    className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                                    {updateScheduleMutation.isPending ? "儲存中..." : "儲存設定"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
