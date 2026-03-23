import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "../lib/trpc";
import {
    Building2, Calendar, ChevronLeft, Users, Briefcase, Clock,
    Plus, X, Check, UserPlus, Trash2, FileText, ChevronDown
} from "lucide-react";

const OPP_STATUSES = [
    { value: "new", label: "待處理", color: "bg-blue-100 text-blue-800 border-blue-200" },
    { value: "qualified", label: "已確認", color: "bg-purple-100 text-purple-800 border-purple-200" },
    { value: "presales_active", label: "協銷中", color: "bg-amber-100 text-amber-800 border-amber-200" },
    { value: "won", label: "已成交", color: "bg-green-100 text-green-800 border-green-200" },
    { value: "converted", label: "已轉案", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
    { value: "lost", label: "已失敗", color: "bg-red-100 text-red-800 border-red-200" },
] as const;


export function OpportunityDetailPage() {
    const [match, params] = useRoute("/opportunities/:id");
    const id = match ? (params.id as string) : "";

    // ------ Modal states ------
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignTechId, setAssignTechId] = useState("");
    const [assignHours, setAssignHours] = useState("8");
    const [assignError, setAssignError] = useState("");

    const [showTimesheetModal, setShowTimesheetModal] = useState(false);
    const [tsDate, setTsDate] = useState(new Date().toISOString().slice(0, 10));
    const [tsHours, setTsHours] = useState("4");
    const [tsDesc, setTsDesc] = useState("");
    const [tsError, setTsError] = useState("");

    const [showMemberModal, setShowMemberModal] = useState(false);
    const [memberUserId, setMemberUserId] = useState("");
    const [memberRole, setMemberRole] = useState<"owner" | "assignee" | "watcher">("watcher");
    const [memberError, setMemberError] = useState("");
    const [memberSearchTerm, setMemberSearchTerm] = useState("");
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);

    const [showSRModal, setShowSRModal] = useState(false);
    const [srTitle, setSrTitle] = useState("");
    const [srAmount, setSrAmount] = useState("");
    const [srPmId, setSrPmId] = useState("");
    const [srTechId, setSrTechId] = useState("");
    const [srError, setSrError] = useState("");

    const [showStatusDropdown, setShowStatusDropdown] = useState(false);

    // ------ Queries ------
    const { data: opp, isLoading: isOppLoading, refetch: refetchOpp } = trpc.opportunities.getById.useQuery({ id }, { enabled: !!id });
    const { data: members, isLoading: isMembersLoading, refetch: refetchMembers } = trpc.opportunities.getMembers.useQuery({ opportunityId: id }, { enabled: !!id });
    const { data: assignments, isLoading: isAssignmentsLoading, refetch: refetchAssignments } = trpc.opportunities.getAssignments.useQuery({ opportunityId: id }, { enabled: !!id });
    const { data: timesheets, isLoading: isTimesheetsLoading, refetch: refetchTimesheets } = trpc.opportunities.getTimesheets.useQuery({ opportunityId: id }, { enabled: !!id });
    const { data: presalesList } = trpc.users.presalesList.useQuery();
    const { data: pmUsers } = trpc.users.pmList.useQuery();
    const { data: techUsers } = trpc.users.techList.useQuery();
    const { data: allUsers } = trpc.users.list.useQuery({ limit: 500 });
    const { data: customFieldDefs } = trpc.system.getCustomFields.useQuery();

    const oppFields = customFieldDefs?.filter((f: any) => f.entityType === "opportunity") || [];
    const getFieldValue = (fieldId: string) => {
        return (opp as any)?.customFields?.find((cf: any) => cf.fieldId === fieldId)?.value || "未填寫";
    };

    // ------ Mutations ------
    const assignMutation = trpc.opportunities.assignPresales.useMutation({
        onSuccess: () => { refetchAssignments(); refetchOpp(); setShowAssignModal(false); setAssignTechId(""); setAssignHours("8"); setAssignError(""); },
        onError: (err) => setAssignError(err.message || "指派失敗")
    });

    const logTimeMutation = trpc.opportunities.logPresalesTime.useMutation({
        onSuccess: () => { refetchTimesheets(); setShowTimesheetModal(false); setTsDate(new Date().toISOString().slice(0, 10)); setTsHours("4"); setTsDesc(""); setTsError(""); },
        onError: (err) => setTsError(err.message || "回報失敗")
    });

    const addMemberMutation = trpc.opportunities.addMember.useMutation({
        onSuccess: () => { refetchMembers(); setShowMemberModal(false); setMemberUserId(""); setMemberSearchTerm(""); setShowSearchDropdown(false); setMemberRole("watcher"); setMemberError(""); },
        onError: (err) => setMemberError(err.message || "新增失敗")
    });

    const removeMemberMutation = trpc.opportunities.removeMember.useMutation({
        onSuccess: () => refetchMembers()
    });

    const updateStatusMutation = trpc.opportunities.updateStatus.useMutation({
        onSuccess: () => { refetchOpp(); setShowStatusDropdown(false); }
    });

    const createSRMutation = trpc.opportunities.createSR.useMutation({
        onSuccess: (data) => {
            setShowSRModal(false);
            setSrTitle(""); setSrAmount(""); setSrPmId(""); setSrTechId(""); setSrError("");
            // Navigate to the new SR
            window.location.href = `/service-requests/${data.id}`;
        },
        onError: (err) => setSrError(err.message || "建立 SR 失敗")
    });

    // ------ Handlers ------
    const handleAssign = () => {
        if (!assignTechId) { setAssignError("請選擇技術員"); return; }
        const hours = parseFloat(assignHours);
        if (isNaN(hours) || hours <= 0) { setAssignError("請輸入有效時數"); return; }
        assignMutation.mutate({ opportunityId: id, techId: assignTechId, estimatedHours: hours });
    };

    const handleLogTime = () => {
        const hours = parseFloat(tsHours);
        if (isNaN(hours) || hours <= 0) { setTsError("請輸入有效時數"); return; }
        if (!tsDesc.trim()) { setTsError("請輸入工作描述"); return; }
        logTimeMutation.mutate({ opportunityId: id, workDate: new Date(tsDate), hours, description: tsDesc });
    };

    const handleAddMember = () => {
        if (!memberUserId) { setMemberError("請選擇使用者"); return; }
        addMemberMutation.mutate({ opportunityId: id, userId: memberUserId, memberRole });
    };

    const handleCreateSR = () => {
        if (!srTitle.trim()) { setSrError("請輸入 SR 名稱"); return; }
        const amount = parseFloat(srAmount);
        if (isNaN(amount) || amount <= 0) { setSrError("請輸入有效合約金額"); return; }
        
        createSRMutation.mutate({ 
            opportunityId: id, 
            title: srTitle, 
            contractAmount: amount, 
            pmId: srPmId || undefined,
            techId: srTechId || undefined
        });
    };

    if (isOppLoading || isMembersLoading || isAssignmentsLoading || isTimesheetsLoading) {
        return <div className="p-8 text-center animate-pulse">載入中...</div>;
    }
    if (!opp) return <div className="p-8 text-center text-red-500">找不到商機</div>;

    const currentStatus = OPP_STATUSES.find(s => s.value === opp.status) ?? OPP_STATUSES[0];
    const isConverted = opp.status === "converted";

    const getTechName = (techId: string) => {
        const found = presalesList?.find((u: any) => u.id === techId);
        return found ? found.name : `#${techId}`;
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center space-x-4 mb-2">
                <Link href="/opportunities">
                    <a className="p-2 rounded-full hover:bg-muted transition-colors">
                        <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                    </a>
                </Link>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">商機詳情</h1>
            </div>

            {/* 商機狀態流向圖 (Stepper) */}
            <div className="bg-card border border-border/50 rounded-xl p-5 shadow-sm flex items-center justify-between relative overflow-hidden">
                <div className="absolute top-[2.1rem] left-0 right-0 h-0.5 bg-muted mx-16 z-0" />
                <div 
                    className="absolute top-[2.1rem] left-0 right-0 h-0.5 bg-primary mx-16 z-0 transition-all duration-500" 
                    style={{ 
                        width: `calc(${((() => {
                            switch(opp.status) {
                                case 'new': return 0;
                                case 'qualified': return 1;
                                case 'presales_active': return 2;
                                case 'won': case 'lost': case 'converted': return 3;
                                default: return 0;
                            }
                        })() / 3) * 100}% - ${(() => {
                            const p = opp.status;
                            if (p === 'new') return '0%';
                            return '2rem'; // Offset for right aligns
                        })()})`
                    }} 
                />
                
                {[
                    { value: "new", label: "待處理" },
                    { value: "qualified", label: "已確認" },
                    { value: "presales_active", label: "協銷中" },
                    { value: "final", label: "已結案" }
                ].map((step, index) => {
                    const currentProgress = (() => {
                        switch(opp.status) {
                            case 'new': return 0;
                            case 'qualified': return 1;
                            case 'presales_active': return 2;
                            case 'won': case 'lost': case 'converted': return 3;
                            default: return 0;
                        }
                    })();
                    
                    const isCompleted = currentProgress > index;
                    const isActive = currentProgress === index;
                    
                    return (
                        <div key={step.value} className="flex flex-col items-center z-10 relative">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all ${
                                isCompleted ? 'bg-primary border-primary text-primary-foreground' : 
                                isActive ? 'bg-background border-primary text-primary shadow-sm shadow-primary/20' : 
                                'bg-background border-muted text-muted-foreground'
                            }`}>
                                {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
                            </div>
                            <span className={`text-xs mt-1.5 font-semibold ${isActive || isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {step.value === "final" && (opp.status === "won" || opp.status === "lost" || opp.status === "converted") 
                                    ? currentStatus.label 
                                    : step.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Opp Info Card */}
            <div className="bg-card border border-border/50 rounded-xl shadow-sm p-6">
                <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                    <div>
                        <div className="flex items-center space-x-3 mb-2">
                            <h2 className="text-2xl font-bold">{opp.title}</h2>
                            {/* Status badge with dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => !isConverted && setShowStatusDropdown(!showStatusDropdown)}
                                    disabled={isConverted}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 hover:opacity-80 transition-opacity ${currentStatus.color}`}
                                >
                                    {currentStatus.label}
                                    <ChevronDown className="w-3 h-3" />
                                </button>
                                {showStatusDropdown && !isConverted && (
                                    <div className="absolute top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg z-10 min-w-[140px] py-1">
                                        {OPP_STATUSES.filter(s => s.value !== opp.status).map(s => (
                                            <button
                                                key={s.value}
                                                onClick={() => updateStatusMutation.mutate({ id, status: s.value })}
                                                className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors ${s.color.replace('border-', '')} rounded-none first:rounded-t-md last:rounded-b-md`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center text-muted-foreground">
                            <Building2 className="w-4 h-4 mr-2" />
                            <span>{opp.customerName}</span>
                        </div>
                    </div>
                    {/* 一鍵建 SR */}
                    <button
                        onClick={() => { if (!isConverted) { setShowSRModal(true); setSrTitle(opp.title + " - SR"); setSrError(""); } }}
                        disabled={isConverted}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
                    >
                        <FileText className="w-4 h-4" />
                        {isConverted ? "已轉案，請結案重建" : "一鍵建立 SR / 專案"}
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-border/50">
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">商機 ID</span>
                        <p className="font-semibold">#{opp.id}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">預估金額</span>
                        <p className="font-semibold text-lg text-primary">NT$ {opp.estimatedValue.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground flex items-center"><Calendar className="w-4 h-4 mr-1" />建立日期</span>
                        <p className="font-semibold">{new Date(opp.createdAt).toLocaleDateString()}</p>
                    </div>
                </div>

                {/* 自訂欄位表格展示 */}
                {oppFields.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 mt-4 border-t border-border/30 border-dashed animate-in fade-in duration-300">
                        {oppFields.map((f: any) => (
                            <div key={f.id} className="space-y-1">
                                <span className="text-sm text-muted-foreground">{f.name}</span>
                                <p className="font-semibold text-sm">
                                    {f.fieldType === "switch" 
                                        ? (getFieldValue(f.id) === "true" ? "✅ 啟用" : "❌ 關閉") 
                                        : getFieldValue(f.id)}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 協銷指派 */}
                <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-border/50 bg-muted/30 flex justify-between items-center">
                        <h3 className="font-bold flex items-center"><Briefcase className="w-5 h-5 mr-2 text-primary" />協銷指派</h3>
                        <button onClick={() => { if (!isConverted) { setShowAssignModal(true); setAssignError(""); } }}
                            disabled={isConverted}
                            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center px-2 py-1 rounded hover:bg-primary/10 transition-colors disabled:opacity-50">
                            <Plus className="w-3 h-3 mr-1" /> 新增指派
                        </button>
                    </div>
                    <div className="p-4 flex-1">
                        {assignments && assignments.length > 0 ? (
                            <div className="space-y-3">
                                {assignments.map((a: any) => (
                                    <div key={a.id} className="p-3 border rounded-lg flex justify-between items-center hover:bg-muted/50 transition-colors">
                                        <div>
                                            <p className="font-medium text-sm">{getTechName(a.techId)}</p>
                                            <p className="text-xs text-muted-foreground">預估時數: {a.estimatedHours}h</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
                                <Briefcase className="w-8 h-8 opacity-20 mb-2" />
                                <p className="text-sm">尚無協銷指派</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 商機成員 */}
                <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-border/50 bg-muted/30 flex justify-between items-center">
                        <h3 className="font-bold flex items-center"><Users className="w-5 h-5 mr-2 text-primary" />商機成員</h3>
                        <button onClick={() => { if (!isConverted) { setShowMemberModal(true); setMemberError(""); } }}
                            disabled={isConverted}
                            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center px-2 py-1 rounded hover:bg-primary/10 transition-colors disabled:opacity-50">
                            <UserPlus className="w-3 h-3 mr-1" /> 新增成員
                        </button>
                    </div>
                    <div className="p-4 flex-1">
                        {members && members.length > 0 ? (
                            <div className="space-y-3">
                                {members.map((m: any) => {
                                    return (
                                        <div key={m.id} className="p-3 border rounded-lg flex justify-between items-center hover:bg-muted/50 transition-colors group">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                    {m.userName.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm">{m.userName}</p>
                                                    <p className="text-xs text-muted-foreground capitalize">{m.memberRole}</p>
                                                </div>
                                            </div>
                                            {m.memberRole !== "owner" && (
                                                <button
                                                    onClick={() => !isConverted && removeMemberMutation.mutate({ memberId: m.id })}
                                                    disabled={isConverted}
                                                    className="p-1 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded disabled:opacity-40"
                                                    title="移除成員"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
                                <Users className="w-8 h-8 opacity-20 mb-2" />
                                <p className="text-sm">尚無成員</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 協銷工時 */}
                <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden lg:col-span-2 flex flex-col">
                    <div className="p-4 border-b border-border/50 bg-muted/30 flex justify-between items-center">
                        <h3 className="font-bold flex items-center"><Clock className="w-5 h-5 mr-2 text-primary" />協銷工時紀錄</h3>
                        <button onClick={() => { setShowTimesheetModal(true); setTsError(""); }}
                            className="text-xs font-medium text-primary hover:text-primary/80 flex items-center px-2 py-1 rounded hover:bg-primary/10 transition-colors">
                            <Plus className="w-3 h-3 mr-1" /> 回報工時
                        </button>
                    </div>
                    <div className="p-4">
                        {timesheets && timesheets.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-muted-foreground bg-muted/50 uppercase">
                                        <tr>
                                            <th className="px-4 py-3 rounded-tl-lg">日期</th>
                                            <th className="px-4 py-3">技術員</th>
                                            <th className="px-4 py-3">時數</th>
                                            <th className="px-4 py-3">成本</th>
                                            <th className="px-4 py-3 rounded-tr-lg">描述</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {timesheets.map((ts: any) => (
                                            <tr key={ts.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-4 py-3">{new Date(ts.workDate).toLocaleDateString()}</td>
                                                <td className="px-4 py-3">{getTechName(ts.techId)}</td>
                                                <td className="px-4 py-3 font-medium">{ts.hours}h</td>
                                                <td className="px-4 py-3 text-muted-foreground">NT$ {ts.costAmount.toLocaleString()}</td>
                                                <td className="px-4 py-3 max-w-[200px] truncate" title={ts.description}>{ts.description}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-muted-foreground py-12 border-2 border-dashed border-border/50 rounded-xl">
                                <Clock className="w-8 h-8 opacity-20 mb-2" />
                                <p className="text-sm">尚無工時紀錄</p>
                                <button onClick={() => { setShowTimesheetModal(true); setTsError(""); }}
                                    className="mt-3 text-xs text-primary hover:underline flex items-center">
                                    <Plus className="w-3 h-3 mr-1" /> 立即回報工時
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ====== Modals ====== */}
            {/* 協銷指派 Modal */}
            {showAssignModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><Briefcase className="w-5 h-5 mr-2 text-primary" />新增協銷指派</h2>
                            <button onClick={() => setShowAssignModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">選擇技術員 / 售前人員</label>
                                <select value={assignTechId} onChange={e => setAssignTechId(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                                    <option value="">-- 請選擇 --</option>
                                    {presalesList?.map((u: any) => <option key={u.id} value={u.id}>{u.name}（{u.role}）</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">預估時數（小時）</label>
                                <input type="number" min="0.5" step="0.5" value={assignHours} onChange={e => setAssignHours(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                            </div>
                            {assignError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{assignError}</p>}
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button onClick={handleAssign} disabled={assignMutation.isPending}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center">
                                {assignMutation.isPending ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />指派中...</> : "確認指派"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 新增成員 Modal */}
            {showMemberModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><UserPlus className="w-5 h-5 mr-2 text-primary" />新增商機成員</h2>
                            <button onClick={() => setShowMemberModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">選擇使用者</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        placeholder="輸入姓名或 Email 搜尋..." 
                                        value={memberSearchTerm} 
                                        onChange={e => {
                                            setMemberSearchTerm(e.target.value);
                                            setShowSearchDropdown(true);
                                        }}
                                        onFocus={() => setShowSearchDropdown(true)}
                                        className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" 
                                    />
                                    {showSearchDropdown && (
                                        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                            {allUsers?.items?.filter((u: any) => 
                                                !members?.find((m: any) => m.userId === u.id) && 
                                                (u.name.toLowerCase().includes(memberSearchTerm.toLowerCase()) || u.email.toLowerCase().includes(memberSearchTerm.toLowerCase()))
                                            ).length === 0 ? (
                                                <div className="p-2 text-sm text-muted-foreground text-center">找不到對應人員</div>
                                            ) : (
                                                allUsers?.items?.filter((u: any) => 
                                                    !members?.find((m: any) => m.userId === u.id) && 
                                                    (u.name.toLowerCase().includes(memberSearchTerm.toLowerCase()) || u.email.toLowerCase().includes(memberSearchTerm.toLowerCase()))
                                                ).map((u: any) => (
                                                    <div 
                                                        key={u.id} 
                                                        onClick={() => {
                                                            setMemberUserId(u.id);
                                                            setMemberSearchTerm(u.name);
                                                            setShowSearchDropdown(false);
                                                        }}
                                                        className={`p-2 hover:bg-muted cursor-pointer text-sm ${memberUserId === u.id ? 'bg-primary/10 font-medium' : ''}`}
                                                    >
                                                        {u.name} <span className="text-xs text-muted-foreground">({u.email} - {u.role})</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">角色</label>
                                <select value={memberRole} onChange={e => setMemberRole(e.target.value as any)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                                    <option value="watcher">觀察者 (Watcher)</option>
                                    <option value="assignee">執行人員 (Assignee)</option>
                                    <option value="owner">負責人 (Owner)</option>
                                </select>
                            </div>
                            {memberError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{memberError}</p>}
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setShowMemberModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button onClick={handleAddMember} disabled={addMemberMutation.isPending}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center">
                                {addMemberMutation.isPending ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />新增中...</> : <><Check className="w-4 h-4 mr-1" />確認新增</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 回報工時 Modal */}
            {showTimesheetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><Clock className="w-5 h-5 mr-2 text-primary" />回報協銷工時</h2>
                            <button onClick={() => setShowTimesheetModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">工作日期</label>
                                <input type="date" value={tsDate} onChange={e => setTsDate(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">實際時數（小時）</label>
                                <input type="number" min="0.5" step="0.5" value={tsHours} onChange={e => setTsHours(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">工作描述</label>
                                <textarea value={tsDesc} onChange={e => setTsDesc(e.target.value)} rows={3} placeholder="請描述本次協銷工作內容..."
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
                            </div>
                            {tsError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{tsError}</p>}
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setShowTimesheetModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button onClick={handleLogTime} disabled={logTimeMutation.isPending}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center">
                                {logTimeMutation.isPending ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />送出中...</> : "確認回報"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 建立 SR / 專案 Modal */}
            {showSRModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><FileText className="w-5 h-5 mr-2 text-primary" />一鍵建立 SR / 專案</h2>
                            <button onClick={() => setShowSRModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <p className="text-sm text-muted-foreground">將此商機轉換為服務請求，狀態將自動更新為「已轉案」。</p>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">SR 名稱</label>
                                <input type="text" value={srTitle} onChange={e => setSrTitle(e.target.value)} placeholder="例：2026年 ABC公司 資安導入專案"
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">合約金額 (NT$)</label>
                                <input type="number" min="0" step="1000" value={srAmount} onChange={e => setSrAmount(e.target.value)} placeholder="例：1500000"
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">指派 PM (選用)</label>
                                <select value={srPmId} onChange={e => setSrPmId(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                                    <option value="">-- 請選擇 PM --</option>
                                    {(pmUsers || []).map((u: any) => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">指派技術人員 (選用)</label>
                                <select value={srTechId} onChange={e => setSrTechId(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                                    <option value="">-- 請選擇技術人員 --</option>
                                    {(techUsers || []).map((u: any) => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </select>
                            </div>
                            {srError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{srError}</p>}
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setShowSRModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button onClick={handleCreateSR} disabled={createSRMutation.isPending}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center">
                                {createSRMutation.isPending ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />建立中...</> : <><Check className="w-4 h-4 mr-1" />確認建立</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Close status dropdown on outside click */}
            {showStatusDropdown && <div className="fixed inset-0 z-0" onClick={() => setShowStatusDropdown(false)} />}
        </div>
    );
}
