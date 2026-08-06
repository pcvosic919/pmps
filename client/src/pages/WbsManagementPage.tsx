import { useEffect, useRef, useState } from "react";
import { trpc } from "../lib/trpc";
import { useRoute } from "wouter";
import { ArrowLeft, Plus, FileText, Clock, Trash2, Save, X, CheckCircle2, XCircle, Upload, Paperclip, AlertCircle, Receipt, Download, ChevronDown, ChevronRight, Users, UserPlus } from "lucide-react";
import { Link } from "wouter";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { SharePointFilesSection } from "../components/SharePointFilesSection";
import { exportRowsToXlsx, exportWbsCostWorkbook, exportWbsQuoteWorkbook, formatExportDate, makeXlsxFileName } from "../lib/exportXlsx";
import { BusinessUserPicker } from "../components/BusinessUserPicker";
import { UserSearchPicker } from "../components/UserSearchPicker";
import { fileToBase64 } from "../lib/files";

type WbsDraftItem = {
    title: string;
    estimatedHours: number;
    actualHours?: number;
    assigneeId: string | undefined;
    assigneeIds?: string[];
    startDate?: Date;
    endDate?: Date;
    completionPercentage?: number;
    status?: "not_started" | "in_progress" | "completed";
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

    const [isBuildingVersion, setIsBuildingVersion] = useState(false);
    const [draftItems, setDraftItems] = useState<WbsDraftItem[]>([]);
    const [expandedDraftItems, setExpandedDraftItems] = useState<Record<number, boolean>>({});
    const [pendingImport, setPendingImport] = useState<WbsImportPreview | null>(null);
    const draftRevisionRef = useRef<number | undefined>(undefined);
    const [lastDraftSavedAt, setLastDraftSavedAt] = useState<Date | null>(null);
    const [draftHydrated, setDraftHydrated] = useState(false);

    // View settings
    const displayHours = (h: number) => h.toFixed(1) + ' 天';
    const displayHoursShort = (h: number) => h.toFixed(1) + 'd';
    const wbsStatusLabels: Record<string, string> = {
        not_started: "尚未開始",
        in_progress: "進行中",
        completed: "完成"
    };

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
    const [showFinancialModal, setShowFinancialModal] = useState(false);
    const [showProjectMemberModal, setShowProjectMemberModal] = useState(false);
    const [projectMemberUserId, setProjectMemberUserId] = useState("");
    const [projectMemberRole, setProjectMemberRole] = useState<"owner" | "participant" | "watcher">("participant");
    const [editedSalesUserId, setEditedSalesUserId] = useState("");
    const [editedSalesRep, setEditedSalesRep] = useState("");
    const [editedSalesDepartment, setEditedSalesDepartment] = useState("");
    const [editedTitle, setEditedTitle] = useState("");
    const [editedCustomerName, setEditedCustomerName] = useState("");
    const [editedPmId, setEditedPmId] = useState("");
    const [editedPlannedStartDate, setEditedPlannedStartDate] = useState("");
    const [editedPlannedEndDate, setEditedPlannedEndDate] = useState("");
    const [editedSrType, setEditedSrType] = useState<"project" | "maintenance" | "other_activity">("project");
    const [editedContractAmount, setEditedContractAmount] = useState(0);
    const [editedFinalPrice, setEditedFinalPrice] = useState(0);
    const [editedTotalPoints, setEditedTotalPoints] = useState(0);
    const [editedPointValue, setEditedPointValue] = useState(0);

    const { data: sr, isLoading, error } = trpc.projects.srById.useQuery({ id: srId }, { enabled: !!srId });
    const { data: savedDraft, isFetched: isDraftFetched } = trpc.projects.getWbsDraft.useQuery({ srId }, { enabled: !!srId });
    const { data: techs } = trpc.users.techList.useQuery();
    const { data: allUsers } = trpc.users.list.useQuery({ limit: 500 });
    const { data: attachments, refetch: refetchAttachments } = trpc.projects.srAttachmentsList.useQuery({ srId }, { enabled: !!srId });
    const { data: projectMembers, refetch: refetchProjectMembers } = trpc.projects.getSrMembers.useQuery({ srId }, { enabled: !!srId });
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

    const saveDraftMutation = trpc.projects.saveWbsDraft.useMutation({
        onSuccess: result => {
            draftRevisionRef.current = result.revision;
            setLastDraftSavedAt(new Date(result.updatedAt));
        },
        onError: error => toast.error(error.message || "WBS 草稿儲存失敗")
    });

    const discardDraftMutation = trpc.projects.discardWbsDraft.useMutation({
        onSuccess: () => {
            draftRevisionRef.current = undefined;
            setLastDraftSavedAt(null);
        }
    });

    useEffect(() => {
        if (!isDraftFetched || draftHydrated) return;
        if (savedDraft?.items?.length) {
            setDraftItems(savedDraft.items.map((item: any) => ({
                ...item,
                startDate: item.startDate ? new Date(item.startDate) : undefined,
                endDate: item.endDate ? new Date(item.endDate) : undefined
            })));
            draftRevisionRef.current = savedDraft.revision;
            setLastDraftSavedAt(new Date(savedDraft.updatedAt));
            setIsBuildingVersion(true);
        }
        setDraftHydrated(true);
    }, [draftHydrated, isDraftFetched, savedDraft]);

    useEffect(() => {
        if (!draftHydrated || !isBuildingVersion) return;
        const timer = window.setTimeout(() => {
            saveDraftMutation.mutate({
                srId,
                baseVersionNumber: savedDraft?.baseVersionNumber,
                revision: draftRevisionRef.current,
                items: draftItems.map(item => ({
                    ...item,
                    startDate: item.startDate || undefined,
                    endDate: item.endDate || undefined
                }))
            });
        }, 2000);
        return () => window.clearTimeout(timer);
    }, [draftHydrated, draftItems, isBuildingVersion, srId]);

    useEffect(() => {
        const warnBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!saveDraftMutation.isPending) return;
            event.preventDefault();
        };
        window.addEventListener("beforeunload", warnBeforeUnload);
        return () => window.removeEventListener("beforeunload", warnBeforeUnload);
    }, [saveDraftMutation.isPending]);

    const uploadMutation = trpc.projects.uploadSrAttachment.useMutation({
        onSuccess: () => {
            refetchAttachments();
            toast.success("檔案上傳成功");
        }
    });

    const downloadAttachmentMutation = trpc.projects.downloadSrAttachment.useMutation({
        onSuccess: result => {
            if ("externalUrl" in result && result.externalUrl) {
                window.open(result.externalUrl, "_blank", "noopener,noreferrer");
                return;
            }
            if (!("dataBase64" in result) || !result.dataBase64) {
                toast.error("附件內容不存在");
                return;
            }
            const bytes = Uint8Array.from(atob(result.dataBase64), character => character.charCodeAt(0));
            const blobUrl = URL.createObjectURL(new Blob([bytes], { type: result.mimeType || "application/octet-stream" }));
            const anchor = document.createElement("a");
            anchor.href = blobUrl;
            anchor.download = result.fileName;
            anchor.click();
            URL.revokeObjectURL(blobUrl);
        },
        onError: error => toast.error(error.message || "附件下載失敗")
    });

    const deleteAttachmentMutation = trpc.projects.deleteSrAttachment.useMutation({
        onSuccess: () => {
            refetchAttachments();
            toast.success("附件已刪除");
        },
        onError: error => toast.error(error.message || "附件刪除失敗")
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

    const updateSalesOwnerMutation = trpc.projects.updateProjectBasics.useMutation({
        onSuccess: () => {
            utils.projects.srById.invalidate({ id: srId });
            setShowEditSalesModal(false);
            toast.success("專案基本資料已更新");
        },
        onError: (err) => toast.error(err.message || "更新業務欄位失敗")
    });

    const updateProjectFinancialsMutation = trpc.projects.updateProjectFinancials.useMutation({
        onSuccess: () => {
            utils.projects.srById.invalidate({ id: srId });
            setShowFinancialModal(false);
            toast.success("專案商務資訊已更新");
        },
        onError: (err) => toast.error(err.message || "更新專案商務資訊失敗")
    });

    const addProjectMemberMutation = trpc.projects.addSrMember.useMutation({
        onSuccess: () => {
            refetchProjectMembers();
            utils.projects.srById.invalidate({ id: srId });
            setShowProjectMemberModal(false);
            setProjectMemberUserId("");
            setProjectMemberRole("participant");
            toast.success("專案參與人員已新增");
        },
        onError: (err) => toast.error(err.message || "新增專案參與人員失敗")
    });

    const transferOwnerMutation = trpc.projects.transferSrOwner.useMutation({
        onSuccess: () => {
            refetchProjectMembers();
            utils.projects.srById.invalidate({ id: srId });
            setShowProjectMemberModal(false);
            setProjectMemberUserId("");
            setProjectMemberRole("participant");
            toast.success("專案擁有者已完成交接");
        },
        onError: error => toast.error(error.message || "專案擁有者交接失敗")
    });

    const removeProjectMemberMutation = trpc.projects.removeSrMember.useMutation({
        onSuccess: () => {
            refetchProjectMembers();
            utils.projects.srById.invalidate({ id: srId });
            toast.success("專案參與人員已移除");
        },
        onError: (err) => toast.error(err.message || "移除專案參與人員失敗")
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
    const isHeadingItem = (item: Pick<WbsDraftItem, "level">) => (item.level || 0) === 0;
    const getImportText = (value: any, fallback = "") => value == null || value === "" ? fallback : String(value).trim();
    const findUserByText = (value?: string) => {
        const assigneeText = String(value || "").trim().toLowerCase();
        if (!assigneeText) return undefined;
        return techs?.find(t =>
            [t.id, t.name, t.email].some(candidate => String(candidate || "").trim().toLowerCase() === assigneeText)
        ) || allUsers?.items?.find((item: any) =>
            [item.id, item.name, item.email].some(candidate => String(candidate || "").trim().toLowerCase() === assigneeText)
        );
    };
    const findUsersByTextList = (value?: string) => Array.from(new Set(String(value || "")
        .split(/[,，;；\n]/)
        .map(item => findUserByText(item)?.id)
        .filter(Boolean))) as string[];

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
                    const multiAssigneeIds = findUsersByTextList(row['指派人員帳號(多人)'] || row['指派人員帳號'] || row['負責人'] || row['Assignee']);
                    const assignee = findUserByText(assigneeName) || (multiAssigneeIds[0] ? findUserByText(multiAssigneeIds[0]) : undefined);

                    // Determine level based on "工作項次" (e.g. "1" -> 0, "1.1" -> 1)
                    let level = Number(row['階層'] || row['Level'] || 0);
                    if (row['工作項次']) {
                        const parts = String(row['工作項次']).split('.');
                        level = parts.length > 1 ? parts.length - 1 : 0;
                    }

                    const rawEstimatedHours = Number(row['工作天數(小計)'] || row['工作天數'] || row['工時(天)'] || row['預估工時'] || row['Hours'] || row['工時'] || 0);

                    return {
                        title: getImportText(row['工作項目'] || row['項目名稱'] || row['Title'] || row['項目'] || row['專案階段'], '未命名項目'),
                        estimatedHours: level === 0 ? 0 : rawEstimatedHours,
                        actualHours: 0,
                        assigneeId: assignee?.id || multiAssigneeIds[0],
                        assigneeIds: multiAssigneeIds,
                        level: level,
                        startDate: parseExcelDate(row['起始時間'] || row['預計執行日']),
                        endDate: parseExcelDate(row['起訖時間'] || row['預計完成日']),
                        completionPercentage: Number(row['完成百分比'] || row['總完成百分比'] || 0),
                        code: getImportText(row['工作編號'] || row['編號']),
                        description: getImportText(row['工作說明'] || row['說明']),
                        remarks: getImportText(row['備註']),
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
                        (current.assigneeIds || []).join(",") !== (item.assigneeIds || []).join(",") ||
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
	    const latestWbsAnomalies = (() => {
	        const today = new Date();
	        today.setHours(0, 0, 0, 0);
	        const items = latestVersion?.items || [];
	        const missingAssignee = items.filter((item: any) => !item.assigneeId);
	        const missingSchedule = items.filter((item: any) => !item.startDate || !item.endDate);
		        const zeroEstimate = items.filter((item: any) => (item.level || 0) > 0 && Number(item.estimatedHours || 0) <= 0);
	        const overdue = items.filter((item: any) => {
	            if (!item.endDate || item.status === "completed") return false;
	            const endDate = new Date(item.endDate);
	            endDate.setHours(0, 0, 0, 0);
	            return endDate < today;
	        });
	        return [
	            { key: "missingAssignee", label: "未指派", count: missingAssignee.length, examples: missingAssignee.slice(0, 3).map((item: any) => item.title) },
	            { key: "missingSchedule", label: "缺起訖日期", count: missingSchedule.length, examples: missingSchedule.slice(0, 3).map((item: any) => item.title) },
	            { key: "zeroEstimate", label: "預估工時為 0", count: zeroEstimate.length, examples: zeroEstimate.slice(0, 3).map((item: any) => item.title) },
	            { key: "overdue", label: "逾期未完成", count: overdue.length, examples: overdue.slice(0, 3).map((item: any) => item.title) }
	        ].filter(item => item.count > 0);
	    })();
	    const canEditSalesOwner = sr.permissions?.canOperate === true;
	    const canManageProjectMembers = sr.permissions?.canManageMembers === true;
	    const canViewFinancials = sr.permissions?.canViewFinancials === true;
	    const canEditFinancials = sr.permissions?.canEditFinancials === true;
	    const canEditWbs = sr.permissions?.canEditWbs === true;
	    const canReviewSubmittedWbs = sr.permissions?.canReview === true;

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
    const getApprovalStatusText = (status: string) => {
        const map: Record<string, string> = { pending: "待核准", approved: "已核准", rejected: "已退回" };
        return map[status] || status;
    };
    const getApprovalStatusColor = (status: string) => {
        if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
        if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
        return "border-amber-200 bg-amber-50 text-amber-700";
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
            const numberParts = counts.slice(0, level + 1);
            while (numberParts.length > 1 && numberParts[0] === 0) numberParts.shift();
            return numberParts.join('.');
        });
    };

    const handleAddDraftItem = () => setDraftItems([...draftItems, { title: "", estimatedHours: 0, actualHours: 0, assigneeId: undefined, assigneeIds: [], level: 0, code: "", remarks: "", status: "not_started", completionPercentage: 0 }]);
    const handleAddSubTask = (parentIndex: number) => {
        const parentLevel = draftItems[parentIndex].level || 0;
        const newItems = [...draftItems];
        newItems.splice(parentIndex + 1, 0, { title: "", estimatedHours: 4, actualHours: 0, assigneeId: undefined, assigneeIds: [], level: parentLevel + 1, code: "", remarks: "", status: "not_started", completionPercentage: 0 });
        setDraftItems(newItems);
    };
    const handleApplySingleRowTemplate = (title: "教育訓練" | "內部專案") => {
        setDraftItems([{
            title,
            estimatedHours: 0,
            actualHours: 0,
            assigneeId: undefined,
            assigneeIds: [],
            level: 1,
            code: title === "教育訓練" ? "TRAINING" : "INTERNAL",
            description: title,
            remarks: "",
            status: "not_started",
            completionPercentage: 0,
            colorCode: "#E2E8F0"
        }]);
        setExpandedDraftItems({});
        toast.success(`已建立「${title}」WBS 範本，請補上天數與指派人員`);
    };
    const handleUpdateDraftItem = (index: number, field: string, value: any) => {
        const newItems = [...draftItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setDraftItems(newItems);
    };
    const handleUpdateDraftItemFields = (index: number, changes: Partial<WbsDraftItem>) => {
        setDraftItems(current => current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, ...changes } : item
        ));
    };
    const handleSetPrimaryAssignee = (index: number, userId?: string) => {
        const item = draftItems[index];
        const assigneeIds = userId
            ? Array.from(new Set([userId, ...(item.assigneeIds || [])]))
            : (item.assigneeIds || []);
        const newItems = [...draftItems];
        newItems[index] = { ...item, assigneeId: userId, assigneeIds };
        setDraftItems(newItems);
    };
    const handleAddDraftAssignee = (index: number, userId: string) => {
        const item = draftItems[index];
        const assigneeIds = Array.from(new Set([...(item.assigneeIds || []), userId]));
        const newItems = [...draftItems];
        newItems[index] = { ...item, assigneeId: item.assigneeId || userId, assigneeIds };
        setDraftItems(newItems);
    };
    const handleRemoveDraftAssignee = (index: number, userId: string) => {
        const item = draftItems[index];
        const assigneeIds = (item.assigneeIds || []).filter(id => id !== userId);
        const newItems = [...draftItems];
        newItems[index] = {
            ...item,
            assigneeIds,
            assigneeId: item.assigneeId === userId ? assigneeIds[0] : item.assigneeId
        };
        setDraftItems(newItems);
    };
    const handleRemoveDraftItem = (index: number) => setDraftItems(draftItems.filter((_, i) => i !== index));
    const toggleDraftItemExpanded = (index: number) => {
        setExpandedDraftItems((current) => ({ ...current, [index]: !current[index] }));
    };
    const handleMoveDraftItem = (index: number, direction: -1 | 1) => {
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= draftItems.length) return;
        const newItems = [...draftItems];
        const [item] = newItems.splice(index, 1);
        newItems.splice(nextIndex, 0, item);
        setDraftItems(newItems);
    };
    const handleShiftDraftLevel = (index: number, delta: -1 | 1) => {
        const currentLevel = draftItems[index].level || 0;
        const maxLevel = index > 0 ? (draftItems[index - 1].level || 0) + 1 : 0;
        const nextLevel = Math.max(0, Math.min(maxLevel, currentLevel + delta));
        const newItems = [...draftItems];
        newItems[index] = {
            ...newItems[index],
            level: nextLevel,
            estimatedHours: nextLevel === 0 ? 0 : Number(newItems[index].estimatedHours || 0) > 0 ? newItems[index].estimatedHours : 4
        };
        setDraftItems(newItems);
    };
    const handleStartBuild = () => {
        if (savedDraft?.items?.length) {
            setDraftItems(savedDraft.items.map((item: any) => ({
                ...item,
                startDate: item.startDate ? new Date(item.startDate) : undefined,
                endDate: item.endDate ? new Date(item.endDate) : undefined
            })));
            draftRevisionRef.current = savedDraft.revision;
            setIsBuildingVersion(true);
            return;
        }
        if (latestVersion?.items?.length) {
            setDraftItems(latestVersion.items.map((item: any) => ({
                title: item.title,
                estimatedHours: item.estimatedHours,
                assigneeId: item.assigneeId,
                assigneeIds: item.assigneeIds || (item.assigneeId ? [item.assigneeId] : []),
                startDate: item.startDate ? new Date(item.startDate) : undefined,
                endDate: item.endDate ? new Date(item.endDate) : undefined,
                completionPercentage: item.completionPercentage || 0,
                status: item.status || (item.completionPercentage >= 100 ? "completed" : item.completionPercentage > 0 ? "in_progress" : "not_started"),
                colorCode: item.colorCode || "#E2E8F0",
                level: item.level || 0,
                code: item.code || "",
                remarks: item.remarks || "",
                description: item.description || ""
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
        if (draftItems.length === 0) { toast.error("請至少新增一項工作"); return; }
        const invalidIndex = draftItems.findIndex(item =>
            !item.title.trim() ||
            (!isHeadingItem(item) && (
                item.estimatedHours <= 0 ||
                !item.startDate ||
                !item.endDate ||
                new Date(item.startDate).getTime() > new Date(item.endDate).getTime()
            ))
        );
        if (invalidIndex >= 0) {
            toast.error(`第 ${invalidIndex + 1} 筆工作請填寫名稱、工作天數及正確的起訖日期`);
            return;
        }
        const normalizedItems = draftItems.map(item => ({
            ...item,
            estimatedHours: isHeadingItem(item) ? 0 : item.estimatedHours,
            startDate: item.startDate || undefined,
            endDate: item.endDate || undefined,
            assigneeIds: Array.from(new Set([item.assigneeId, ...(item.assigneeIds || [])].filter(Boolean))) as string[]
        }));
        submitVersion.mutate({ srId: sr.id, versionNumber: nextVersionNumber, items: normalizedItems });
    };

    const handleSaveDraft = () => {
        saveDraftMutation.mutate({
            srId,
            baseVersionNumber: latestVersion?.version,
            revision: draftRevisionRef.current,
            items: draftItems.map(item => ({
                ...item,
                startDate: item.startDate || undefined,
                endDate: item.endDate || undefined
            }))
        });
    };

    const handleUpdateSalesOwner = () => {
        if (!editedTitle.trim() || !editedCustomerName.trim()) {
            toast.error("請填寫專案名稱及客戶名稱");
            return;
        }
        updateSalesOwnerMutation.mutate({
            id: sr.id,
            title: editedTitle,
            customerName: editedCustomerName,
            salesUserId: editedSalesUserId || undefined,
            salesDepartment: editedSalesDepartment,
            salesRep: editedSalesRep,
            pmId: editedPmId || undefined,
            srType: editedSrType,
            plannedStartDate: editedPlannedStartDate || undefined,
            plannedEndDate: editedPlannedEndDate || undefined
        });
    };

    const handleAddProjectMember = () => {
        if (!projectMemberUserId) {
            toast.error("請選擇專案參與人員");
            return;
        }
        if (projectMemberRole === "owner") {
            transferOwnerMutation.mutate({ srId, newOwnerUserId: projectMemberUserId });
            return;
        }
        addProjectMemberMutation.mutate({ srId, userId: projectMemberUserId, memberRole: projectMemberRole });
    };

    const handleExportIssues = () => {
        const rows = (issues || []).map((issue: any) => ({
            "議題標題": issue.title,
            "狀態": issue.status,
            "優先等級": issue.priority,
            "指派對象": issue.assigneeId?.name || "",
            "指派信箱": issue.assigneeId?.email || "",
            "回報人": issue.reporterId?.name || "",
            "說明": issue.description,
            "建立時間": issue.createdAt ? new Date(issue.createdAt).toLocaleString() : "",
            "更新時間": issue.updatedAt ? new Date(issue.updatedAt).toLocaleString() : ""
        }));
        exportRowsToXlsx(rows, makeXlsxFileName("議題追蹤", sr?.title, formatExportDate()), "Issues");
        toast.success("議題追蹤已匯出 Excel");
    };

    const handleDownloadWbsImportTemplate = () => {
        const templateRows = [
            {
                "SR ID": sr?.id || "",
                "WBS 版本": nextVersionNumber,
                "工作項次": "1",
                "階層": 0,
                "工作編號": "PHASE-INIT",
                "工作項目": "啟動與規劃",
                "工作說明": "階層 0 為標題/說明列，不需填工作天數",
                "工作天數(小計)": "",
                "指派人員帳號": "",
                "指派人員帳號(多人)": "",
                "起始時間": "",
                "起訖時間": "",
                "完成百分比": 0,
                "備註": "階層 1 以上才填工作天數；指派人員帳號可填系統 Email"
            },
            {
                "SR ID": sr?.id || "",
                "WBS 版本": nextVersionNumber,
                "工作項次": "1.1",
                "階層": 1,
                "工作編號": "INIT-01",
                "工作項目": "專案啟動會議",
                "工作說明": "確認專案範圍、角色分工、時程與交付項目",
                "工作天數(小計)": 1,
                "指派人員帳號": "",
                "起始時間": "",
                "起訖時間": "",
                "完成百分比": 0,
                "備註": ""
            },
            {
                "SR ID": sr?.id || "",
                "WBS 版本": nextVersionNumber,
                "工作項次": "1.2",
                "階層": 1,
                "工作編號": "PLAN-01",
                "工作項目": "需求訪談與規劃",
                "工作說明": "盤點需求、限制條件、風險與導入規劃",
                "工作天數(小計)": 2,
                "指派人員帳號": "",
                "起始時間": "",
                "起訖時間": "",
                "完成百分比": 0,
                "備註": ""
            },
            {
                "SR ID": sr?.id || "",
                "WBS 版本": nextVersionNumber,
                "工作項次": "2",
                "階層": 0,
                "工作編號": "PHASE-IMPLEMENT",
                "工作項目": "建置與驗證",
                "工作說明": "階層 0 為標題/說明列，不需填工作天數",
                "工作天數(小計)": "",
                "指派人員帳號": "",
                "起始時間": "",
                "起訖時間": "",
                "完成百分比": 0,
                "備註": ""
            },
            {
                "SR ID": sr?.id || "",
                "WBS 版本": nextVersionNumber,
                "工作項次": "2.1",
                "階層": 1,
                "工作編號": "IMPLEMENT-01",
                "工作項目": "建置與設定",
                "工作說明": "依規劃進行環境建置、系統設定與功能驗證",
                "工作天數(小計)": 3,
                "指派人員帳號": "",
                "起始時間": "",
                "起訖時間": "",
                "完成百分比": 0,
                "備註": ""
            },
            {
                "SR ID": sr?.id || "",
                "WBS 版本": nextVersionNumber,
                "工作項次": "2.2",
                "階層": 1,
                "工作編號": "TEST-01",
                "工作項目": "測試與問題修正",
                "工作說明": "執行測試、追蹤問題並完成修正確認",
                "工作天數(小計)": 2,
                "指派人員帳號": "",
                "起始時間": "",
                "起訖時間": "",
                "完成百分比": 0,
                "備註": ""
            },
            {
                "SR ID": sr?.id || "",
                "WBS 版本": nextVersionNumber,
                "工作項次": "3",
                "階層": 0,
                "工作編號": "PHASE-CLOSE",
                "工作項目": "交付與結案",
                "工作說明": "階層 0 為標題/說明列，不需填工作天數",
                "工作天數(小計)": "",
                "指派人員帳號": "",
                "起始時間": "",
                "起訖時間": "",
                "完成百分比": 0,
                "備註": ""
            },
            {
                "SR ID": sr?.id || "",
                "WBS 版本": nextVersionNumber,
                "工作項次": "3.1",
                "階層": 1,
                "工作編號": "CLOSE-01",
                "工作項目": "文件交付與結案",
                "工作說明": "整理交付文件、完成驗收與結案確認",
                "工作天數(小計)": 1,
                "指派人員帳號": "",
                "起始時間": "",
                "起訖時間": "",
                "完成百分比": 0,
                "備註": ""
            }
        ];
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(templateRows);
        worksheet["!cols"] = [
            { wch: 28 },
            { wch: 10 },
            { wch: 10 },
            { wch: 8 },
            { wch: 14 },
            { wch: 24 },
            { wch: 42 },
            { wch: 14 },
            { wch: 28 },
            { wch: 14 },
            { wch: 14 },
            { wch: 12 },
            { wch: 32 }
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, "WBS匯入範本");
        XLSX.writeFile(workbook, makeXlsxFileName("WBS匯入範本", sr?.title || "通用", formatExportDate()));
        toast.success("WBS 匯入範本已下載");
    };

    const handleExportXlsx = () => {
        if (!latestVersion || !latestVersion.items?.length) {
            toast.error("沒有可匯出的 WBS 版本資料");
            return;
        }
        const assignedIds = Array.from(new Set(latestVersion.items.flatMap((item: any) => [item.assigneeId, ...(item.assigneeIds || [])]).filter(Boolean)));
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
    const handleFileUpload = async (files: FileList | null, category: "general" | "business_approval_email" | "service_content_email" = "general") => {
        if (!files || files.length === 0) return;

        setIsUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileDataBase64 = await fileToBase64(file);
                await uploadMutation.mutateAsync({
                    srId,
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type || "application/octet-stream",
                    category,
                    fileDataBase64
                });
            }
        } catch (error) {
            console.error("Upload failed", error);
            toast.error("檔案上傳失敗");
        } finally {
            setIsUploading(false);
        }
    };

    const openFinancialModal = () => {
        setEditedContractAmount(Number(sr?.contractAmount || 0));
        setEditedFinalPrice(Number(sr?.finalPrice ?? sr?.contractAmount ?? 0));
        setEditedTotalPoints(Number(sr?.totalPoints || 0));
        setEditedPointValue(Number(sr?.pointValue || 0));
        setShowFinancialModal(true);
    };

    const handleUpdateProjectFinancials = () => {
        const values = [editedContractAmount, editedFinalPrice, editedTotalPoints, editedPointValue];
        if (values.some(value => Number.isNaN(value) || value < 0)) {
            toast.error("金額、點數與單價不可為負數");
            return;
        }
        updateProjectFinancialsMutation.mutate({
            id: sr.id,
            contractAmount: editedContractAmount,
            finalPrice: editedFinalPrice,
            totalPoints: sr.srType === "maintenance" ? editedTotalPoints : undefined,
            pointValue: sr.srType === "maintenance" ? editedPointValue : undefined
        });
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
                            {canManageProjectMembers && (
                                <button
                                    onClick={() => {
                                        setEditedSalesUserId(sr.salesUserId || "");
                                        setEditedSalesRep(sr.salesRep || "");
                                        setEditedSalesDepartment(sr.salesDepartment || "");
                                        setEditedTitle(sr.title || "");
                                        setEditedCustomerName(sr.customerName || "");
                                        setEditedPmId(sr.pmId || "");
                                        setEditedPlannedStartDate(sr.plannedStartDate ? new Date(sr.plannedStartDate).toISOString().slice(0, 10) : "");
                                        setEditedPlannedEndDate(sr.plannedEndDate ? new Date(sr.plannedEndDate).toISOString().slice(0, 10) : "");
                                        setEditedSrType(sr.srType || "project");
                                        setShowEditSalesModal(true);
                                    }}
                                    className="w-full mt-2 px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
                                >
                                    編輯基本資料
                                </button>
                            )}
                            {canViewFinancials && (
                                <>
	                                    {sr.srType === "maintenance" && (
                                            <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
                                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide">維運點數</div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div>總點數 <strong className="block text-sm">{Number(sr.totalPoints || 0).toLocaleString()}</strong></div>
                                                    <div>點數單價 <strong className="block text-sm">NT$ {Number(sr.pointValue || 0).toLocaleString()}</strong></div>
                                                </div>
                                                <div className="mt-2 border-t border-sky-200 pt-2 text-xs dark:border-sky-900">
                                                    點數計算報價：<strong>NT$ {(Number(sr.totalPoints || 0) * Number(sr.pointValue || 0)).toLocaleString()}</strong>
                                                </div>
                                            </div>
                                        )}
	                                    <div className="flex justify-between">
	                                        <span className="text-muted-foreground">合約報價</span>
	                                        <span className="font-bold">NT$ {sr.contractAmount?.toLocaleString() || 0}</span>
	                                    </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">最終成交金額</span>
                                            <span className="font-bold">NT$ {(sr.finalPrice ?? sr.contractAmount ?? 0).toLocaleString()}</span>
                                        </div>
                                        {canEditFinancials && (
                                            <button
                                                onClick={openFinancialModal}
                                                className="w-full mt-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors"
                                            >
                                                編輯商務資訊
                                            </button>
                                        )}
                                        <div>
                                            <input
                                                id="business-approval-file-input"
                                                type="file"
                                                multiple
                                                style={{ display: "none" }}
                                                accept=".eml,.msg,.pdf,.doc,.docx,.png,.jpg,.jpeg"
                                                onChange={e => handleFileUpload(e.target.files, "business_approval_email")}
                                                disabled={isUploading}
                                            />
                                            <button
                                                onClick={() => !isUploading && document.getElementById("business-approval-file-input")?.click()}
                                                className="w-full mt-2 px-3 py-2 rounded-lg border border-border bg-background text-sm font-semibold hover:bg-muted transition-colors"
                                            >
                                                上傳業務同意郵件
                                            </button>
                                        </div>
	                                    <div className="flex justify-between items-center">
	                                        <span className="text-muted-foreground">預估毛利</span>
	                                        <span className={`font-bold ${sr.marginWarning ? 'text-destructive' : 'text-green-600'}`}>{sr.marginEstimate}%</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-semibold text-base flex items-center"><Users className="w-4 h-4 mr-2 text-primary" />專案參與人員</h3>
                            {canEditSalesOwner && (
                                <button
                                    onClick={() => setShowProjectMemberModal(true)}
                                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                                >
                                    <UserPlus className="w-3.5 h-3.5 mr-1" />新增
                                </button>
                            )}
                        </div>
                        <div className="space-y-2">
                            {(projectMembers || []).length === 0 ? (
                                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">尚無專案參與人員</div>
                            ) : (
                                (projectMembers || []).map((member: any) => (
                                    <div key={member.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium">{member.userName}</div>
                                            <div className="truncate text-xs text-muted-foreground">{member.department || "未指定部門"} / {member.memberRole === "participant" ? "參與人員" : member.memberRole === "watcher" ? "觀察者" : member.memberRole}</div>
                                        </div>
                                        {canManageProjectMembers && member.memberRole !== "owner" && (
                                            <button
                                                onClick={() => removeProjectMemberMutation.mutate({ srId, memberId: member.id })}
                                                className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                                                title="移除成員"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* File Upload Area */}
                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                        <h3 className="font-semibold text-base mb-3 flex items-center"><Paperclip className="w-4 h-4 mr-2 text-primary" />專案附件</h3>
                        <div
                            onDragOver={e => { e.preventDefault(); if (canEditWbs) setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={event => canEditWbs ? handleDrop(event) : event.preventDefault()}
                            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${canEditWbs ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => canEditWbs && !isUploading && document.getElementById('file-input')?.click()}
                        >
                            <Upload className={`w-7 h-7 mx-auto mb-2 ${isDragging ? 'text-primary' : 'text-muted-foreground/50'}`} />
                            <p className="text-xs text-muted-foreground">{isUploading ? "上傳中..." : "拖曳或點擊上傳檔案"}</p>
	                            <input
	                                id="file-input" type="file" multiple style={{ display: 'none' }}
	                                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
	                                onChange={e => handleFileUpload(e.target.files)}
	                                disabled={isUploading || !canEditWbs}
	                            />
	                        </div>
                            {sr.srType === "other_activity" && (
                                <div className="mt-2">
                                    <input
                                        id="service-content-file-input"
                                        type="file"
                                        multiple
                                        style={{ display: "none" }}
                                        accept=".eml,.msg,.pdf,.doc,.docx,.png,.jpg,.jpeg"
                                        onChange={e => handleFileUpload(e.target.files, "service_content_email")}
                                        disabled={isUploading || !canEditWbs}
                                    />
                                    <button
                                        onClick={() => canEditWbs && !isUploading && document.getElementById("service-content-file-input")?.click()}
                                        disabled={!canEditWbs}
                                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs font-semibold hover:bg-muted transition-colors"
                                    >
                                        上傳服務內容郵件
                                    </button>
                                </div>
                            )}
                        {attachments && attachments.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {attachments.map((a: any) => (
                                    <div key={a.id} className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg text-xs group">
                                        <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
	                                        <button
                                                type="button"
                                                onClick={() => downloadAttachmentMutation.mutate({ srId, attachmentId: a.id })}
                                                className="flex-1 truncate text-left font-medium transition-colors hover:text-primary"
                                                title={`下載 ${a.fileName}`}
                                            >
	                                            {a.fileName}
	                                        </button>
                                            {a.category && a.category !== "general" && (
                                                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
                                                    {a.category === "business_approval_email" ? "業務同意" : "服務內容"}
                                                </span>
                                            )}
	                                        <span className="text-muted-foreground whitespace-nowrap">{formatSize(a.fileSize)}</span>
                                            <button
                                                type="button"
                                                onClick={() => downloadAttachmentMutation.mutate({ srId, attachmentId: a.id })}
                                                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
                                                title="下載附件"
                                            >
                                                <Download className="h-3.5 w-3.5" />
                                            </button>
                                            {canEditWbs && <button
                                                type="button"
                                                onClick={() => {
                                                    if (window.confirm(`確定刪除附件「${a.fileName}」？`)) {
                                                        deleteAttachmentMutation.mutate({ srId, attachmentId: a.id });
                                                    }
                                                }}
                                                className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                                title="刪除附件"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>}
	                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Issues Tracking Area */}
	                    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
	                        <div className="flex justify-between items-center mb-3">
	                            <h3 className="font-semibold text-base flex items-center"><AlertCircle className="w-4 h-4 mr-2 text-primary" />專案議題追蹤</h3>
	                            <div className="flex items-center gap-2">
	                                <button
	                                    onClick={handleExportIssues}
	                                    disabled={!issues || issues.length === 0}
	                                    className="px-2 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
	                                >
	                                    匯出
	                                </button>
	                                {canEditWbs && <button onClick={() => setIsCreatingIssue(true)} className="p-1.5 hover:bg-muted bg-primary/10 rounded-lg text-primary transition-colors"><Plus className="w-4 h-4" /></button>}
	                            </div>
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
                                                disabled={!canEditWbs}
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
                                    {(!latestVersion || latestVersion.status !== "submitted") && canEditWbs && (
                                        <button onClick={handleStartBuild}
                                            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-1.5 rounded-md inline-flex items-center text-sm font-medium transition-colors shadow-sm">
                                            <Plus className="w-4 h-4 mr-1.5" />建立 v{nextVersionNumber}
                                        </button>
                                    )}
	                                </div>
	                            </div>

	                            {latestWbsAnomalies.length > 0 && (
	                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
	                                    <div className="flex items-start gap-3">
	                                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
	                                        <div className="min-w-0 flex-1">
	                                            <div className="font-semibold text-amber-900">WBS 資料異常提示</div>
	                                            <div className="text-xs text-amber-800 mt-1">以下項目可能影響排程、工時填寫與月結算率。</div>
	                                            <div className="mt-3 grid sm:grid-cols-2 gap-2">
	                                                {latestWbsAnomalies.map((item) => (
	                                                    <div key={item.key} className="bg-background border border-amber-200 rounded-lg px-3 py-2">
	                                                        <div className="flex justify-between items-center gap-2">
	                                                            <span className="text-sm font-semibold text-foreground">{item.label}</span>
	                                                            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{item.count}</span>
	                                                        </div>
	                                                        {item.examples.length > 0 && (
	                                                            <div className="mt-1 text-[11px] text-muted-foreground truncate">{item.examples.join("、")}</div>
	                                                        )}
	                                                    </div>
	                                                ))}
	                                            </div>
	                                        </div>
	                                    </div>
	                                </div>
	                            )}

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
                                                    {version.departmentApprovals?.length > 0 && (
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {version.departmentApprovals.map((approval: any) => {
                                                                const reviewer = allUsers?.items?.find((u: any) => u.id === approval.reviewedBy);
                                                                return (
                                                                    <div key={approval.department} className={`text-[11px] border rounded-lg px-2 py-1 ${getApprovalStatusColor(approval.status)}`}>
                                                                        <span className="font-semibold">{approval.department || "未指定部門"}</span>
                                                                        <span className="mx-1">/</span>
                                                                        <span>{getApprovalStatusText(approval.status)}</span>
                                                                        {reviewer && <span className="ml-1 text-muted-foreground">by {reviewer.name}</span>}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                                {version.status === "submitted" && canReviewSubmittedWbs && (
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
	                                                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
	                                                                            {wbsStatusLabels[item.status || "not_started"]}
	                                                                        </span>
	                                                                        {isAdded && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">新增</span>}
                                                                        {assigneeChanged && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">改派</span>}
                                                                    </div>
	                                                                    {item.description && (
	                                                                        <div className="mt-2 rounded border border-border/60 bg-muted/20 p-2.5">
	                                                                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">WBS 工項說明</div>
	                                                                            <div className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.description}</div>
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
                                    {sr.localFolderPath ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 font-semibold">
                                                <FileText className="w-4 h-4 text-primary" />
                                                專案專屬本機文件目錄
                                            </div>
                                            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-sm break-all">
                                                {sr.localFolderPath}
                                            </div>
                                        </div>
                                    ) : (
                                        <SharePointFilesSection
                                            category="專案"
                                            sharePointFolderUrl={sr.sharePointFolderUrl}
                                            title="專案專屬 SharePoint 文件庫"
                                        />
                                    )}
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
                                        onClick={handleDownloadWbsImportTemplate}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border bg-background hover:bg-muted text-foreground rounded-lg text-xs font-semibold transition-all"
                                        title="下載可直接匯入的 WBS 範本"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        下載範本
                                    </button>
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
                                    <button onClick={() => {
                                        if (!window.confirm("要放棄目前的 WBS 草稿嗎？")) return;
                                        discardDraftMutation.mutate({ srId });
                                        setIsBuildingVersion(false);
                                        setDraftItems([]);
                                    }}
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
                                <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-3">
                                    <span className="mr-1 text-xs font-semibold text-muted-foreground self-center">一鍵建立範本</span>
                                    <button
                                        type="button"
                                        onClick={() => handleApplySingleRowTemplate("教育訓練")}
                                        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                                    >
                                        教育訓練
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleApplySingleRowTemplate("內部專案")}
                                        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                                    >
                                        內部專案
                                    </button>
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
                                        {draftItems.map((item, idx) => {
                                            const isExpanded = !!expandedDraftItems[idx];
                                            const isHeading = isHeadingItem(item);
                                            const startDateValue = item.startDate ? typeof item.startDate === "string" ? item.startDate : new Date(item.startDate).toISOString().slice(0, 10) : "";
                                            const endDateValue = item.endDate ? typeof item.endDate === "string" ? item.endDate : new Date(item.endDate).toISOString().slice(0, 10) : "";

                                            return (
                                                <div key={idx} className="bg-background rounded-lg border border-border group hover:border-primary/40 transition-colors" style={{ marginLeft: `${(item.level || 0) * 1.5}rem` }}>
                                                    <div className="flex gap-2 p-3">
                                                        <div className="flex-1 min-w-0 space-y-3">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{computeItemNumbers(draftItems)[idx]}</span>
                                                                {isHeading && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">標題/說明</span>}
                                                                <input
                                                                    type="text"
                                                                    placeholder="任務標題 (必填)"
                                                                    value={item.title}
                                                                    onChange={(e) => handleUpdateDraftItem(idx, "title", e.target.value)}
                                                                    className="min-w-[220px] flex-1 bg-transparent px-1 py-1 text-sm font-medium outline-none border-0 border-b border-transparent transition-colors hover:border-border focus:border-primary focus:ring-0"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleDraftItemExpanded(idx)}
                                                                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                >
                                                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                                    更多設定
                                                                </button>
                                                            </div>

                                                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                    <label>工作編號</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="選填"
                                                                        value={item.code || ""}
                                                                        onChange={(e) => handleUpdateDraftItem(idx, "code", e.target.value)}
                                                                        className="rounded border border-transparent bg-muted px-2 py-2 outline-none focus:border-primary focus:bg-background"
                                                                    />
                                                                </div>
	                                                                <div className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">
	                                                                    <label>WBS 工項說明</label>
	                                                                    <textarea
	                                                                        rows={2}
	                                                                        placeholder="說明工作範圍、執行方式與預期產出（選填）"
	                                                                        value={item.description || ""}
	                                                                        onChange={(e) => handleUpdateDraftItem(idx, "description", e.target.value)}
	                                                                        className="resize-y rounded border border-transparent bg-muted px-2 py-2 leading-relaxed outline-none focus:border-primary focus:bg-background"
	                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                    <label>指派給 (人員)</label>
                                                                    <UserSearchPicker
                                                                        users={techs || []}
                                                                        selectedUserId={item.assigneeId}
                                                                        placeholder="搜尋姓名或 Email..."
                                                                        onSelect={(selectedUser) => handleSetPrimaryAssignee(idx, selectedUser.id)}
                                                                        onClear={() => handleSetPrimaryAssignee(idx, undefined)}
                                                                    />
                                                                    {(item.assigneeIds || []).length > 0 && (
                                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                                            {(item.assigneeIds || []).map((userId) => {
                                                                                const person = (allUsers?.items || []).find((user: any) => user.id === userId) || (techs || []).find((user: any) => user.id === userId);
                                                                                return (
                                                                                    <span key={userId} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${item.assigneeId === userId ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
                                                                                        {person?.name || "找不到使用者"}
                                                                                        {item.assigneeId !== userId && (
                                                                                            <button type="button" onClick={() => handleRemoveDraftAssignee(idx, userId)} className="hover:text-red-500">×</button>
                                                                                        )}
                                                                                    </span>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                    <UserSearchPicker
                                                                        key={`${idx}-${(item.assigneeIds || []).join(",")}`}
                                                                        users={techs || []}
                                                                        selectedUserId=""
                                                                        placeholder="新增其他指派人員..."
                                                                        onSelect={(selectedUser) => handleAddDraftAssignee(idx, selectedUser.id)}
                                                                        filterUser={(pickerUser) => !(item.assigneeIds || []).includes(pickerUser.id)}
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                    <label>工作天數(小計)</label>
                                                                    <input
                                                                        type="number"
                                                                        min="0.5"
                                                                        step="0.5"
                                                                        value={isHeading ? "" : item.estimatedHours}
                                                                        onChange={(e) => handleUpdateDraftItem(idx, "estimatedHours", Number(e.target.value))}
                                                                        disabled={isHeading}
                                                                        placeholder={isHeading ? "標題列不需填" : "0"}
                                                                        className="rounded border border-transparent bg-muted px-2 py-2 outline-none focus:border-primary focus:bg-background disabled:cursor-not-allowed disabled:opacity-70"
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                    <label>起訖日期</label>
                                                                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                                                                        <input
                                                                            type="date"
                                                                            value={startDateValue}
                                                                            onChange={(e) => handleUpdateDraftItem(idx, "startDate", e.target.value)}
                                                                            className="min-w-0 rounded border border-transparent bg-muted px-2 py-2 text-[11px] outline-none focus:border-primary focus:bg-background"
                                                                        />
                                                                        <span>~</span>
                                                                        <input
                                                                            type="date"
                                                                            value={endDateValue}
                                                                            onChange={(e) => handleUpdateDraftItem(idx, "endDate", e.target.value)}
                                                                            className="min-w-0 rounded border border-transparent bg-muted px-2 py-2 text-[11px] outline-none focus:border-primary focus:bg-background"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                    <label>狀態</label>
                                                                    <select
                                                                        value={item.status || "not_started"}
                                                                        onChange={(e) => {
                                                                            const status = e.target.value as WbsDraftItem["status"];
                                                                            handleUpdateDraftItemFields(idx, {
                                                                                status,
                                                                                completionPercentage: status === "completed" ? 100 : status === "not_started" ? 0 : Math.max(item.completionPercentage || 0, 50)
                                                                            });
                                                                        }}
                                                                        className="rounded border border-transparent bg-muted px-2 py-2 outline-none focus:border-primary focus:bg-background"
                                                                    >
                                                                        <option value="not_started">尚未開始</option>
                                                                        <option value="in_progress">進行中</option>
                                                                        <option value="completed">完成</option>
                                                                    </select>
                                                                </div>
                                                                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                                                    <label>備註</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="選填"
                                                                        value={item.remarks || ""}
                                                                        onChange={(e) => handleUpdateDraftItem(idx, "remarks", e.target.value)}
                                                                        className="rounded border border-transparent bg-muted px-2 py-2 outline-none focus:border-primary focus:bg-background"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {isExpanded && (
                                                                <div className="grid gap-3 border-t border-border/50 pt-3 md:grid-cols-2">
                                                                    <div className="flex items-center text-xs text-muted-foreground">
                                                                        <span className="mr-2">色標</span>
                                                                        <input
                                                                            type="color"
                                                                            value={item.colorCode || "#E2E8F0"}
                                                                            onChange={(e) => handleUpdateDraftItem(idx, "colorCode", e.target.value)}
                                                                            className="h-7 w-12 cursor-pointer rounded border-0 p-0 ring-1 ring-border"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <button onClick={() => handleMoveDraftItem(idx, -1)} disabled={idx === 0}
                                                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded disabled:opacity-30" title="上移">↑</button>
                                                            <button onClick={() => handleMoveDraftItem(idx, 1)} disabled={idx === draftItems.length - 1}
                                                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded disabled:opacity-30" title="下移">↓</button>
                                                            <button onClick={() => handleShiftDraftLevel(idx, -1)} disabled={(item.level || 0) === 0}
                                                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded disabled:opacity-30" title="升層">←</button>
                                                            <button onClick={() => handleShiftDraftLevel(idx, 1)} disabled={idx === 0}
                                                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded disabled:opacity-30" title="降層">→</button>
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
                                                </div>
                                            );
                                        })}
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
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {saveDraftMutation.isPending
                                            ? "草稿儲存中…"
                                            : lastDraftSavedAt
                                                ? `上次儲存：${lastDraftSavedAt.toLocaleTimeString()}`
                                                : "尚未儲存草稿"}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleSaveDraft} disabled={saveDraftMutation.isPending}
                                        className="border border-border bg-background px-4 py-2 rounded-md text-sm font-medium hover:bg-muted disabled:opacity-50">
                                        手動存草稿
                                    </button>
                                    <button onClick={handleSaveVersion} disabled={submitVersion.isPending || draftItems.length === 0}
                                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-md font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
                                        {submitVersion.isPending ? "儲存中..." : <><Save className="w-4 h-4" /> 送出版本審核</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Sales Owner Modal */}
            {showProjectMemberModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><UserPlus className="w-5 h-5 mr-2 text-primary" />新增專案參與人員</h2>
                            <button onClick={() => setShowProjectMemberModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">選擇使用者</label>
                                <UserSearchPicker
                                    users={allUsers?.items || []}
                                    selectedUserId={projectMemberUserId}
                                    placeholder="搜尋姓名或 Email..."
                                    onSelect={(selectedUser) => setProjectMemberUserId(selectedUser.id)}
                                    onClear={() => setProjectMemberUserId("")}
                                    filterUser={(pickerUser) => projectMemberRole === "owner"
                                        ? !projectMembers?.find((member: any) => member.userId === pickerUser.id && member.memberRole === "owner")
                                        : !projectMembers?.find((member: any) => member.userId === pickerUser.id)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">角色</label>
                                <select
                                    value={projectMemberRole}
                                    onChange={event => setProjectMemberRole(event.target.value as "owner" | "participant" | "watcher")}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                    <option value="owner">負責人 (Owner)</option>
                                    <option value="participant">參與人員</option>
                                    <option value="watcher">觀察者 / 學習</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setShowProjectMemberModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button
                                onClick={handleAddProjectMember}
                                disabled={addProjectMemberMutation.isPending}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                            >
                                {addProjectMemberMutation.isPending ? "新增中..." : "確認新增"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Project financials modal */}
            {showFinancialModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold">編輯專案商務資訊</h2>
                                <p className="mt-1 text-xs text-muted-foreground">點數計算報價、合約報價與最終成交金額分開保存，不會互相覆蓋。</p>
                            </div>
                            <button onClick={() => setShowFinancialModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        {sr.srType === "maintenance" && (
                            <div className="grid grid-cols-2 gap-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20">
                                <label className="text-sm font-medium">
                                    總點數
                                    <input type="number" min={0} value={editedTotalPoints} onChange={event => setEditedTotalPoints(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal" />
                                </label>
                                <label className="text-sm font-medium">
                                    點數單價 (NT$)
                                    <input type="number" min={0} value={editedPointValue} onChange={event => setEditedPointValue(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal" />
                                </label>
                                <div className="col-span-2 rounded-lg bg-background/80 p-3 text-sm">
                                    點數計算報價
                                    <strong className="float-right text-base">NT$ {(editedTotalPoints * editedPointValue).toLocaleString()}</strong>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="text-sm font-medium">
                                合約報價 (NT$)
                                <input type="number" min={0} value={editedContractAmount} onChange={event => setEditedContractAmount(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal" />
                            </label>
                            <label className="text-sm font-medium">
                                合約最終金額 (NT$)
                                <input type="number" min={0} value={editedFinalPrice} onChange={event => setEditedFinalPrice(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal" />
                            </label>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowFinancialModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button
                                onClick={handleUpdateProjectFinancials}
                                disabled={updateProjectFinancialsMutation.isPending}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                            >
                                {updateProjectFinancialsMutation.isPending ? "儲存中..." : "儲存商務資訊"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Sales Owner Modal */}
            {showEditSalesModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold">編輯專案基本資料</h2>
                            <button onClick={() => setShowEditSalesModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-sm font-medium">
                                專案名稱
                                <input value={editedTitle} onChange={event => setEditedTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal" />
                            </label>
                            <label className="text-sm font-medium">
                                客戶名稱
                                <input value={editedCustomerName} onChange={event => setEditedCustomerName(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal" />
                            </label>
                            <label className="text-sm font-medium">
                                專案類型
                                <select value={editedSrType} onChange={event => setEditedSrType(event.target.value as typeof editedSrType)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal">
                                    <option value="project">專案</option>
                                    <option value="maintenance">維運</option>
                                    <option value="other_activity">其他活動</option>
                                </select>
                            </label>
                            <label className="text-sm font-medium">
                                PM
                                <select value={editedPmId} onChange={event => setEditedPmId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal">
                                    <option value="">未指派</option>
                                    {(allUsers?.items || []).filter((item: any) => item.role === "pm").map((item: any) => (
                                        <option key={item.id} value={item.id}>{item.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-sm font-medium">
                                預計開始日
                                <input type="date" value={editedPlannedStartDate} onChange={event => setEditedPlannedStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal" />
                            </label>
                            <label className="text-sm font-medium">
                                預計結束日
                                <input type="date" value={editedPlannedEndDate} onChange={event => setEditedPlannedEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal" />
                            </label>
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
                                disabled={updateSalesOwnerMutation.isPending || !editedTitle.trim() || !editedCustomerName.trim()}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                            >
                                {updateSalesOwnerMutation.isPending ? "儲存中..." : "儲存基本資料"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 shadow-2xl backdrop-blur-sm transition-opacity animate-in fade-in">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95">
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
	                                    <UserSearchPicker
	                                        users={techs || []}
	                                        selectedUserId={newIssueData.assigneeId}
	                                        placeholder="搜尋姓名或 Email..."
	                                        onSelect={(selectedUser) => setNewIssueData({ ...newIssueData, assigneeId: selectedUser.id })}
	                                        onClear={() => setNewIssueData({ ...newIssueData, assigneeId: "" })}
	                                    />
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
