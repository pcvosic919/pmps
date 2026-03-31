import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useRoute } from "wouter";
import { ArrowLeft, Plus, FileText, Clock, Trash2, Save, X, CheckCircle2, XCircle, Upload, Paperclip, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import toast from "react-hot-toast";
import { useCurrentUser } from "../lib/useCurrentUser";

export function WbsManagementPage() {
    const [, params] = useRoute("/service-requests/:id");
    const srId = params?.id || "";
    const utils = trpc.useContext();
    const { hasRole, user } = useCurrentUser();

    const [isBuildingVersion, setIsBuildingVersion] = useState(false);
    const [draftItems, setDraftItems] = useState<{ title: string, estimatedHours: number, assigneeId: string | undefined, startDate?: Date, endDate?: Date, completionPercentage?: number, colorCode?: string }[]>([]);

    // View settings
    const [isDaysMode, setIsDaysMode] = useState(false);
    const displayHours = (h: number) => isDaysMode ? (h / 8).toFixed(1) + ' 天' : h + ' 小時';
    const displayHoursShort = (h: number) => isDaysMode ? (h / 8).toFixed(1) + 'd' : h + 'h';

    // Review state
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState("");
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);

    // Version comparison state
    const [compareTargets, setCompareTargets] = useState<Record<string, string>>({});
    
    // Upload state
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Issue Management state
    const [isCreatingIssue, setIsCreatingIssue] = useState(false);
    const [newIssueData, setNewIssueData] = useState({ title: "", description: "", priority: "medium", assigneeId: "" });

    const { data: sr, isLoading, error } = trpc.projects.srById.useQuery({ id: srId }, { enabled: !!srId });
    const { data: techs } = trpc.users.techList.useQuery();
    const { data: allUsers } = trpc.users.list.useQuery({ limit: 500 });
    const { data: attachments, refetch: refetchAttachments } = trpc.projects.srAttachmentsList.useQuery({ srId }, { enabled: !!srId });

    // Review state...
    
    const reviewMutation = trpc.projects.reviewWbsVersion.useMutation({
        onSuccess: () => {
            utils.projects.srById.invalidate({ id: srId });
            setReviewingId(null);
            setShowRejectModal(false);
            setRejectionReason("");
            toast.success("審核已提交");
        }
    });

    const submitVersion = trpc.projects.submitWbsVersion.useMutation({
        onSuccess: () => {
            utils.projects.srById.invalidate({ id: srId });
            setIsBuildingVersion(false);
            setDraftItems([]);
            toast.success("WBS 版本已送出審核");
        }
    });

    const uploadMutation = trpc.projects.uploadSrAttachment.useMutation({
        onSuccess: () => {
            refetchAttachments();
            toast.success("檔案上傳成功");
        }
    });

    const { data: issues, refetch: refetchIssues } = trpc.issues.listBySr.useQuery({ srId }, { enabled: !!srId });

    const createIssueMutation = trpc.issues.create.useMutation({
        onSuccess: () => {
            refetchIssues();
            setIsCreatingIssue(false);
            setNewIssueData({ title: "", description: "", priority: "medium", assigneeId: "" });
            toast.success("專案議題已建立");
        }
    });

    const updateIssueMutation = trpc.issues.update.useMutation({
        onSuccess: () => {
            refetchIssues();
            toast.success("專案議題狀態已更新");
        }
    });

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;
    if (error) return <div className="p-8 text-center text-destructive">無法存取：{error.message}</div>;
    if (!sr) return <div className="p-8 text-center text-destructive">找不到該服務請求 (SR)</div>;

    const nextVersionNumber = sr.wbsVersions && sr.wbsVersions.length > 0
        ? Math.max(...sr.wbsVersions.map((v: any) => v.version)) + 1
        : 1;
    const latestVersion = sr.wbsVersions?.length
        ? [...sr.wbsVersions].sort((a: any, b: any) => b.version - a.version)[0]
        : null;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft': return 'bg-gray-100 text-gray-800 border-gray-200';
            case 'submitted': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'approved': return 'bg-green-100 text-green-800 border-green-200';
            case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getStatusText = (status: string) => {
        const map: Record<string, string> = { draft: '草稿', submitted: '待審核', approved: '已核准', rejected: '已退回' };
        return map[status] || status;
    };

    const getActionMeta = (action: string) => {
        switch(action) {
            case 'submitted': return { text: '提交版本', color: 'text-blue-600', bg: 'bg-blue-400' };
            case 'approved': return { text: '核准版本', color: 'text-emerald-600', bg: 'bg-emerald-400' };
            case 'rejected': return { text: '退回版本', color: 'text-rose-600', bg: 'bg-rose-400' };
            default: return { text: action, color: 'text-gray-600', bg: 'bg-gray-400' };
        }
    };

    const handleAddDraftItem = () => setDraftItems([...draftItems, { title: "", estimatedHours: 4, assigneeId: undefined }]);
    const handleUpdateDraftItem = (index: number, field: string, value: any) => {
        const newItems = [...draftItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setDraftItems(newItems);
    };
    const handleRemoveDraftItem = (index: number) => setDraftItems(draftItems.filter((_, i) => i !== index));
    const handleStartBuild = () => {
        if (latestVersion?.items?.length) {
            setDraftItems(latestVersion.items.map((item: any) => ({
                title: item.title,
                estimatedHours: item.estimatedHours,
                assigneeId: item.assigneeId,
                startDate: item.startDate ? new Date(item.startDate) : undefined,
                endDate: item.endDate ? new Date(item.endDate) : undefined,
                completionPercentage: item.completionPercentage || 0,
                colorCode: item.colorCode || "#E2E8F0"
            })));
        } else {
            setDraftItems([]);
        }
        setIsBuildingVersion(true);
    };

    const getComparisonMeta = (version: any) => {
        const compareWithId = compareTargets[version.id];
        const compareWithVer = compareWithId ? sr.wbsVersions.find((v: any) => v.id === compareWithId) : null;

        if (!compareWithVer) {
            return null;
        }

        const compareByTitle = new Map(compareWithVer.items.map((item: any) => [item.title, item]));
        const currentByTitle = new Map(version.items.map((item: any) => [item.title, item]));

        const added = version.items.filter((item: any) => !compareByTitle.has(item.title));
        const removed = compareWithVer.items.filter((item: any) => !currentByTitle.has(item.title));
        const changed = version.items.filter((item: any) => {
            const prev = compareByTitle.get(item.title) as any;
            return prev && (prev.estimatedHours !== item.estimatedHours || prev.assigneeId !== item.assigneeId);
        });

        return { compareWithVer, added, removed, changed };
    };

    const handleSaveVersion = () => {
        if (draftItems.length === 0) { toast.error("請至少新增一項任務"); return; }
        if (draftItems.some(i => !i.title || i.estimatedHours <= 0)) { toast.error("請確實填寫項目名稱與工時"); return; }
        submitVersion.mutate({ srId: sr.id, versionNumber: nextVersionNumber, items: draftItems });
    };

    const handleExportCsv = () => {
        if (!latestVersion || !latestVersion.items?.length) {
            toast.error("沒有可匯出的 WBS 版本資料");
            return;
        }
        const headers = ["任務標題", "預估工時 (Hours)", "指派對象", "進度百分比 (%)", "十六進位色彩色標"];
        const rows = latestVersion.items.map((item: any) => [
            `"${item.title.replace(/"/g, '""')}"`,
            item.estimatedHours,
            `"${techs?.find(t => t.id === item.assigneeId)?.name || '未指派'}"`,
            item.completionPercentage || 0,
            `"${item.colorCode || '#E2E8F0'}"`
        ]);
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((r: any[]) => r.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `WBS_Export_SR${sr.id}_v${latestVersion.version}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("WBS 已成功匯出");
    };

    // File upload (Mock implementation)
    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        
        setIsUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // Mock: Generate a local URL and call the backend mutation
                const mockUrl = URL.createObjectURL(file);
                await uploadMutation.mutateAsync({
                    srId,
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                    fileUrl: mockUrl
                });
            }
        } catch (error) {
            console.error("Upload failed", error);
            toast.error("檔案上傳失敗");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileUpload(e.dataTransfer.files);
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center space-x-4 mb-4">
                <Link href="/projects">
                    <a className="p-2 hover:bg-muted rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </a>
                </Link>
                <div>
                    <h2 className="text-2xl font-bold flex items-center flex-wrap gap-2">
                        SR-#{sr.id} WBS 管理
                        <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{sr.title}</span>
                    </h2>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Left Column: Info + Attachments */}
                <div className="space-y-6">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                        <h3 className="font-semibold text-lg mb-4 border-b pb-2">基本資訊</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">建立日期</span>
                                <span className="font-medium">{new Date(sr.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">合約金額</span>
                                <span className="font-bold">NT$ {sr.contractAmount?.toLocaleString() || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">預估毛利</span>
                                <span className={`font-bold ${sr.marginWarning ? 'text-destructive' : 'text-green-600'}`}>{sr.marginEstimate}%</span>
                            </div>
                        </div>
                    </div>

                    {/* File Upload Area */}
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <h3 className="font-semibold text-base mb-3 flex items-center"><Paperclip className="w-4 h-4 mr-2 text-primary" />專案附件</h3>
                        <div
                            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => !isUploading && document.getElementById('file-input')?.click()}
                        >
                            <Upload className={`w-7 h-7 mx-auto mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground/50'}`} />
                            <p className="text-xs text-muted-foreground">{isUploading ? "上傳中..." : "拖曳或點擊上傳檔案"}</p>
                            <input
                                id="file-input" type="file" multiple style={{ display: 'none' }}
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
                                onChange={e => handleFileUpload(e.target.files)}
                                disabled={isUploading}
                            />
                        </div>
                        {attachments && attachments.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {attachments.map((a: any) => (
                                    <div key={a.id} className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg text-xs group">
                                        <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                        <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate font-medium hover:text-primary transition-colors" title={a.fileName}>
                                            {a.fileName}
                                        </a>
                                        <span className="text-muted-foreground whitespace-nowrap">{formatSize(a.fileSize)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Issues Tracking Area */}
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-semibold text-base flex items-center"><AlertCircle className="w-4 h-4 mr-2 text-primary" />專案議題追蹤</h3>
                            <button onClick={() => setIsCreatingIssue(true)} className="p-1.5 hover:bg-muted bg-primary/10 rounded-lg text-primary transition-colors"><Plus className="w-4 h-4" /></button>
                        </div>
                        {issues && issues.length > 0 ? (
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                                {issues.map((i: any) => (
                                    <div key={i.id} className="p-3 border border-border rounded-lg bg-background text-sm hover:border-primary/40 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-bold truncate text-[13px]" title={i.title}>{i.title}</span>
                                            <select 
                                                value={i.status} 
                                                onChange={e => updateIssueMutation.mutate({ id: i.id, status: e.target.value as any })}
                                                className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold outline-none focus:ring-2 focus:ring-primary/30 ${i.status === 'resolved' || i.status === 'closed' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}
                                            >
                                                <option value="open">待處理 (Open)</option>
                                                <option value="in_progress">處理中 (WIP)</option>
                                                <option value="resolved">已解決 (Resolved)</option>
                                                <option value="closed">已結案 (Closed)</option>
                                            </select>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{i.description}</p>
                                        <div className="flex justify-between items-center mt-3 text-[10px] text-muted-foreground border-t border-border/50 pt-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-1 rounded font-medium ${i.priority === 'critical' ? 'bg-red-100 text-red-600' : i.priority === 'high' ? 'bg-orange-100 text-orange-600' : 'bg-muted'}`}>
                                                    {i.priority.toUpperCase()}
                                                </span>
                                                <span className="bg-muted px-1.5 py-0.5 rounded border border-border/50 text-foreground">指派: {i.assigneeId?.name || "未分派"}</span>
                                            </div>
                                            <span>{new Date(i.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center p-6 border border-dashed rounded-lg bg-background text-xs text-muted-foreground">目前專案運作良好，尚無未結案之議題。</div>
                        )}
                    </div>
                </div>

                {/* Right Column: Versions */}
                <div className="md:col-span-2 space-y-4">
                    {!isBuildingVersion ? (
                        <>
                            <div className="flex justify-between items-center bg-card p-4 rounded-xl shadow-sm border border-border">
                                <h3 className="font-bold text-lg flex items-center"><FileText className="w-5 h-5 mr-2 text-primary" />WBS 版本歷史</h3>
                                <div className="flex items-center gap-3">
                                    <label onClick={() => setIsDaysMode(!isDaysMode)} className="flex items-center gap-2 cursor-pointer text-sm font-medium mr-2">
                                        <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDaysMode ? 'bg-primary' : 'bg-muted border border-border'}`}>
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${isDaysMode ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                                        </div>
                                        <span className="text-muted-foreground">{isDaysMode ? '人天模式 (Days)' : '人時模式 (Hours)'}</span>
                                    </label>
                                    <button onClick={handleExportCsv} className="bg-muted text-foreground hover:bg-muted/80 border px-3 py-1.5 rounded-md inline-flex items-center text-sm font-medium transition-colors shadow-sm">
                                        匯出 CSV
                                    </button>
                                    {(!latestVersion || latestVersion.status !== "submitted") && (hasRole("admin") || hasRole("manager") || hasRole("tech") || hasRole("presales") || user?.id === sr.pmId) && (
                                        <button onClick={handleStartBuild}
                                            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-1.5 rounded-md inline-flex items-center text-sm font-medium transition-colors shadow-sm">
                                            <Plus className="w-4 h-4 mr-1.5" />建立 v{nextVersionNumber} 
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3">
                                {sr.wbsVersions && sr.wbsVersions.length > 0 ? (
                                    sr.wbsVersions.sort((a: any, b: any) => b.version - a.version).map((version: any) => {
                                        const compareWithId = compareTargets[version.id];
                                        const comparison = getComparisonMeta(version);

                                        return (
                                        <div key={version.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-colors shadow-sm flex flex-col gap-4">
                                            <div className="flex items-center justify-between flex-wrap gap-3">
                                                <div>
                                                    <div className="flex items-center mb-1 gap-3">
                                                        <span className="font-bold text-lg">版本 v{version.version}</span>
                                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(version.status)}`}>
                                                            {getStatusText(version.status)}
                                                        </span>
                                                        {sr.wbsVersions.length > 1 && (
                                                            <select
                                                                value={compareWithId || ""}
                                                                onChange={(e) => setCompareTargets({...compareTargets, [version.id]: e.target.value})}
                                                                className="text-xs border border-border rounded px-1.5 py-0.5 bg-background font-medium hover:border-primary/50 transition-colors focus:outline-none"
                                                            >
                                                                <option value="">對比基準...</option>
                                                                {sr.wbsVersions.filter((v: any) => v.id !== version.id).map((v: any) => (
                                                                    <option key={v.id} value={v.id}>v{v.version} ({getStatusText(v.status)})</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center text-sm text-muted-foreground space-x-4">
                                                        <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1" />{new Date(version.createdAt).toLocaleDateString()}</span>
                                                        <span>總預估工量: <span className="font-medium text-foreground">{displayHours(version.totalEstimatedHours || 0)}</span></span>
                                                    </div>
                                                    {version.rejectionReason && (
                                                        <div className="mt-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
                                                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                            <span>退回原因：{version.rejectionReason}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {version.status === "submitted" && (hasRole("admin") || hasRole("manager") || user?.id === sr.pmId) && (
                                                    <div className="flex gap-2">
                                                        {reviewingId === version.id ? (
                                                            <span className="text-xs text-muted-foreground animate-pulse">處理中...</span>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => { setReviewingId(version.id); reviewMutation.mutate({ id: version.id, action: "approved" }); }}
                                                                    disabled={reviewMutation.isPending}
                                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                                                                >
                                                                    <CheckCircle2 className="w-3.5 h-3.5" />核准
                                                                </button>
                                                                <button
                                                                    onClick={() => { setRejectTargetId(version.id); setShowRejectModal(true); }}
                                                                    disabled={reviewMutation.isPending}
                                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                                                                >
                                                                    <XCircle className="w-3.5 h-3.5" />退回
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {version.auditLogs && version.auditLogs.length > 0 && (
                                                <div className="mt-2 pt-3 border-t border-border">
                                                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">審核歷程 (Audit Logs)</h4>
                                                    <div className="space-y-3 pl-1">
                                                        {version.auditLogs.map((log: any, i: number) => {
                                                            const user = allUsers?.items?.find(u => u.id === log.userId);
                                                            const meta = getActionMeta(log.action);
                                                            return (
                                                                <div key={i} className="text-xs relative">
                                                                    {i !== version.auditLogs.length - 1 && (
                                                                        <div className="absolute left-[3px] top-3 w-[1.5px] h-full bg-border" />
                                                                    )}
                                                                    <div className="flex items-start gap-2 relative z-10">
                                                                        <div className={`mt-0.5 w-2 h-2 rounded-full ${meta.bg} flex-shrink-0 shadow-sm ring-2 ring-background`} />
                                                                        <div className="flex-1 -mt-0.5">
                                                                            <span className="font-medium mr-1 text-foreground">{user?.name || log.userId}</span>
                                                                            <span className={meta.color}>{meta.text}</span>
                                                                            <span className="text-[10px] text-muted-foreground ml-2 bg-muted/50 px-1.5 py-0.5 rounded">{new Date(log.timestamp).toLocaleString()}</span>
                                                                            {log.reason && <p className="text-muted-foreground mt-1 bg-muted/30 border border-border/50 p-1.5 rounded text-[11px] leading-relaxed">原因：{log.reason}</p>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {comparison && (
                                                <div className="grid gap-2 sm:grid-cols-3">
                                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                                                        新增項目 <span className="ml-1 font-bold">{comparison.added.length}</span>
                                                    </div>
                                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                                        調整項目 <span className="ml-1 font-bold">{comparison.changed.length}</span>
                                                    </div>
                                                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                                                        移除項目 <span className="ml-1 font-bold">{comparison.removed.length}</span>
                                                    </div>
                                                </div>
                                            )}

                                            {version.items && version.items.length > 0 && (
                                                <div className="bg-muted/30 rounded-lg p-3 space-y-2 mt-2">
                                                    {version.items.map((item: any) => {
                                                        const compareWithVer = comparison?.compareWithVer ?? null;
                                                        const compareItem = compareWithVer?.items.find((i: any) => i.title === item.title);
                                                        const hourDiff = compareItem ? item.estimatedHours - compareItem.estimatedHours : null;
                                                        const assigneeChanged = compareItem && compareItem.assigneeId !== item.assigneeId;
                                                        const isAdded = !!comparison && comparison.added.some((addedItem: any) => addedItem.title === item.title);

                                                        return (
                                                            <div key={item.id} className={`
                                                                text-sm flex justify-between items-center border p-2 rounded hover:shadow-sm transition-shadow relative overflow-hidden
                                                                ${isAdded ? "border-emerald-300 bg-emerald-50/60" : "border-border bg-background"}
                                                            `}>
                                                                {item.colorCode && (
                                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: item.colorCode }} />
                                                                )}
                                                                <div className="pl-2">
                                                                    <div className="font-medium flex items-center gap-2">
                                                                        {item.title}
                                                                        {isAdded && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">新增</span>}
                                                                        {assigneeChanged && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">改派</span>}
                                                                    </div>
                                                                    <div className="mt-1.5 flex items-center gap-2 w-48">
                                                                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                                            <div className="h-full bg-primary transition-all" style={{ width: `${item.completionPercentage || 0}%`, backgroundColor: item.colorCode || 'hsl(var(--primary))' }} />
                                                                        </div>
                                                                        <span className="text-[10px] text-muted-foreground font-mono">{item.completionPercentage || 0}%</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-4 text-xs text-muted-foreground z-10">
                                                                    {hourDiff !== null && hourDiff !== 0 && (
                                                                        <span className={`font-bold px-1.5 py-0.5 rounded flex items-center text-[10px] ${hourDiff > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                                            {hourDiff > 0 ? '+' : ''}{displayHoursShort(hourDiff)}
                                                                        </span>
                                                                    )}
                                                                    <span className="bg-muted px-1.5 py-0.5 rounded font-mono">{displayHoursShort(item.estimatedHours)}</span>
                                                                    <div className="flex flex-col items-end gap-1">
                                                                        <span className="min-w-[60px] text-right">{techs?.find(t => t.id === item.assigneeId)?.name || '未指派'}</span>
                                                                        {(item.startDate || item.endDate) && (
                                                                            <span className="text-[9px] text-muted-foreground bg-primary/5 border border-primary/10 px-1 rounded whitespace-nowrap">
                                                                                {item.startDate ? new Date(item.startDate).toLocaleDateString() : '未定'} ~ {item.endDate ? new Date(item.endDate).toLocaleDateString() : '未定'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {comparison && comparison.removed.length > 0 && (
                                                        <div className="rounded-lg border border-dashed border-rose-300 bg-rose-50/70 p-3">
                                                            <div className="text-xs font-semibold text-rose-700 mb-2">相較於 v{comparison.compareWithVer.version} 已移除的項目</div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {comparison.removed.map((item: any) => (
                                                                    <span key={item.id} className="rounded-full bg-white px-2 py-1 text-[11px] text-rose-700 border border-rose-200">
                                                                        {item.title} · {item.estimatedHours}h
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )})
                                ) : (
                                    <div className="p-8 text-center bg-muted/30 border border-dashed rounded-xl">
                                        <p className="text-muted-foreground">目前還沒有任何 WBS 版本，請建立以開始派工</p>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        // WBS Builder Mode
                        <div className="bg-card border border-primary/20 rounded-xl shadow-lg ring-1 ring-primary/20 flex flex-col">
                            <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center rounded-t-xl">
                                <h3 className="font-bold text-lg flex items-center"><Plus className="w-5 h-5 mr-2 text-primary" />草稿：建立版本 v{nextVersionNumber}</h3>
                                <button onClick={() => { setIsBuildingVersion(false); setDraftItems([]); }}
                                    className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-4 space-y-4 flex-1">
                                <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                                    在此規劃專案的工作分解結構 (WBS)，包含各項子任務、預估工時，並指派給對應的技術人員。
                                    {latestVersion?.items?.length ? ` 已自動帶入 v${latestVersion.version} 作為草稿基底，可直接微調後送審。` : ""}
                                </div>
                                {draftItems.length === 0 ? (
                                    <div className="text-center p-8 border border-dashed rounded-lg bg-background">
                                        <p className="text-muted-foreground mb-4">目前沒有任何任務項目</p>
                                        <button onClick={handleAddDraftItem} className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80">
                                            <Plus className="w-4 h-4 mr-1" /> 新增第一項任務
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {draftItems.map((item, idx) => (
                                            <div key={idx} className="flex gap-2 items-start bg-background p-3 rounded-lg border border-border group hover:border-primary/40 transition-colors">
                                                <div className="flex-1 space-y-2">
                                                    <input type="text" placeholder="任務標題 (必填)" value={item.title}
                                                        onChange={(e) => handleUpdateDraftItem(idx, 'title', e.target.value)}
                                                        className="w-full text-sm font-medium bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:ring-0 px-1 py-1 transition-colors outline-none"
                                                    />
                                                    <div className="flex gap-4 items-center">
                                                        <div className="flex items-center text-xs text-muted-foreground">
                                                            <span className="mr-2">色標:</span>
                                                            <input type="color" value={item.colorCode || "#E2E8F0"}
                                                                onChange={(e) => handleUpdateDraftItem(idx, 'colorCode', e.target.value)}
                                                                className="w-12 h-6 p-0 border-0 rounded cursor-pointer ring-1 ring-border"
                                                            />
                                                        </div>
                                                        <div className="flex items-center text-xs text-muted-foreground w-32">
                                                            <span className="mr-2">進度:</span>
                                                            <input type="range" min="0" max="100" step="5" value={item.completionPercentage || 0}
                                                                onChange={(e) => handleUpdateDraftItem(idx, 'completionPercentage', Number(e.target.value))}
                                                                className="flex-1 accent-primary"
                                                            />
                                                            <span className="ml-2 min-w-8 font-mono">{item.completionPercentage || 0}%</span>
                                                        </div>
                                                        <div className="flex items-center text-xs text-muted-foreground">
                                                            <span className="mr-2">預估工量(H):</span>
                                                            <input type="number" min="0.5" step="0.5" value={item.estimatedHours}
                                                                onChange={(e) => handleUpdateDraftItem(idx, 'estimatedHours', Number(e.target.value))}
                                                                className="w-16 px-2 py-1 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none"
                                                            />
                                                        </div>
                                                        <div className="flex items-center text-xs text-muted-foreground flex-1">
                                                            <span className="mr-2">指派給:</span>
                                                            <select value={item.assigneeId || ""}
                                                                onChange={(e) => handleUpdateDraftItem(idx, 'assigneeId', e.target.value ? e.target.value : undefined)}
                                                                className="flex-1 px-2 py-1 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none min-w-0">
                                                                <option value="">-- 未指派 --</option>
                                                                {techs?.map(tech => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="flex items-center text-xs text-muted-foreground">
                                                            <span className="mr-1">排程起訖:</span>
                                                            <input type="date" value={item.startDate ? typeof item.startDate === "string" ? item.startDate : new Date(item.startDate).toISOString().slice(0, 10) : ""}
                                                                onChange={(e) => handleUpdateDraftItem(idx, 'startDate', e.target.value)}
                                                                className="w-28 text-[10px] px-1 py-1 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none"
                                                            />
                                                            <span className="mx-1">-</span>
                                                            <input type="date" value={item.endDate ? typeof item.endDate === "string" ? item.endDate : new Date(item.endDate).toISOString().slice(0, 10) : ""}
                                                                onChange={(e) => handleUpdateDraftItem(idx, 'endDate', e.target.value)}
                                                                className="w-28 text-[10px] px-1 py-1 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleRemoveDraftItem(idx)}
                                                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded" title="移除此項">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        <button onClick={handleAddDraftItem}
                                            className="w-full py-2 border border-dashed border-primary/40 text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors flex items-center justify-center gap-1">
                                            <Plus className="w-4 h-4" /> 新增任務項目
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-border bg-muted/10 flex justify-between items-center rounded-b-xl">
                                <div className="text-sm">
                                    <span className="text-muted-foreground mr-2">總計工時:</span>
                                    <span className="font-bold text-lg">{draftItems.reduce((sum, i) => sum + i.estimatedHours, 0)} 小時</span>
                                </div>
                                <button onClick={handleSaveVersion} disabled={submitVersion.isPending || draftItems.length === 0}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-md font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
                                    {submitVersion.isPending ? "儲存中..." : <><Save className="w-4 h-4" /> 送出版本審核</>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><XCircle className="w-5 h-5 mr-2 text-red-500" />退回 WBS 版本</h2>
                            <button onClick={() => setShowRejectModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">退回原因（必填）</label>
                            <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={3}
                                placeholder="請說明退回的原因，供提交者修改參考..."
                                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button
                                onClick={() => {
                                    if (!rejectionReason.trim()) { toast.error("請填寫退回原因"); return; }
                                    if (rejectTargetId) reviewMutation.mutate({ id: rejectTargetId, action: "rejected", rejectionReason });
                                }}
                                disabled={reviewMutation.isPending || !rejectionReason.trim()}
                                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                            >
                                確認退回
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Issue Modal */}
            {isCreatingIssue && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm shadow-2xl transition-opacity animate-in fade-in">
                    <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-5 animate-in zoom-in-95">
                        <div className="flex justify-between items-center border-b border-border/50 pb-3">
                            <h2 className="text-xl font-bold flex items-center tracking-tight"><AlertCircle className="w-5 h-5 mr-2 text-primary" />建立專案追蹤議題</h2>
                            <button onClick={() => setIsCreatingIssue(false)} className="p-1.5 rounded-full hover:bg-muted bg-muted/50 transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold mb-1.5 text-foreground/90">議題標題</label>
                                <input value={newIssueData.title} onChange={e => setNewIssueData({...newIssueData, title: e.target.value})} placeholder="簡述發生的問題或阻礙" className="w-full border border-input rounded-lg px-3 py-2.5 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1.5 text-foreground/90">詳細說明與重現步驟</label>
                                <textarea value={newIssueData.description} onChange={e => setNewIssueData({...newIssueData, description: e.target.value})} rows={4} placeholder="盡可能提供詳細的背景資訊以便釐清問題..." className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none transition-shadow" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5 text-foreground/90">優先等級</label>
                                    <select value={newIssueData.priority} onChange={e => setNewIssueData({...newIssueData, priority: e.target.value})} className="w-full border border-input rounded-lg px-3 py-2.5 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow">
                                        <option value="low">低優先 (Low)</option>
                                        <option value="medium">一般 (Medium)</option>
                                        <option value="high">高優先 (High)</option>
                                        <option value="critical">緊急且阻礙進度 (Critical)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5 text-foreground/90">指派對象</label>
                                    <select value={newIssueData.assigneeId} onChange={e => setNewIssueData({...newIssueData, assigneeId: e.target.value})} className="w-full border border-input rounded-lg px-3 py-2.5 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow">
                                        <option value="">-- 保留未指派 --</option>
                                        {techs?.map(t => <option key={t.id} value={t.id}>{t.name} ({t.role})</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border/50">
                            <button onClick={() => setIsCreatingIssue(false)} className="px-5 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors">取消</button>
                            <button
                                onClick={() => {
                                    if (!newIssueData.title || !newIssueData.description) { toast.error("為確保追蹤品質，標題與說明為必填項目"); return; }
                                    createIssueMutation.mutate({ srId, ...newIssueData, priority: newIssueData.priority as any, assigneeId: newIssueData.assigneeId || undefined });
                                }}
                                disabled={createIssueMutation.isPending}
                                className="px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                            >
                                確認建立
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
