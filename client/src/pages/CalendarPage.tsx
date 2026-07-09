import { useState } from "react";
import { trpc } from "../lib/trpc";
import { format, startOfWeek, addDays, startOfMonth, isSameMonth, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, X, AlertCircle, Plus } from "lucide-react";
import toast from "react-hot-toast";

export function CalendarPage() {
    const utils = trpc.useContext();
    const [currentDate, setCurrentDate] = useState(new Date());
    
    // Edit state
    const [editingEvent, setEditingEvent] = useState<any>(null);
    const [editForm, setEditForm] = useState({ startDate: "", endDate: "" });

    // Day view state
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [showDayModal, setShowDayModal] = useState(false);
    const [quickScheduleTaskId, setQuickScheduleTaskId] = useState("");
    const [projectFilter, setProjectFilter] = useState("");
    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [draggedTask, setDraggedTask] = useState<any>(null);

    // Fetch WBS items assigned to current user
    const { data: assignments, isLoading } = trpc.projects.getMyProjectAssignments.useQuery();

    const createCalendarTaskMutation = trpc.projects.createCalendarTask.useMutation({
        onSuccess: () => {
            utils.projects.getMyProjectAssignments.invalidate();
            setNewTaskTitle("");
            toast.success("已新增自行排程任務");
        },
        onError: (err) => toast.error(`新增失敗: ${err.message}`)
    });

    const updateManualScheduleMutation = trpc.projects.updateCalendarTaskSchedule.useMutation({
        onSuccess: () => {
            utils.projects.getMyProjectAssignments.invalidate();
            setEditingEvent(null);
            toast.success("排程已更新");
        },
        onError: (err) => toast.error(`更新失敗: ${err.message}`)
    });

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
    const createWbsScheduleMutation = trpc.projects.scheduleWbsItem.useMutation({
        onSuccess: () => {
            utils.projects.getMyProjectAssignments.invalidate();
            setEditingEvent(null);
            setQuickScheduleTaskId("");
            toast.success("已加入 WBS 排程");
        },
        onError: (err) => {
            toast.error(`排程失敗: ${err.message}`);
        }
    });

    const handleSaveSchedule = () => {
        if (!editForm.startDate || !editForm.endDate) {
            toast.error("請選擇起訖日期");
            return;
        }
        const payload = {
            startDate: new Date(editForm.startDate),
            endDate: new Date(editForm.endDate)
        };
        if (editingEvent.calendarTaskId || editingEvent.sourceType === "manual") {
            updateManualScheduleMutation.mutate({ id: editingEvent.calendarTaskId || editingEvent.id, ...payload });
            return;
        }
        if (editingEvent.sourceType === "wbs") {
            createWbsScheduleMutation.mutate({
                srId: editingEvent.srId,
                itemId: editingEvent.wbsItemId || editingEvent.id,
                ...payload
            });
            return;
        }
        updateScheduleMutation.mutate({
            srId: editingEvent.srId,
            itemId: editingEvent.id,
            ...payload
        });
    };

    const openEditModal = (event: any) => {
        setEditingEvent(event);
        setEditForm({
            startDate: event.startDate ? new Date(event.startDate).toISOString().slice(0, 10) : "",
            endDate: event.endDate ? new Date(event.endDate).toISOString().slice(0, 10) : ""
        });
        setShowDayModal(false);
    };

    const openDayModal = (day: Date) => {
        setSelectedDay(day);
        setShowDayModal(true);
        setQuickScheduleTaskId("");
    };

    const handleQuickSchedule = (taskId: string) => {
        const task = (assignments || []).find((a: any) => a.id === taskId);
        if (!task || !selectedDay) return;
        scheduleTaskOnDay(task, selectedDay);
    };

    const scheduleTaskOnDay = (task: any, day: Date) => {
        const startDate = day;
        const endDate = day;

        if (task.calendarTaskId || task.sourceType === "manual") {
            updateManualScheduleMutation.mutate({ id: task.calendarTaskId || task.id, startDate, endDate });
            return;
        }
        createWbsScheduleMutation.mutate({
            srId: task.srId,
            itemId: task.wbsItemId || task.id,
            startDate,
            endDate
        });
    };

    const handleDropOnDay = (day: Date) => {
        if (!draggedTask) return;
        scheduleTaskOnDay(draggedTask, day);
        setDraggedTask(null);
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
                const dayAssignments = visibleAssignments.filter((a: any) => {
                    if (!a.startDate || !a.endDate) return false;
                    const eventStart = new Date(a.startDate);
                    const eventEnd = new Date(a.endDate);
                    return cloneDay >= new Date(eventStart.setHours(0,0,0,0)) && 
                           cloneDay <= new Date(eventEnd.setHours(23,59,59,999));
                });

                daysArray.push(
                    <div 
                        className={`min-h-[120px] p-2 border-r border-b border-border/30 transition-colors cursor-pointer
                                   ${!isCurrentMonth ? "bg-muted/10 text-muted-foreground opacity-50" : "bg-card"} 
                                   hover:bg-muted/20`}
                        key={dayCursor.toString()}
                        onClick={() => openDayModal(cloneDay)}
                        onDragOver={(event) => {
                            if (draggedTask) event.preventDefault();
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleDropOnDay(cloneDay);
                        }}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? "bg-primary text-primary-foreground shadow-md" : "text-foreground/80"}`}>
                                {formattedDate}
                            </span>
                        </div>
                        <div className="space-y-1.5 overflow-y-auto max-h-[100px] pr-1">
                            {dayAssignments.map((event: any, idx: number) => (
                                <div
                                    key={idx}
                                    draggable
                                    onDragStart={(e) => {
                                        e.stopPropagation();
                                        setDraggedTask(event);
                                    }}
                                    onDragEnd={() => setDraggedTask(null)}
                                    onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                                    className="bg-primary/5 border border-primary/20 rounded-md flex flex-col p-2 cursor-grab active:cursor-grabbing hover:bg-primary/10 transition-all group shadow-sm"
                                >
                                    <div className="text-[10px] text-primary/70 font-bold mb-0.5 truncate uppercase tracking-wider">{event.srTitle}</div>
                                    <div className="text-xs font-semibold truncate text-foreground/90 leading-tight">{event.title}</div>
                                    {event.isPmView && (
                                        <div className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm mt-1 inline-block truncate w-fit">
                                            👤 {event.assigneeName}
                                        </div>
                                    )}
                                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                                        <Clock className="w-3 h-3" />
                                        <span>{event.estimatedHours} 天</span>
                                        <span className="opacity-40">|</span>
                                        <span>{event.remainingDays ? `剩 ${event.remainingDays}天` : `已報 ${event.actualHours}h`}</span>
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

    const projectOptions = Array.from(new Set((assignments || []).filter((a: any) => a.sourceType !== "manual").map((a: any) => a.srTitle))).sort();
    const visibleAssignments = (assignments || []).filter((a: any) => !projectFilter || a.srTitle === projectFilter || a.sourceType === "manual");
    const unscheduledAssignments = visibleAssignments.filter((a: any) => a.isBacklog || !a.startDate || !a.endDate);

    return (
        <div className="max-w-[1400px] mx-auto space-y-4">
            {renderHeader()}
            
            <div className="bg-card border border-border/50 rounded-xl p-4 flex flex-col md:flex-row gap-3 md:items-end">
                <div className="flex-1">
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">先篩選專案，再細選任務</label>
                    <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="w-full md:w-80 text-sm rounded-lg border border-border bg-background px-3 py-2">
                        <option value="">全部專案與自行任務</option>
                        {projectOptions.map((name: string) => <option key={name} value={name}>{name}</option>)}
                    </select>
                </div>
                <div className="flex gap-2 flex-1">
                    <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="自行新增排程任務" className="flex-1 text-sm rounded-lg border border-border bg-background px-3 py-2" />
                    <button onClick={() => newTaskTitle.trim() && createCalendarTaskMutation.mutate({ title: newTaskTitle.trim() })} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold inline-flex items-center gap-1"><Plus className="w-4 h-4" />新增</button>
                </div>
            </div>

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
                                    <div
                                        key={event.id}
                                        draggable
                                        onDragStart={() => setDraggedTask(event)}
                                        onDragEnd={() => setDraggedTask(null)}
                                        onClick={() => openEditModal(event)}
                                        className="bg-background border border-border p-2.5 rounded shadow-sm hover:border-primary cursor-grab active:cursor-grabbing transition-colors group"
                                    >
                                        <div className="text-[10px] text-primary/80 font-semibold mb-1 truncate">{event.srTitle}</div>
                                        <div className="text-sm font-medium text-foreground mb-1 group-hover:text-primary">{event.title}</div>
                                        {event.isPmView && (
                                            <div className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm mb-1.5 inline-block">
                                                {event.assigneeName}
                                            </div>
                                        )}
                                        <div className="text-xs text-muted-foreground flex items-center justify-between">
                                            <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> 剩 {event.remainingDays ?? event.estimatedHours} 天</span>
                                            <span className="text-[10px] bg-muted px-1.5 rounded">拖曳排程</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
                        <h3 className="font-bold mb-1 text-sm">排程狀態</h3>
                        <p className="text-xs text-muted-foreground mb-3 border-b pb-3">總任務：{visibleAssignments.length || 0} 項</p>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground">已完成排程</span>
                            <span className="font-semibold text-emerald-600 text-sm">{visibleAssignments.length - unscheduledAssignments.length} 項</span>
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
                            {editingEvent.projectWindowStart && editingEvent.projectWindowEnd && (
                                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                    可排程範圍：{new Date(editingEvent.projectWindowStart).toISOString().slice(0, 10)} ~ {new Date(editingEvent.projectWindowEnd).toISOString().slice(0, 10)}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1">開始日期</label>
                                    <input type="date" value={editForm.startDate} onChange={e => setEditForm({...editForm, startDate: e.target.value})}
                                        min={editingEvent.projectWindowStart ? new Date(editingEvent.projectWindowStart).toISOString().slice(0, 10) : undefined}
                                        max={editingEvent.projectWindowEnd ? new Date(editingEvent.projectWindowEnd).toISOString().slice(0, 10) : undefined}
                                        className="w-full text-sm rounded border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1">結束日期</label>
                                    <input type="date" value={editForm.endDate} onChange={e => setEditForm({...editForm, endDate: e.target.value})}
                                        min={editForm.startDate || (editingEvent.projectWindowStart ? new Date(editingEvent.projectWindowStart).toISOString().slice(0, 10) : undefined)}
                                        max={editingEvent.projectWindowEnd ? new Date(editingEvent.projectWindowEnd).toISOString().slice(0, 10) : undefined}
                                        className="w-full text-sm rounded border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-border">
                                <button onClick={() => setEditingEvent(null)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                                    取消
                                </button>
                                <button onClick={handleSaveSchedule} disabled={updateScheduleMutation.isPending || updateManualScheduleMutation.isPending || createWbsScheduleMutation.isPending}
                                    className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
                                    {(updateScheduleMutation.isPending || updateManualScheduleMutation.isPending || createWbsScheduleMutation.isPending) ? "儲存中..." : "儲存設定"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showDayModal && selectedDay && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card w-full max-w-lg rounded-xl shadow-2xl border border-border overflow-hidden">
                        <div className="p-4 border-b border-border flex justify-between items-center bg-primary/5">
                            <h3 className="font-bold flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5 text-primary" />
                                {format(selectedDay, "yyyy/MM/dd")} 排程詳情
                            </h3>
                            <button onClick={() => setShowDayModal(false)} className="p-1 hover:bg-muted rounded text-muted-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            {/* Current Day Status */}
                            <div>
                                <h4 className="text-sm font-bold mb-3 flex justify-between items-center">
                                    當日已安排任務
                                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-normal text-muted-foreground">一天以 8 小時為限</span>
                                </h4>
                                <div className="space-y-2">
                                    {(() => {
                                        const dayTasks = (assignments || []).filter((a: any) => {
                                            if (!a.startDate || !a.endDate) return false;
                                            const d = new Date(selectedDay).setHours(0,0,0,0);
                                            return d >= new Date(a.startDate).setHours(0,0,0,0) && d <= new Date(a.endDate).setHours(0,0,0,0);
                                        });
                                        
                                        if (dayTasks.length === 0) return <div className="text-center py-6 border border-dashed rounded-lg text-xs text-muted-foreground bg-muted/20">此日尚無安排任何任務</div>;
                                        
                                        let totalHours = 0;
                                        return (
                                            <>
                                                {dayTasks.map((t, i) => {
                                                    totalHours += 4; // Mocking 4h per task slot as requested (AM/PM logic)
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg group hover:border-primary/50 transition-colors">
                                                            <div className={`w-2 h-10 rounded-full ${i === 0 ? "bg-amber-400" : "bg-blue-400"}`} title={i === 0 ? "上午時段 (4h)" : "下午時段 (4h)"} />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-[10px] text-muted-foreground truncate">{t.srTitle}</div>
                                                                <div className="text-sm font-bold truncate">{t.title}</div>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[10px] text-primary bg-primary/5 px-1.5 rounded">{i === 0 ? "早上 (AM) 4h" : "下午 (PM) 4h"}</span>
                                                                    <span className="text-[10px] text-muted-foreground">本次: {t.estimatedHours} 天</span>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => openEditModal(t)} className="p-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all">
                                                                <Clock className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                                <div className="pt-2 flex justify-end">
                                                    <div className="text-xs font-semibold text-muted-foreground">
                                                        當日佔用: <span className={totalHours > 8 ? "text-red-500" : "text-primary"}>{totalHours}h / 8h</span>
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Quick Schedule Section */}
                            <div className="pt-4 border-t border-border bg-muted/5 p-4 -mx-6 mb-[-1.5rem]">
                                <h4 className="text-sm font-bold mb-3 px-2">快速加入排程</h4>
                                <div className="space-y-4 px-2">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">選擇待排程任務</label>
                                        <select 
                                            value={quickScheduleTaskId} 
                                            onChange={(e) => setQuickScheduleTaskId(e.target.value)}
                                            className="w-full text-sm rounded-lg border border-border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                                        >
                                            <option value="">-- 請選擇 --</option>
                                            {unscheduledAssignments.map(a => (
                                                <option key={a.id} value={a.id}>
                                                    [{a.srTitle.slice(0, 8)}...] {a.title} (餘 {a.remainingDays ?? a.estimatedHours} 天)
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {quickScheduleTaskId && (
                                        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10 animate-in fade-in slide-in-from-top-2">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-medium text-muted-foreground">本次排程預覽:</span>
                                                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                    {(() => {
                                                        const t = (assignments || []).find(a => a.id === quickScheduleTaskId);
                                                        if (!t) return "";
                                                        return `排 1 天，剩 ${Math.max(0, (t.remainingDays ?? t.estimatedHours) - 1)} 天`;
                                                    })()}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-bold text-foreground/70">
                                                <div className="flex-1 bg-background border border-border p-2 rounded text-center">
                                                    {format(selectedDay, "MM/dd")}
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                                <div className="flex-1 bg-background border border-border p-2 rounded text-center">
                                                    {format(selectedDay, "MM/dd")}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <button 
                                        disabled={!quickScheduleTaskId || updateScheduleMutation.isPending || createWbsScheduleMutation.isPending}
                                        onClick={() => handleQuickSchedule(quickScheduleTaskId)}
                                        className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 active:scale-95"
                                    >
                                        <CalendarIcon className="w-4 h-4" />
                                        {(updateScheduleMutation.isPending || createWbsScheduleMutation.isPending) ? "儲存中..." : "排入選取日期"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-muted/20 border-t border-border flex justify-end">
                            <button onClick={() => setShowDayModal(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-background transition-colors">
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
