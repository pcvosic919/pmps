import { useEffect, useState } from "react";
import { trpc } from "../lib/trpc";
import { format, startOfWeek, addDays, startOfMonth, isSameMonth, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, X, AlertCircle, Plus, Search, Users } from "lucide-react";
import toast from "react-hot-toast";
import { useCurrentUser } from "../lib/useCurrentUser";

export function CalendarPage() {
    const utils = trpc.useContext();
    const { hasRole, user } = useCurrentUser();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [calendarScope, setCalendarScope] = useState<"mine" | "managed" | "all">("mine");
    
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
    const [daySearchTerm, setDaySearchTerm] = useState("");
    const [dayDepartmentFilter, setDayDepartmentFilter] = useState("");
    const [dayStatusFilter, setDayStatusFilter] = useState("");

    // Fetch WBS items assigned to current user
    const { data: assignments, isLoading, isFetching } = trpc.projects.getMyProjectAssignments.useQuery(
        { scope: calendarScope },
        { placeholderData: undefined }
    );

    useEffect(() => {
        if (!user?.id) return;
        const savedScope = localStorage.getItem(`pmp_calendar_scope_${user.id}`);
        if (savedScope === "mine" || (savedScope === "managed" && (hasRole("manager") || hasRole("admin"))) || (savedScope === "all" && hasRole("admin"))) {
            setCalendarScope(savedScope);
        }
    }, [user?.id]);

    const changeCalendarScope = (scope: "mine" | "managed" | "all") => {
        setCalendarScope(scope);
        if (user?.id) localStorage.setItem(`pmp_calendar_scope_${user.id}`, scope);
    };

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
        setDaySearchTerm("");
        setDayDepartmentFilter("");
        setDayStatusFilter("");
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
    const statusLabels: Record<string, string> = {
        not_started: "尚未開始",
        in_progress: "進行中",
        completed: "完成"
    };
    const statusColors: Record<string, string> = {
        not_started: "bg-muted text-muted-foreground border-border",
        in_progress: "bg-sky-50 text-sky-700 border-sky-200",
        completed: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };

    const getAssignmentsOnDay = (day: Date, source = visibleAssignments) => {
        const dayStart = new Date(day).setHours(0, 0, 0, 0);
        return source.filter((assignment: any) => {
            if (!assignment.startDate || !assignment.endDate) return false;
            const eventStart = new Date(assignment.startDate).setHours(0, 0, 0, 0);
            const eventEnd = new Date(assignment.endDate).setHours(23, 59, 59, 999);
            return dayStart >= eventStart && dayStart <= eventEnd;
        });
    };

    const getStatusText = (status?: string) => statusLabels[status || "not_started"] || "尚未開始";

    const getStatusClass = (status?: string) => statusColors[status || "not_started"] || statusColors.not_started;

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

                const dayAssignments = getAssignmentsOnDay(cloneDay);
                const visibleDayAssignments = dayAssignments.slice(0, 2);
                const hiddenCount = Math.max(0, dayAssignments.length - visibleDayAssignments.length);
                const peopleCount = new Set(dayAssignments.map((event: any) => event.assigneeId || event.assigneeName).filter(Boolean)).size;

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
                        {dayAssignments.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1">
                                <span className="text-[10px] border border-border bg-muted/40 rounded px-1.5 py-0.5">{peopleCount} 人</span>
                                <span className="text-[10px] border border-border bg-muted/40 rounded px-1.5 py-0.5">{dayAssignments.length} 項</span>
                                {dayAssignments.some((event: any) => event.status !== "completed") && (
                                    <span className="text-[10px] border border-amber-200 bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">進行中</span>
                                )}
                            </div>
                        )}
                        <div className="space-y-1.5">
                            {visibleDayAssignments.map((event: any, idx: number) => (
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
                                    <div className="text-[10px] text-muted-foreground truncate mt-1">{event.assigneeName || "未指派"}</div>
                                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                                        <Clock className="w-3 h-3" />
                            <span>{event.estimatedHours} 天</span>
                            {event.isBillable === false && <span className="text-[10px] text-amber-600">非計費</span>}
                                    </div>
                                </div>
                            ))}
                            {hiddenCount > 0 && (
                                <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); openDayModal(cloneDay); }}
                                    className="w-full text-[11px] font-semibold text-primary bg-primary/5 border border-primary/20 rounded-md px-2 py-1.5 hover:bg-primary/10"
                                >
                                    +{hiddenCount} 更多
                                </button>
                            )}
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
                <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">檢視範圍</label>
                    <div className="flex rounded-lg border border-border bg-muted/30 p-1 text-xs">
                        <button type="button" onClick={() => changeCalendarScope("mine")} className={`px-3 py-1.5 rounded-md font-semibold ${calendarScope === "mine" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>我的</button>
                        {(hasRole("manager") || hasRole("admin")) && (
                            <button type="button" onClick={() => changeCalendarScope("managed")} className={`px-3 py-1.5 rounded-md font-semibold ${calendarScope === "managed" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>管理部門</button>
                        )}
                        {hasRole("admin") && (
                            <button type="button" onClick={() => changeCalendarScope("all")} className={`px-3 py-1.5 rounded-md font-semibold ${calendarScope === "all" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>全部</button>
                        )}
                    </div>
                    {isFetching && !isLoading && <span className="ml-2 text-[11px] text-muted-foreground">更新中…</span>}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-2xl">
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

            {showDayModal && selectedDay && (() => {
                const dayTasks = getAssignmentsOnDay(selectedDay, assignments || []);
                const departments = Array.from(new Set(dayTasks.map((task: any) => task.assigneeDepartment || "未指定").filter(Boolean))).sort();
                const normalizedSearch = daySearchTerm.trim().toLowerCase();
                const filteredDayTasks = dayTasks.filter((task: any) => {
                    const searchText = [
                        task.assigneeName,
                        task.assigneeEmail,
                        task.assigneeDepartment,
                        task.srTitle,
                        task.title,
                        task.code,
                        task.description
                    ].filter(Boolean).join(" ").toLowerCase();
                    const department = task.assigneeDepartment || "未指定";
                    return (!normalizedSearch || searchText.includes(normalizedSearch))
                        && (!dayDepartmentFilter || department === dayDepartmentFilter)
                        && (!dayStatusFilter || (task.status || "not_started") === dayStatusFilter);
                });
                const groupedTasks = filteredDayTasks.reduce((groups: Record<string, any[]>, task: any) => {
                    const key = task.assigneeId || task.assigneeName || "未指派";
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(task);
                    return groups;
                }, {});
                const peopleCount = new Set(dayTasks.map((task: any) => task.assigneeId || task.assigneeName).filter(Boolean)).size;
                const totalDays = dayTasks.reduce((sum: number, task: any) => sum + Number(task.estimatedHours || 0), 0);
                const completedCount = dayTasks.filter((task: any) => task.status === "completed").length;

                return (
                <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 flex justify-end">
                    <div className="bg-card w-full max-w-3xl h-full shadow-2xl border-l border-border overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-border flex justify-between items-center bg-primary/5">
                            <h3 className="font-bold flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5 text-primary" />
                                {format(selectedDay, "yyyy/MM/dd")} 排程詳情
                            </h3>
                            <button onClick={() => setShowDayModal(false)} className="p-1 hover:bg-muted rounded text-muted-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-5 flex-1">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="border border-border rounded-lg p-3 bg-background">
                                    <div className="text-xs text-muted-foreground">安排人數</div>
                                    <div className="mt-1 text-xl font-bold">{peopleCount}</div>
                                </div>
                                <div className="border border-border rounded-lg p-3 bg-background">
                                    <div className="text-xs text-muted-foreground">WBS 項目</div>
                                    <div className="mt-1 text-xl font-bold">{dayTasks.length}</div>
                                </div>
                                <div className="border border-border rounded-lg p-3 bg-background">
                                    <div className="text-xs text-muted-foreground">排程天數</div>
                                    <div className="mt-1 text-xl font-bold">{totalDays}</div>
                                </div>
                                <div className="border border-border rounded-lg p-3 bg-background">
                                    <div className="text-xs text-muted-foreground">完成項目</div>
                                    <div className="mt-1 text-xl font-bold">{completedCount}</div>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-[1fr_180px_160px] gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                                    <input
                                        value={daySearchTerm}
                                        onChange={(event) => setDaySearchTerm(event.target.value)}
                                        placeholder="搜尋人員、Email、專案或 WBS"
                                        className="w-full border border-border rounded-lg pl-9 pr-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                </div>
                                <select
                                    value={dayDepartmentFilter}
                                    onChange={(event) => setDayDepartmentFilter(event.target.value)}
                                    className="border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">全部部門</option>
                                    {departments.map((department) => (
                                        <option key={department} value={department}>{department}</option>
                                    ))}
                                </select>
                                <select
                                    value={dayStatusFilter}
                                    onChange={(event) => setDayStatusFilter(event.target.value)}
                                    className="border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value="">全部狀態</option>
                                    <option value="not_started">尚未開始</option>
                                    <option value="in_progress">進行中</option>
                                    <option value="completed">完成</option>
                                </select>
                            </div>

                            <div className="space-y-3">
                                {filteredDayTasks.length === 0 ? (
                                    <div className="text-center py-8 border border-dashed rounded-lg text-sm text-muted-foreground bg-muted/20">此日沒有符合條件的排程</div>
                                ) : (
                                    Object.entries(groupedTasks).map(([assigneeKey, tasks]) => {
                                        const firstTask = (tasks as any[])[0];
                                        const personDays = (tasks as any[]).reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0);
                                        return (
                                            <div key={assigneeKey} className="border border-border rounded-lg bg-background overflow-hidden">
                                                <div className="px-4 py-3 bg-muted/30 border-b border-border flex flex-wrap items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="font-semibold truncate flex items-center gap-2">
                                                            <Users className="w-4 h-4 text-primary" />
                                                            {firstTask.assigneeName || "未指派"}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {firstTask.assigneeDepartment || "未指定部門"}{firstTask.assigneeEmail ? ` / ${firstTask.assigneeEmail}` : ""}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{(tasks as any[]).length} 項 / {personDays} 天</div>
                                                </div>
                                                <div className="divide-y divide-border/60">
                                                    {(tasks as any[]).map((task) => (
                                                        <div key={task.calendarTaskId || task.id} className="p-4 group hover:bg-muted/20 transition-colors">
                                                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="text-xs text-muted-foreground truncate">{task.srTitle}</div>
                                                                    <div className="font-semibold text-sm truncate">{task.title}</div>
                                                                    {task.description && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</div>}
                                                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                                                        {task.code && <span className="border border-border rounded px-1.5 py-0.5">WBS {task.code}</span>}
                                                                        <span className="border border-border rounded px-1.5 py-0.5">{new Date(task.startDate).toISOString().slice(0, 10)} ~ {new Date(task.endDate).toISOString().slice(0, 10)}</span>
                                                                        <span className="border border-border rounded px-1.5 py-0.5">本次 {task.estimatedHours} 天</span>
                                                                        <span className="border border-border rounded px-1.5 py-0.5">已填 {task.actualHours || 0}h</span>
                                                                        {task.isBillable === false && <span className="border border-amber-200 bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">觀察者 / 非計費</span>}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    <span className={`text-[11px] border rounded-full px-2 py-1 ${getStatusClass(task.status)}`}>{getStatusText(task.status)}</span>
                                                                    <button onClick={() => openEditModal(task)} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
                                                                        <Clock className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="pt-4 border-t border-border bg-muted/5 p-4 -mx-5 mb-[-1.25rem]">
                                <h4 className="text-sm font-bold mb-3 px-2">快速加入排程</h4>
                                <div className="grid md:grid-cols-[1fr_auto] gap-3 px-2">
                                    <select
                                        value={quickScheduleTaskId}
                                        onChange={(e) => setQuickScheduleTaskId(e.target.value)}
                                        className="w-full text-sm rounded-lg border border-border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                                    >
                                        <option value="">選擇待排程任務</option>
                                        {unscheduledAssignments.map(a => (
                                            <option key={a.id} value={a.id}>
                                                [{a.srTitle.slice(0, 8)}...] {a.title} (餘 {a.remainingDays ?? a.estimatedHours} 天)
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        disabled={!quickScheduleTaskId || updateScheduleMutation.isPending || createWbsScheduleMutation.isPending}
                                        onClick={() => handleQuickSchedule(quickScheduleTaskId)}
                                        className="flex justify-center items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all"
                                    >
                                        <CalendarIcon className="w-4 h-4" />
                                        {(updateScheduleMutation.isPending || createWbsScheduleMutation.isPending) ? "儲存中..." : "排入選取日期"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                );
            })()}
        </div>
    );
}
