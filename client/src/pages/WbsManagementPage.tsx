import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useRoute } from "wouter";
import { ArrowLeft, Plus, FileText, Clock, Trash2, Save, X, CheckCircle2, XCircle, Upload, Paperclip, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import toast from "react-hot-toast";

export function WbsManagementPage() {
    const [_match, params] = useRoute("/service-requests/:id");
    const srId = params?.id ? parseInt(params.id) : 0;
    const utils = trpc.useContext();

    const [isBuildingVersion, setIsBuildingVersion] = useState(false);
    const [draftItems, setDraftItems] = useState<{ title: string, estimatedHours: number, assigneeId: number | undefined }[]>([]);

    // Review state
    const [reviewingId, setReviewingId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState("");
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);

    // Upload state
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const { data: sr, isLoading } = trpc.projects.srById.useQuery({ id: srId }, { enabled: !!srId });
    const { data: techs } = trpc.users.techList.useQuery();
    const { data: attachments, refetch: refetchAttachments } = trpc.projects.srAttachmentsList.useQuery({ srId }, { enabled: !!srId });
    
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

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;
    if (!sr) return <div className="p-8 text-center text-destructive">找不到該服務請求 (SR)</div>;

    const nextVersionNumber = sr.wbsVersions && sr.wbsVersions.length > 0
        ? Math.max(...sr.wbsVersions.map((v: any) => v.version)) + 1
        : 1;

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

    const handleAddDraftItem = () => setDraftItems([...draftItems, { title: "", estimatedHours: 4, assigneeId: undefined }]);
    const handleUpdateDraftItem = (index: number, field: string, value: any) => {
        const newItems = [...draftItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setDraftItems(newItems);
    };
    const handleRemoveDraftItem = (index: number) => setDraftItems(draftItems.filter((_, i) => i !== index));

    const handleSaveVersion = () => {
        if (draftItems.length === 0) { toast.error("請至少新增一項任務"); return; }
        if (draftItems.some(i => !i.title || i.estimatedHours <= 0)) { toast.error("請確實填寫項目名稱與工時"); return; }
        submitVersion.mutate({ srId: sr.id, versionNumber: nextVersionNumber, items: draftItems });
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
                </div>

                {/* Right Column: Versions */}
                <div className="md:col-span-2 space-y-4">
                    {!isBuildingVersion ? (
                        <>
                            <div className="flex justify-between items-center bg-card p-4 rounded-xl shadow-sm border border-border">
                                <h3 className="font-bold text-lg flex items-center"><FileText className="w-5 h-5 mr-2 text-primary" />WBS 版本歷史</h3>
                                <button onClick={() => setIsBuildingVersion(true)}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md inline-flex items-center text-sm font-medium transition-colors">
                                    <Plus className="w-4 h-4 mr-2" />建立 v{nextVersionNumber} 版本
                                </button>
                            </div>

                            <div className="space-y-3">
                                {sr.wbsVersions && sr.wbsVersions.length > 0 ? (
                                    sr.wbsVersions.sort((a: any, b: any) => b.version - a.version).map((version: any) => (
                                        <div key={version.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-colors shadow-sm flex flex-col gap-4">
                                            <div className="flex items-center justify-between flex-wrap gap-3">
                                                <div>
                                                    <div className="flex items-center mb-1 gap-3">
                                                        <span className="font-bold text-lg">版本 v{version.version}</span>
                                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(version.status)}`}>
                                                            {getStatusText(version.status)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center text-sm text-muted-foreground space-x-4">
                                                        <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1" />{new Date(version.createdAt).toLocaleDateString()}</span>
                                                        <span>總預估工時: <span className="font-medium text-foreground">{version.totalEstimatedHours || 0}</span> 小時</span>
                                                    </div>
                                                    {version.rejectionReason && (
                                                        <div className="mt-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
                                                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                            <span>退回原因：{version.rejectionReason}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {version.status === "submitted" && (
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

                                            {version.items && version.items.length > 0 && (
                                                <div className="bg-muted/30 rounded-lg p-3 space-y-2 mt-2">
                                                    {version.items.map((item: any) => (
                                                        <div key={item.id} className="text-sm flex justify-between items-center bg-background border border-border p-2 rounded">
                                                            <div className="font-medium">{item.title}</div>
                                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                                <span>工時: {item.estimatedHours}h</span>
                                                                <span className="min-w-[60px] text-right">{techs?.find(t => t.id === item.assigneeId)?.name || '未指派'}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))
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
                                <p className="text-sm text-muted-foreground">在此規劃專案的工作分解結構 (WBS)，包含各項子任務、預估工時，並指派給對應的技術人員。</p>
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
                                                    <div className="flex gap-4">
                                                        <div className="flex items-center text-xs text-muted-foreground">
                                                            <span className="mr-2">預估(H):</span>
                                                            <input type="number" min="0.5" step="0.5" value={item.estimatedHours}
                                                                onChange={(e) => handleUpdateDraftItem(idx, 'estimatedHours', Number(e.target.value))}
                                                                className="w-16 px-2 py-1 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none"
                                                            />
                                                        </div>
                                                        <div className="flex items-center text-xs text-muted-foreground flex-1">
                                                            <span className="mr-2">指派給:</span>
                                                            <select value={item.assigneeId || ""}
                                                                onChange={(e) => handleUpdateDraftItem(idx, 'assigneeId', e.target.value ? Number(e.target.value) : undefined)}
                                                                className="flex-1 px-2 py-1 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none min-w-0">
                                                                <option value="">-- 未指派 --</option>
                                                                {techs?.map(tech => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                                                            </select>
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
        </div>
    );
}
