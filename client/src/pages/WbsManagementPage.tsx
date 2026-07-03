import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useRoute } from "wouter";
import { ArrowLeft, Plus, FileText, Clock, Trash2, Save, X, CheckCircle2, XCircle, Upload, Paperclip, AlertCircle, Receipt } from "lucide-react";
import { Link } from "wouter";
import toast from "react-hot-toast";
import { useCurrentUser } from "../lib/useCurrentUser";
import * as XLSX from "xlsx";
import { SharePointFilesSection } from "../components/SharePointFilesSection";
import { exportWbsCostWorkbook, exportWbsQuoteWorkbook, formatExportDate, makeXlsxFileName } from "../lib/exportXlsx";
import { BusinessUserPicker } from "../components/BusinessUserPicker";

type WbsDraftItem = {
    title: string;
    estimatedHours: number;
    assigneeId: string | undefined;
    startDate?: Date;
    endDate?: Date;
    completionPercentage?: number;
    colorCode?: string;
    level?: number;
    code?: string;
    remarks?: string;
    description?: string;
};

type WbsImportPreview = {
    items: WbsDraftItem[];
    summary: {
        added: number;
        changed: number;
        removed: number;
        unchanged: number;
    };
    warnings: string[];
};

export function WbsManagementPage() {
    const [, params] = useRoute("/service-requests/:id");
    const srId = params?.id || "";
    const utils = trpc.useContext();
    const { hasRole, user } = useCurrentUser();

    const [isBuildingVersion, setIsBuildingVersion] = useState(false);
    const [draftItems, setDraftItems] = useState<WbsDraftItem[]>([]);
    const [pendingImport, setPendingImport] = useState<WbsImportPreview | null>(null);

    // View settings
    const displayHours = (h: number) => h.toFixed(1) + ' 天';
    const displayHoursShort = (h: number) => h.toFixed(1) + 'd';

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
    const [showEditSalesModal, setShowEditSalesModal] = useState(false);
    const [editedSalesUserId, setEditedSalesUserId] = useState("");
    const [editedSalesRep, setEditedSalesRep] = useState("");
    const [editedSalesDepartment, setEditedSalesDepartment] = useState("");

    const { data: sr, isLoading, error } = trpc.projects.srById.useQuery({ id: srId }, { enabled: !!srId });
    const { data: techs } = trpc.users.techList.useQuery();
    const { data: allUsers } = trpc.users.list.useQuery({ limit: 500 });
    const { data: attachments, refetch: refetchAttachments } = trpc.projects.srAttachmentsList.useQuery({ srId }, { enabled: !!srId });
    const { data: wbsQuote, refetch: refetchWbsQuote } = trpc.projects.generateWbsQuote.useQuery({ srId }, { enabled: false });

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

    const updateSalesOwnerMutation = trpc.projects.updateSalesOwner.useMutation({
        onSuccess: () => {
            utils.projects.srById.invalidate({ id: srId });
            setShowEditSalesModal(false);
            toast.success("業務欄位已更新");
        },
        onError: (err) => toast.error(err.message || "更新業務欄位失敗")
    });

    const parseExcelDate = (value: any) => {
        if (!value) return undefined;
        if (value instanceof Date) return value;
        if (typeof value === "number") {
            return new Date(Math.round((value - 25569) * 86400 * 1000));
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? undefined : date;
    };

    const itemImportKey = (item: WbsDraftItem) => String(item.code || item.title || "").trim().toLowerCase();

    const normalizeImportDate = (value?: Date) => value ? value.toISOString().slice(0, 10) : "";

    const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                const importedSrIds = Array.from(new Set(json.map((row: any) => String(row['SR ID'] || "").trim()).filter(Boolean)));
                const mismatchedSrIds = importedSrIds.filter(id => id !== String(sr?.id || ""));
                if (mismatchedSrIds.length > 0) {
                    toast.error(`匯入檔 SR ID (${mismatchedSrIds.join(", ")}) 與目前專案不一致`);
                    e.target.value = '';
                    return;
                }

                const importedItems: WbsDraftItem[] = json.map((row: any) => {
                    // Extract assignee from columns like "[John]天數" or fallback to "負責人"
                    let assigneeName = row['負責人'] || row['指派人員帳號'] || row['Assignee'];
                    if (!assigneeName) {
                        for (const key of Object.keys(row)) {
                            if (key.startsWith('[') && key.endsWith(']天數') && row[key]) {
                                assigneeName = key.substring(1, key.indexOf(']'));
                                break;
                            }
                        }
                    }
                    const assigneeText = String(assigneeName || "").trim().toLowerCase();
                    const assignee = techs?.find(t =>
                        [t.id, t.name, t.email].some(value => String(value || "").trim().toLowerCase() === assigneeText)
                    ) || allUsers?.items?.find((item: any) =>
                        [item.id, item.name, item.email].some(value => String(value || "").trim().toLowerCase() === assigneeText)
                    );

                    // Determine level based on "工作項次" (e.g. "1" -> 0, "1.1" -> 1)
                    let level = Number(row['階層'] || row['Level'] || 0);
                    if (row['工作項次']) {
                        const parts = String(row['工作項次']).split('.');
                        level = parts.length > 1 ? parts.length - 1 : 0;
                    }

                    return {
                        title: row['工作項目'] || row['項目名稱'] || row['Title'] || row['項目'] || row['專案階段'] || '未命名項目',
                        estimatedHours: Number(row['工作天數(小計)'] || row['工作天數'] || row['工時(天)'] || row['預估工時'] || row['Hours'] || row['工時'] || 0),
                        actualHours: 0,
                        assigneeId: assignee?.id,
                        level: level,
                        startDate: parseExcelDate(row['起始時間'] || row['預計執行日']),
                        endDate: parseExcelDate(row['起訖時間'] || row['預計完成日']),
                        completionPercentage: Number(row['完成百分比'] || row['總完成百分比'] || 0),
                        code: row['工作編號'] || row['編號'] || '',
                        description: row['工作說明'] || row['說明'] || '',
                        remarks: row['備註'] || '',
                        colorCode: '#E2E8F0'
                    };
                });

                const currentByKey = new Map(draftItems.map(item => [itemImportKey(item), item]));
                const importedKeys = new Set(importedItems.map(itemImportKey).filter(Boolean));
                let added = 0;
                let changed = 0;
                let unchanged = 0;

                importedItems.forEach((item) => {
                    const key = itemImportKey(item);
                    const current = key ? currentByKey.get(key) : undefined;
                    if (!current) {
                        added++;
                        return;
                    }
                    const hasChanged =
                        current.title !== item.title ||
                        Number(current.estimatedHours || 0) !== Number(item.estimatedHours || 0) ||
                        (current.assigneeId || "") !== (item.assigneeId || "") ||
                        normalizeImportDate(current.startDate) !== normalizeImportDate(item.startDate) ||
                        normalizeImportDate(current.endDate) !== normalizeImportDate(item.endDate) ||
                        (current.code || "") !== (item.code || "") ||
                        (current.description || "") !== (item.description || "") ||
                        (current.remarks || "") !== (item.remarks || "") ||
                        Number(current.completionPercentage || 0) !== Number(item.completionPercentage || 0);
                    if (hasChanged) changed++;
                    else unchanged++;
                });

                const removed = draftItems.filter(item => {
                    const key = itemImportKey(item);
                    return key && !importedKeys.has(key);
                }).length;
                const importedVersions = Array.from(new Set(json.map((row: any) => String(row['WBS 版本'] || "").trim()).filter(Boolean)));
                const warnings = importedVersions.length > 0 && latestVersion?.version && !importedVersions.includes(String(latestVersion.version))
                    ? [`匯入檔版本 ${importedVersions.join(", ")} 與目前最新版 v${latestVersion.version} 不一致，請確認後再套用。`]
                    : [];

                setPendingImport({
                    items: importedItems,
                    summary: { added, changed, removed, unchanged },
                    warnings,
                });
                toast.success(`已解析 ${importedItems.length} 項任務，請先確認匯入預覽`);
            } catch (err) {
                console.error(err);
                toast.error("解析 Excel 失敗，請檢查格式");
            }
            e.target.value = ''; // Reset input
        };
        reader.readAsArrayBuffer(file);
    };

    const applyPendingImport = (mode: "append" | "replace") => {
        if (!pendingImport) return;
        setDraftItems(prev => mode === "append" ? [...prev, ...pendingImport.items] : pendingImport.items);
        setPendingImport(null);
        toast.success(mode === "append" ? "已追加匯入項目到草稿" : "已用匯入項目取代草稿");
    };

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;
    if (error) return <div className="p-8 text-center text-destructive">無法存取：{error.message}</div>;
    if (!sr) return <div className="p-8 text-center text-destructive">找不到該服務請求 (SR)</div>;

    const nextVersionNumber = sr.wbsVersions && sr.wbsVersions.length > 0
        ? Math.max(...sr.wbsVersions.map((v: any) => v.version)) + 1
        : 1;
    const latestVersion = sr.wbsVersions?.length
        ? [...sr.wbsVersions].sort((a: any, b: any) => b.version - a.version)[0]
        : null;
    const canEditSalesOwner = hasRole("admin") || hasRole("manager") || user?.id === sr.pmId;

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

    const computeItemNumbers = (items: any[]) => {
        const counts = [0, 0, 0, 0, 0];
        return items.map(item => {
            const level = item.level || 0;
            counts[level]++;
            for (let i = level + 1; i < counts.length; i++) counts[i] = 0;
            return counts.slice(0, level + 1).join('.');
        });
    };

    const handleAddDraftItem = () => setDraftItems([...draftItems, { title: "", estimatedHours: 4, assigneeId: undefined, level: 0, code: "", remarks: "" }]);
    const handleAddSubTask = (parentIndex: number) => {
        const parentLevel = draftItems[parentIndex].level || 0;
        const newItems = [...draftItems];
        newItems.splice(parentIndex + 1, 0, { title: "", estimatedHours: 4, assigneeId: undefined, level: parentLevel + 1, code: "", remarks: "" });
        setDraftItems(newItems);
    };
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
                colorCode: item.colorCode || "#E2E8F0",
                level: item.level || 0,
                code: item.code || "",
                remarks: item.remarks || ""
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

    const handleUpdateSalesOwner = () => {
        if (!editedSalesUserId) {
            toast.error("請選擇業務帳號");
            return;
        }
        updateSalesOwnerMutation.mutate({ id: sr.id, salesUserId: editedSalesUserId });
    };

    const handleExportXlsx = () => {
        if (!latestVersion || !latestVersion.items?.length) {
            toast.error("沒有可匯出的 WBS 版本資料");
            return;
        }
        const assignedIds = Array.from(new Set(latestVersion.items.map((item: any) => item.assigneeId).filter(Boolean)));
        const usersById = new Map((allUsers?.items || []).map((item: any) => [item.id, item]));
        const techsById = new Map((techs || []).map((item: any) => [item.id, item]));
        const people = assignedIds.map((id: any) => {
            const user = usersById.get(id) as any;
            const tech = techsById.get(id) as any;
            return {
                id,
                name: user?.email || tech?.email || user?.name || tech?.name || id,
                displayName: user?.name || tech?.name || user?.email || tech?.email || id,
                department: user?.department || tech?.department,
                dailyRate: tech?.costRate?.dailyRate || user?.costRate?.dailyRate || 0,
            };
        });

        const exportResult = exportWbsCostWorkbook({
            srId: sr.id,
            fileName: makeXlsxFileName("WBS管理", formatExportDate()),
            projectTitle: sr.title,
            customerName: sr.customerName,
            salesDepartment: sr.salesDepartment,
            salesRep: sr.salesRep,
            technicalDepartment: people[0]?.department,
            version: latestVersion.version,
            items: latestVersion.items,
            people,
        });
        if (exportResult.missingRatePeople.length > 0) {
            toast.error(`以下人員尚未設定日費率：${exportResult.missingRatePeople.join(", ")}`);
        }
        toast.success("WBS 已匯出 Action Item 與 AEB 報價單");
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

    const handleExportQuote = async () => {
        const result = await refetchWbsQuote();
        const quote = result.data || wbsQuote;
        if (!quote) return;
        const exportResult = exportWbsQuoteWorkbook({
            fileName: makeXlsxFileName(quote.title || sr.title || "專案", formatExportDate(), "報價單"),
            projectTitle: quote.title || sr.title,
            customerName: quote.customerName || sr.customerName,
            salesDepartment: quote.salesDepartment || sr.salesDepartment,
            salesRep: quote.salesRep || sr.salesRep,
            technicalDepartment: quote.technicalDepartment,
            technicalLead: quote.technicalLead,
            versionNumber: quote.versionNumber,
            items: quote.items,
        });
        const missingRatePeople = exportResult.missingRatePeople;
        if (missingRatePeople.length > 0) {
            toast.error(`以下人員尚未設定日費率：${missingRatePeople.join(", ")}`);
        }
        toast.success("已依人員日費率產生報價單");
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
                <div className="flex-1">
                    <h2 className="text-2xl font-bold flex items-center flex-wrap gap-2">
                        SR-#{sr.id} WBS 管理
                        <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{sr.title}</span>
                    </h2>
                </div>
                <button onClick={handleExportQuote} className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
                    <Receipt className="w-4 h-4" /> WBS 轉報價單
                </button>
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
                            <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">業務</span>
                                <span className="font-medium text-right">{sr.salesRep || "未填寫"}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">業務部門</span>
                                <span className="font-medium text-right">{sr.salesDepartment || "未填寫"}</span>
                            </div>
                            {canEditSalesOwner && (
                                <button
                                    onClick={() => {
                                        setEditedSalesUserId(sr.salesUserId || "");
                                        setEditedSalesRep(sr.salesRep || "");
                                        setEditedSalesDepartment(sr.salesDepartment || "");
                                        setShowEditSalesModal(true);
                                    }}
                                    className="w-full mt-2 px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
                                >
                                    編輯業務
                                </button>
                            )}
                            {!hasRole("tech") && (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">合約金額</span>
                                        <span className="font-bold">NT$ {sr.contractAmount?.toLocaleString() || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">預估毛利</span>
                                        <span className={`font-bold ${sr.marginWarning ? 'text-destructive' : 'text-green-600'}`}>{sr.marginEstimate}%</span>
                                    </div>
                                </>
                            )}
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

                                    <button onClick={handleExportXlsx} className="bg-muted text-foreground hover:bg-muted/80 border px-3 py-1.5 rounded-md inline-flex items-center text-sm font-medium transition-colors shadow-sm">
                                        匯出 Excel
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
                                                    {version.items.map((item: any, idx: number) => {
                                                        const compareWithVer = comparison?.compareWithVer ?? null;
                                                        const compareItem = compareWithVer?.items.find((i: any) => i.title === item.title);
                                                        const hourDiff = compareItem ? item.estimatedHours - compareItem.estimatedHours : null;
                                                        const assigneeChanged = compareItem && compareItem.assigneeId !== item.assigneeId;
                                                        const isAdded = !!comparison && comparison.added.some((addedItem: any) => addedItem.title === item.title);

                                                        return (
                                                            <div key={item.id} className={`
                                                                text-sm flex justify-between items-center border p-2 rounded hover:shadow-sm transition-shadow relative overflow-hidden
                                                                ${isAdded ? "border-emerald-300 bg-emerald-50/60" : "border-border bg-background"}
                                                            `} style={{ marginLeft: `${(item.level || 0) * 1.5}rem` }}>
                                                                {item.colorCode && (
                                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: item.colorCode }} />
                                                                )}
                                                                <div className="pl-2 flex-1">
                                                                    <div className="font-medium flex items-center gap-2">
                                                                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                                                            {computeItemNumbers(version.items)[idx]}
                                                                        </span>
                                                                        {item.title}
                                                                        {isAdded && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">新增</span>}
                                                                        {assigneeChanged && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">改派</span>}
                                                                    </div>
                                                                    {item.description && (
                                                                        <div className="mt-1 text-[11px] text-muted-foreground whitespace-pre-wrap bg-muted/20 p-2 rounded border border-border/50">
                                                                            {item.description}
                                                                        </div>
                                                                    )}
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
                                
                                <div className="mt-8 border-t pt-8">
                                    <SharePointFilesSection 
                                        category="專案" 
                                        sharePointFolderUrl={sr.sharePointFolderUrl} 
                                        title="專案專屬 SharePoint 文件庫"
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        // WBS Builder Mode
                        <div className="bg-card border border-primary/20 rounded-xl shadow-lg ring-1 ring-primary/20 flex flex-col">
                            <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center rounded-t-xl">
                                <h3 className="font-bold text-lg flex items-center"><Plus className="w-5 h-5 mr-2 text-primary" />草稿：建立版本 v{nextVersionNumber}</h3>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => document.getElementById('wbs-excel-import')?.click()}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all shadow-sm hover:shadow-md"
                                        title="從 Excel/CSV 匯入 WBS 項目"
                                    >
                                        <Upload className="w-3.5 h-3.5" />
                                        Excel 匯入
                                    </button>
                                    <input 
                                        id="wbs-excel-import"
                                        type="file" 
                                        accept=".xlsx, .xls, .csv" 
                                        className="hidden" 
                                        onChange={handleExcelImport} 
                                    />
                                    <button onClick={() => { setIsBuildingVersion(false); setDraftItems([]); }}
                                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 space-y-4 flex-1">
                                <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                                    在此規劃專案的工作分解結構 (WBS)，包含各項子任務、預估工時，並指派給對應的技術人員。
                                    {latestVersion?.items?.length ? ` 已自動帶入 v${latestVersion.version} 作為草稿基底，可直接微調後送審。` : ""}
                                </div>
                                {pendingImport && (
                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm shadow-sm">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="font-semibold text-emerald-900 flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4" />
                                                    WBS 匯入預覽
                                                </div>
                                                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                                    <span className="rounded bg-white px-2 py-1 border border-emerald-100">新增 {pendingImport.summary.added}</span>
                                                    <span className="rounded bg-white px-2 py-1 border border-emerald-100">異動 {pendingImport.summary.changed}</span>
                                                    <span className="rounded bg-white px-2 py-1 border border-emerald-100">未變更 {pendingImport.summary.unchanged}</span>
                                                    <span className="rounded bg-white px-2 py-1 border border-emerald-100">草稿未出現在匯入檔 {pendingImport.summary.removed}</span>
                                                </div>
                                                {pendingImport.warnings.length > 0 && (
                                                    <div className="mt-2 space-y-1 text-xs text-amber-700">
                                                        {pendingImport.warnings.map((warning, index) => (
                                                            <div key={index}>{warning}</div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-2 justify-end">
                                                <button
                                                    onClick={() => applyPendingImport("append")}
                                                    className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                                                >
                                                    追加到草稿
                                                </button>
                                                <button
                                                    onClick={() => applyPendingImport("replace")}
                                                    className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                                                >
                                                    取代草稿
                                                </button>
                                                <button
                                                    onClick={() => setPendingImport(null)}
                                                    className="px-3 py-1.5 rounded-md border border-border bg-white text-xs font-semibold hover:bg-muted"
                                                >
                                                    取消
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
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
                                            <div key={idx} className="flex gap-2 items-start bg-background p-3 rounded-lg border border-border group hover:border-primary/40 transition-colors" style={{ marginLeft: `${(item.level || 0) * 1.5}rem` }}>
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{computeItemNumbers(draftItems)[idx]}</span>
                                                        <input type="text" placeholder="任務標題 (必填)" value={item.title}
                                                            onChange={(e) => handleUpdateDraftItem(idx, 'title', e.target.value)}
                                                            className="flex-1 text-sm font-medium bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:ring-0 px-1 py-1 transition-colors outline-none"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-3 lg:pl-8">
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                <label>工作編號:</label>
                                                                <input type="text" placeholder="選填" value={item.code || ""}
                                                                    onChange={(e) => handleUpdateDraftItem(idx, 'code', e.target.value)}
                                                                    className="px-2 py-1.5 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none"
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                <label>工作天數(小計):</label>
                                                                <input type="number" min="0.5" step="0.5" value={item.estimatedHours}
                                                                    onChange={(e) => handleUpdateDraftItem(idx, 'estimatedHours', Number(e.target.value))}
                                                                    className="px-2 py-1.5 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                            <label>工作說明:</label>
                                                            <textarea placeholder="選填" value={item.description || ""} rows={2}
                                                                onChange={(e) => handleUpdateDraftItem(idx, 'description', e.target.value)}
                                                                className="px-2 py-1.5 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none resize-y"
                                                            />
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                <label>指派給 (人員):</label>
                                                                <select value={item.assigneeId || ""}
                                                                    onChange={(e) => handleUpdateDraftItem(idx, 'assigneeId', e.target.value ? e.target.value : undefined)}
                                                                    className="px-2 py-1.5 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none">
                                                                    <option value="">-- 未指派 --</option>
                                                                    {techs?.map(tech => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                                                                </select>
                                                            </div>
                                                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                <label>備註:</label>
                                                                <input type="text" placeholder="選填" value={item.remarks || ""}
                                                                    onChange={(e) => handleUpdateDraftItem(idx, 'remarks', e.target.value)}
                                                                    className="px-2 py-1.5 bg-muted rounded border border-transparent focus:bg-background focus:border-primary outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-4 items-center flex-wrap pt-2 border-t border-border/50">
                                                            <div className="flex items-center text-xs text-muted-foreground">
                                                                <span className="mr-2">色標:</span>
                                                                <input type="color" value={item.colorCode || "#E2E8F0"}
                                                                    onChange={(e) => handleUpdateDraftItem(idx, 'colorCode', e.target.value)}
                                                                    className="w-12 h-6 p-0 border-0 rounded cursor-pointer ring-1 ring-border"
                                                                />
                                                            </div>
                                                            <div className="flex items-center text-xs text-muted-foreground">
                                                                <span className="mr-1">排程:</span>
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
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <button onClick={() => handleAddSubTask(idx)}
                                                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded" title="新增子任務">
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleRemoveDraftItem(idx)}
                                                        className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded" title="移除此項">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        <button onClick={handleAddDraftItem}
                                            className="w-full py-2 border border-dashed border-primary/40 text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors flex items-center justify-center gap-1">
                                            <Plus className="w-4 h-4" /> 新增工作項目
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-border bg-muted/10 flex justify-between items-center rounded-b-xl">
                                <div className="text-sm">
                                    <span className="text-muted-foreground mr-2">總計天數:</span>
                                    <span className="font-bold text-lg">{draftItems.reduce((sum, i) => sum + i.estimatedHours, 0)} 天</span>
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

            {/* Edit Sales Owner Modal */}
            {showEditSalesModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-5">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold">編輯業務</h2>
                            <button onClick={() => setShowEditSalesModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium mb-1">業務帳號</label>
                            <BusinessUserPicker
                                users={allUsers?.items || []}
                                selectedUserId={editedSalesUserId}
                                legacyName={editedSalesRep}
                                onSelect={(selectedUser) => {
                                    setEditedSalesUserId(selectedUser.id);
                                    setEditedSalesRep(selectedUser.name);
                                    setEditedSalesDepartment(selectedUser.department || "");
                                }}
                                onClear={() => {
                                    setEditedSalesUserId("");
                                    setEditedSalesRep("");
                                    setEditedSalesDepartment("");
                                }}
                            />
                            <p className="text-xs text-muted-foreground">業務部門：{editedSalesDepartment || "選擇業務帳號後自動帶入"}</p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowEditSalesModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button
                                onClick={handleUpdateSalesOwner}
                                disabled={updateSalesOwnerMutation.isPending || !editedSalesUserId}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                            >
                                {updateSalesOwnerMutation.isPending ? "儲存中..." : "儲存業務"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
