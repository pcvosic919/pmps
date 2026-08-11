import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "../lib/trpc";
import {
    Building2, Calendar, ChevronLeft, Users, Briefcase, Clock,
    Plus, X, Check, UserPlus, Trash2, FileText, ChevronDown, Upload, Paperclip
} from "lucide-react";
import { useCurrentUser } from "../lib/useCurrentUser";
import { SharePointFilesSection } from "../components/SharePointFilesSection";
import { BusinessUserPicker } from "../components/BusinessUserPicker";
import { UserSearchPicker } from "../components/UserSearchPicker";
import { fileToBase64 } from "../lib/files";
import toast from "react-hot-toast";


const OPP_STATUSES = [
    { value: "new", label: "待處理", color: "bg-blue-100 text-blue-800 border-blue-200" },
    { value: "qualified", label: "已確認", color: "bg-purple-100 text-purple-800 border-purple-200" },
    { value: "presales_active", label: "協銷中", color: "bg-amber-100 text-amber-800 border-amber-200" },
    { value: "quoting", label: "報價中", color: "bg-orange-100 text-orange-800 border-orange-200" },
    { value: "converted", label: "已轉案", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
    { value: "won", label: "已成交", color: "bg-green-100 text-green-800 border-green-200" },
    { value: "lost", label: "已失敗", color: "bg-red-100 text-red-800 border-red-200" },
    { value: "cancelled", label: "已取消", color: "bg-red-600 text-white border-red-700" },
] as const;

const OPP_TYPES = [
    { value: "revenue", label: "營收型商機" },
    { value: "presales", label: "協銷" },
] as const;

const OPPORTUNITY_PROBABILITY_OPTIONS = [
    { value: 0, label: "無成交可能／已失敗" },
    { value: 20, label: "初步接洽" },
    { value: 40, label: "需求已確認" },
    { value: 60, label: "方案或協銷進行中" },
    { value: 80, label: "報價或客戶決策中" },
    { value: 100, label: "客戶確認／確定成交" }
] as const;
type OpportunityProbabilityValue = typeof OPPORTUNITY_PROBABILITY_OPTIONS[number]["value"];

const QUOTE_STATUS_LABELS: Record<string, string> = {
    draft: "草稿",
    submitted: "已送出",
    accepted: "客戶已確認",
    void: "已作廢"
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
    opportunity_created: "建立商機",
    opportunity_status_changed: "變更商機狀態",
    opportunity_owner_transferred: "移轉 Owner",
    opportunity_member_added: "新增商機成員",
    opportunity_member_removed: "移除商機成員",
    opportunity_member_role_changed: "調整成員角色",
    opportunity_sales_owner_updated: "調整業務歸屬",
    opportunity_estimated_amount_updated: "調整預估金額",
    opportunity_probability_updated: "調整商機成功率",
    opportunity_description_updated: "更新商機說明",
    opportunity_custom_fields_updated: "更新自訂欄位",
    opportunity_attachment_uploaded: "上傳附件",
    presales_time_logged: "填寫協銷工時",
    quote_version_created: "建立報價版本",
    quote_adopted: "確認客戶接受報價（相容紀錄）",
    quote_customer_accepted: "確認客戶接受報價",
    accepted_quote_replaced: "更換客戶確認報價",
    opportunity_converted: "商機轉專案"
};


export function OpportunityDetailPage() {
    const [match, params] = useRoute("/opportunities/:id");
    const id = match ? (params.id as string) : "";

    const { user } = useCurrentUser();
    const hasRole = (role: string) => user?.role === role;
    const canDelete = user?.email?.trim().toLowerCase() === "demo@demo.com";

    // ------ Modal states ------
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignTechId, setAssignTechId] = useState("");
    const [assignHours, setAssignHours] = useState("8");
    const [assignHourlyRate, setAssignHourlyRate] = useState("1000");
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

    const [showExceptionModal, setShowExceptionModal] = useState(false);
    const [exceptionAmount, setExceptionAmount] = useState("");
    const [exceptionReason, setExceptionReason] = useState("");
    const [exceptionError, setExceptionError] = useState("");
    const [confirmingQuoteId, setConfirmingQuoteId] = useState("");
    const [quoteAcceptedAt, setQuoteAcceptedAt] = useState(new Date().toISOString().slice(0, 10));
    const [quoteAcceptanceNote, setQuoteAcceptanceNote] = useState("");
    const [quoteReplacementReason, setQuoteReplacementReason] = useState("");
    const [quoteConfirmationError, setQuoteConfirmationError] = useState("");

    const [showStatusDropdown, setShowStatusDropdown] = useState(false);

    const [showCustomFieldsModal, setShowCustomFieldsModal] = useState(false);
    const [editingCustomFields, setEditingCustomFields] = useState<{fieldId: string, value: string}[]>([]);
    const [showEditDescriptionModal, setShowEditDescriptionModal] = useState(false);
    const [editedDescription, setEditedDescription] = useState("");
    const [descriptionError, setDescriptionError] = useState("");
    const [showEditEstimatedValueModal, setShowEditEstimatedValueModal] = useState(false);
    const [editedEstimatedValue, setEditedEstimatedValue] = useState("");
    const [estimatedValueError, setEstimatedValueError] = useState("");
    const [showEditProbabilityModal, setShowEditProbabilityModal] = useState(false);
    const [editedProbability, setEditedProbability] = useState<OpportunityProbabilityValue>(0);
    const [editedProbabilityNote, setEditedProbabilityNote] = useState("");
    const [probabilityError, setProbabilityError] = useState("");
    const [showEditSalesModal, setShowEditSalesModal] = useState(false);
    const [editedSalesUserId, setEditedSalesUserId] = useState("");
    const [editedSalesRep, setEditedSalesRep] = useState("");
    const [editedSalesDepartment, setEditedSalesDepartment] = useState("");
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [showQuoteForm, setShowQuoteForm] = useState(false);
    const [quoteName, setQuoteName] = useState("");
    const [quoteAmount, setQuoteAmount] = useState("");
    const [quoteDescription, setQuoteDescription] = useState("");
    const [quoteProducts, setQuoteProducts] = useState("");
    const [quoteExpectedCloseDate, setQuoteExpectedCloseDate] = useState("");
    const [quoteTaxIncluded, setQuoteTaxIncluded] = useState(false);
    const [quoteError, setQuoteError] = useState("");

    // ------ Queries ------
    const { data: opp, isLoading: isOppLoading, refetch: refetchOpp } = trpc.opportunities.getById.useQuery({ id }, { enabled: !!id });
    const { data: members, isLoading: isMembersLoading, refetch: refetchMembers } = trpc.opportunities.getMembers.useQuery({ opportunityId: id }, { enabled: !!id });
    const { data: assignments, isLoading: isAssignmentsLoading, refetch: refetchAssignments } = trpc.opportunities.getAssignments.useQuery({ opportunityId: id }, { enabled: !!id });
    const { data: timesheets, isLoading: isTimesheetsLoading, refetch: refetchTimesheets } = trpc.opportunities.getTimesheets.useQuery({ opportunityId: id }, { enabled: !!id });
    const { data: presalesList } = trpc.users.presalesList.useQuery();
    const { data: allUsers } = trpc.users.list.useQuery({ limit: 500 });
    const { data: customFieldDefs } = trpc.system.getCustomFields.useQuery();
    const { data: quotes, refetch: refetchQuotes } = trpc.opportunities.listQuotes.useQuery(
        { opportunityId: id },
        { enabled: !!id }
    );
    const { data: productApprovals, refetch: refetchProductApprovals } = trpc.opportunities.listProductApprovals.useQuery(
        { opportunityId: id },
        { enabled: !!id }
    );
    const { data: historyEvents, refetch: refetchHistory, isFetching: isFetchingHistory } = trpc.opportunities.getBusinessHistory.useQuery(
        { opportunityId: id, limit: 100 },
        { enabled: !!id }
    );

    const oppFields = customFieldDefs?.filter((f: any) => f.entityType === "opportunity") || [];
    const getFieldValue = (fieldId: string) => {
        return (opp as any)?.customFields?.find((cf: any) => cf.fieldId === fieldId)?.value || "未填寫";
    };

    // ------ Mutations ------
    const assignMutation = trpc.opportunities.assignPresales.useMutation({
        onSuccess: () => { refetchAssignments(); refetchOpp(); setShowAssignModal(false); setAssignTechId(""); setAssignHours("8"); setAssignHourlyRate("1000"); setAssignError(""); },
        onError: (err) => setAssignError(err.message || "指派失敗")
    });

    const logTimeMutation = trpc.opportunities.logPresalesTime.useMutation({
        onSuccess: () => { refetchTimesheets(); setShowTimesheetModal(false); setTsDate(new Date().toISOString().slice(0, 10)); setTsHours("4"); setTsDesc(""); setTsError(""); },
        onError: (err) => setTsError(err.message || "回報失敗")
    });

    const addMemberMutation = trpc.opportunities.addMember.useMutation({
        onSuccess: () => { refetchMembers(); setShowMemberModal(false); setMemberUserId(""); setMemberRole("watcher"); setMemberError(""); },
        onError: (err) => setMemberError(err.message || "新增失敗")
    });

    const removeMemberMutation = trpc.opportunities.removeMember.useMutation({
        onSuccess: () => refetchMembers(),
    });

    const deleteOpportunityMutation = trpc.opportunities.delete.useMutation({
        onSuccess: () => {
            window.location.href = "/opportunities";
        },
        onError: (err) => alert(err.message || "刪除失敗")
    });

    const updateStatusMutation = trpc.opportunities.updateStatus.useMutation({
        onSuccess: () => { refetchOpp(); setShowStatusDropdown(false); }
    });

    const updateCustomFieldsMutation = trpc.opportunities.updateCustomFields.useMutation({
        onSuccess: () => { refetchOpp(); setShowCustomFieldsModal(false); }
    });

    const updateDescriptionMutation = trpc.opportunities.updateDescription.useMutation({
        onSuccess: () => {
            refetchOpp();
            setShowEditDescriptionModal(false);
            setDescriptionError("");
        },
        onError: (err) => setDescriptionError(err.message || "更新描述失敗")
    });

    const updateEstimatedValueMutation = trpc.opportunities.updateEstimatedValue.useMutation({
        onSuccess: () => {
            refetchOpp();
            setShowEditEstimatedValueModal(false);
            setEstimatedValueError("");
        },
        onError: (err) => setEstimatedValueError(err.message || "更新商機金額失敗")
    });

    const updateProbabilityMutation = trpc.opportunities.updateProbability.useMutation({
        onSuccess: async () => {
            await Promise.all([refetchOpp(), refetchHistory()]);
            setShowEditProbabilityModal(false);
            setProbabilityError("");
        },
        onError: (err) => setProbabilityError(err.message || "更新商機成功率失敗")
    });

    const updateOpportunityTypeMutation = trpc.opportunities.updateOpportunityType.useMutation({
        onSuccess: () => refetchOpp()
    });

    const updateSalesOwnerMutation = trpc.opportunities.updateSalesOwner.useMutation({
        onSuccess: () => {
            refetchOpp();
            setShowEditSalesModal(false);
        }
    });

    const uploadAttachmentMutation = trpc.opportunities.uploadAttachment.useMutation({
        onSuccess: () => {
            refetchOpp();
        }
    });

    const createSRMutation = trpc.opportunities.createSR.useMutation({
        onSuccess: (data) => {
            setShowExceptionModal(false);
            setExceptionAmount("");
            setExceptionReason("");
            setExceptionError("");
            window.location.href = `/service-requests/${data.id}`;
        },
        onError: (err) => setExceptionError(err.message || "例外成立專案失敗")
    });

    const resetQuoteForm = () => {
        setShowQuoteForm(false);
        setQuoteName("");
        setQuoteAmount("");
        setQuoteDescription("");
        setQuoteProducts("");
        setQuoteExpectedCloseDate("");
        setQuoteTaxIncluded(false);
        setQuoteError("");
    };
    const createQuoteMutation = trpc.opportunities.createQuoteVersion.useMutation({
        onSuccess: async () => {
            await Promise.all([refetchQuotes(), refetchOpp()]);
            resetQuoteForm();
        },
        onError: (error) => setQuoteError(error.message || "建立報價版本失敗")
    });
    const submitQuoteMutation = trpc.opportunities.submitQuoteVersion.useMutation({
        onSuccess: () => refetchQuotes(),
        onError: (error) => alert(error.message)
    });
    const confirmQuoteMutation = trpc.opportunities.confirmQuoteAcceptance.useMutation({
        onSuccess: async (data) => {
            await Promise.all([refetchQuotes(), refetchOpp(), refetchHistory()]);
            setConfirmingQuoteId("");
            setQuoteAcceptanceNote("");
            setQuoteReplacementReason("");
            setQuoteConfirmationError("");
            toast.success(data.quoteReplaced ? "已更新待建專案的確認報價" : "客戶確認完成，已產生待建專案");
        },
        onError: (error) => setQuoteConfirmationError(error.message || "確認報價失敗")
    });
    const voidQuoteMutation = trpc.opportunities.voidQuoteVersion.useMutation({
        onSuccess: () => refetchQuotes(),
        onError: (error) => alert(error.message)
    });
    const reviewProductApprovalMutation = trpc.opportunities.reviewProductApproval.useMutation({
        onSuccess: () => { toast.success("產品核准狀態已更新"); refetchProductApprovals(); refetchHistory(); },
        onError: (error) => toast.error(error.message)
    });

    // ------ Handlers ------
    const handleAssign = () => {
        if (!assignTechId) { setAssignError("請選擇技術員"); return; }
        const hours = parseFloat(assignHours);
        if (isNaN(hours) || hours <= 0) { setAssignError("請輸入有效時數"); return; }
        const hourlyRate = parseFloat(assignHourlyRate);
        if (isNaN(hourlyRate) || hourlyRate < 0) { setAssignError("請輸入有效協銷時薪"); return; }
        assignMutation.mutate({ opportunityId: id, techId: assignTechId, estimatedHours: hours, hourlyRate });
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

    const handleCreateExceptionProject = () => {
        const amount = parseFloat(exceptionAmount);
        if (!Number.isFinite(amount) || amount < 0) { setExceptionError("請輸入有效確認金額"); return; }
        if (!exceptionReason.trim()) { setExceptionError("請輸入例外轉案原因"); return; }
        createSRMutation.mutate({
            opportunityId: id,
            title: opp?.title || "待建專案",
            customerName: opp?.customerName || "",
            salesUserId: (opp as any)?.salesUserId || undefined,
            salesDepartment: (opp as any)?.salesDepartment || undefined,
            salesRep: (opp as any)?.salesRep || undefined,
            contractAmount: amount,
            exceptionReason: exceptionReason.trim()
        });
    };

    const handleUpdateDescription = () => {
        updateDescriptionMutation.mutate({ id, description: editedDescription });
    };

    const handleUpdateEstimatedValue = () => {
        const value = parseFloat(editedEstimatedValue.replace(/,/g, ""));
        if (isNaN(value) || value < 0) {
            setEstimatedValueError("請輸入有效金額");
            return;
        }
        updateEstimatedValueMutation.mutate({ id, estimatedValue: value });
    };

    const handleUpdateProbability = () => {
        if (editedProbabilityNote.length > 2000) {
            setProbabilityError("成功率備註不可超過 2,000 字");
            return;
        }
        updateProbabilityMutation.mutate({
            id,
            probability: editedProbability,
            probabilityNote: editedProbabilityNote.trim() || undefined
        });
    };

    const handleUpdateSalesOwner = () => {
        if (!editedSalesUserId) return;
        updateSalesOwnerMutation.mutate({ id, salesUserId: editedSalesUserId });
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setIsUploadingFile(true);
        try {
            for (let index = 0; index < files.length; index++) {
                const file = files[index];
                const fileDataBase64 = await fileToBase64(file);
                await uploadAttachmentMutation.mutateAsync({
                    opportunityId: id,
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type || "application/octet-stream",
                    fileDataBase64
                });
            }
            alert("商機附件上傳成功");
        } catch (error: any) {
            alert(error?.message || "商機附件上傳失敗");
        } finally {
            setIsUploadingFile(false);
            const input = document.getElementById("opportunity-file-input") as HTMLInputElement | null;
            if (input) input.value = "";
        }
    };

    const handleFileDrop = (event: React.DragEvent) => {
        event.preventDefault();
        setIsDraggingFile(false);
        void handleFileUpload(event.dataTransfer.files);
    };

    const formatSize = (bytes?: number) => {
        const value = Number(bytes || 0);
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    };

    if (isOppLoading || isMembersLoading || isAssignmentsLoading || isTimesheetsLoading) {
        return <div className="p-8 text-center animate-pulse">載入中...</div>;
    }
    if (!opp) return <div className="p-8 text-center text-red-500">找不到商機</div>;

    const currentStatus = OPP_STATUSES.find(s => s.value === opp.status) ?? OPP_STATUSES[0];
    const isTerminal = ["converted", "won", "lost", "cancelled"].includes(opp.status);
    const project = (opp as any).project as { id: string; projectCode: string; title: string; status: string; sourceQuoteId: string } | null;
    const isOpportunityOwner = opp.ownerId === user?.id;
    const isSalesUser = (opp as any).salesUserId === user?.id;
    const isBusinessOwner = hasRole("business") && opp.ownerId === user?.id;
    const isAssignedPresales = (assignments || []).some((assignment: any) => assignment.techId === user?.id);
    const canChangeQuoteDuringSetup = !project || project.status === "new";
    const canManageQuotes = !["lost", "cancelled"].includes(opp.status)
        && canChangeQuoteDuringSetup
        && (hasRole("admin") || hasRole("manager") || isOpportunityOwner || isSalesUser || isAssignedPresales);
    const canConfirmQuotes = !["lost", "cancelled"].includes(opp.status)
        && canChangeQuoteDuringSetup
        && (hasRole("admin") || hasRole("manager") || isOpportunityOwner || isSalesUser);
    const acceptedQuote = (quotes || []).find((quote: any) => quote.status === "accepted");
    const latestDraftQuote = (quotes || []).find((quote: any) =>
        quote.status === "draft" && (!acceptedQuote || quote.version > acceptedQuote.version)
    );
    const latestSubmittedQuote = (quotes || []).find((quote: any) =>
        quote.status === "submitted" && (!acceptedQuote || quote.version > acceptedQuote.version)
    );
    const confirmingQuote = (quotes || []).find((quote: any) => quote.id === confirmingQuoteId);
    const requiresReplacementReason = !!project?.sourceQuoteId && project.sourceQuoteId !== confirmingQuoteId;
    const canCreateExceptionProject = !project
        && !acceptedQuote
        && !["lost", "cancelled", "converted"].includes(opp.status)
        && (hasRole("admin") || hasRole("manager") || isOpportunityOwner);
    const canEditSalesOwner = hasRole("admin") || hasRole("manager") || hasRole("presales") || isBusinessOwner;
    const canEditProbability = canEditSalesOwner && !isTerminal;
    const canEditOpportunityMembers = hasRole("admin") || hasRole("manager") || hasRole("presales") || user?.id === opp.ownerId;
    const canReportTime = hasRole("admin") || hasRole("manager") || hasRole("pm") || hasRole("presales") || hasRole("tech");

    const getTechName = (techId: string) => {
        const found = presalesList?.find((u: any) => u.id === techId);
        return found ? found.name : `#${techId}`;
    };

    const openNewQuoteForm = () => {
        setQuoteName(`${opp.title} 報價`);
        setQuoteAmount(String((opp as any).quotedAmount ?? opp.estimatedValue ?? 0));
        setQuoteProducts(((opp as any).productNames || []).join("、"));
        setQuoteExpectedCloseDate((opp as any).expectedCloseDate ? new Date((opp as any).expectedCloseDate).toISOString().slice(0, 10) : "");
        setShowQuoteForm(true);
        window.setTimeout(() => document.getElementById("quote-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    };

    const openQuoteConfirmation = (quoteId: string) => {
        setConfirmingQuoteId(quoteId);
        setQuoteAcceptedAt(new Date().toISOString().slice(0, 10));
        setQuoteAcceptanceNote("");
        setQuoteReplacementReason("");
        setQuoteConfirmationError("");
    };

    const openExceptionProject = () => {
        setExceptionAmount(String((opp as any).finalDealAmount ?? (opp as any).quotedAmount ?? opp.estimatedValue ?? 0));
        setExceptionReason("");
        setExceptionError("");
        setShowExceptionModal(true);
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
                                case 'quoting': return 3;
                                case 'won': case 'lost': case 'converted': case 'cancelled': return 4;
                                default: return 0;
                            }
                        })() / 4) * 100}% - ${(() => {
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
                    { value: "quoting", label: "報價中" },
                    { value: "final", label: "已結案" }
                ].map((step, index) => {
                    const currentProgress = (() => {
                        switch(opp.status) {
                            case 'new': return 0;
                            case 'qualified': return 1;
                            case 'presales_active': return 2;
                            case 'quoting': return 3;
                            case 'won': case 'lost': case 'converted': case 'cancelled': return 4;
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
                                {step.value === "final" && (opp.status === "won" || opp.status === "lost" || opp.status === "converted" || opp.status === "cancelled")
                                    ? currentStatus.label
                                    : step.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {isTerminal && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                    此商機目前為「{currentStatus.label}」，基本資料已鎖定為唯讀。
                    {project?.status === "new" ? " 待建期間仍可建立並確認新版報價；專案啟用後請改走 CR。" : ""}
                </div>
            )}

            {/* Opp Info Card */}
            <div className="bg-card border border-border/50 rounded-xl shadow-sm p-6">
                <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                    <div>
                        <div className="flex items-center space-x-3 mb-2">
                            <h2 className="text-2xl font-bold">{opp.title}</h2>
                            {/* Status badge with dropdown */}
                            <div className="relative">
                                {!hasRole("business") ? (
                                    <>
                                        <button
                                            onClick={() => !isTerminal && setShowStatusDropdown(!showStatusDropdown)}
                                            disabled={isTerminal}
                                            className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 hover:opacity-80 transition-opacity ${currentStatus.color}`}
                                        >
                                            {currentStatus.label}
                                            <ChevronDown className="w-3 h-3" />
                                        </button>
                                        {showStatusDropdown && !isTerminal && (
                                            <div className="absolute top-full mt-1 left-0 bg-card border border-border rounded-lg shadow-lg z-10 min-w-[140px] py-1">
                                                {OPP_STATUSES.filter(s => s.value !== opp.status && !["quoting", "won", "converted"].includes(s.value)).map(s => (
                                                    <button
                                                        key={s.value}
                                                        onClick={() => {
                                                            const reason = s.value === "cancelled"
                                                                ? window.prompt("請輸入取消原因")?.trim()
                                                                : undefined;
                                                            if (s.value === "cancelled" && !reason) return;
                                                            updateStatusMutation.mutate({ id, status: s.value, reason });
                                                        }}
                                                        className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors ${s.color.replace('border-', '')} rounded-none first:rounded-t-md last:rounded-b-md`}
                                                    >
                                                        {s.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${currentStatus.color}`}>{currentStatus.label}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center text-muted-foreground">
                            <Building2 className="w-4 h-4 mr-2" />
                            <span>{opp.customerName}</span>
                        </div>
                    </div>
                    {/* 依報價與轉案階段顯示單一主要操作 */}
                    <div className="flex items-center gap-2">
                        {latestDraftQuote && canManageQuotes ? (
                            <button type="button" onClick={() => submitQuoteMutation.mutate({ quoteId: latestDraftQuote.id })} disabled={submitQuoteMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium shadow-sm disabled:opacity-50">
                                <FileText className="w-4 h-4" />送出報價 V{latestDraftQuote.version}
                            </button>
                        ) : latestSubmittedQuote && canConfirmQuotes ? (
                            <button type="button" onClick={() => openQuoteConfirmation(latestSubmittedQuote.id)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm">
                                <Check className="w-4 h-4" />確認客戶接受
                            </button>
                        ) : project ? (
                            <button
                                onClick={() => { window.location.href = `/service-requests/${project.id}`; }}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
                            >
                                <Briefcase className="w-4 h-4" />
                                {project.status === "new" ? "前往待建專案" : "查看專案"}
                            </button>
                        ) : acceptedQuote && canConfirmQuotes ? (
                            <button type="button" onClick={() => openQuoteConfirmation(acceptedQuote.id)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium shadow-sm">
                                <Briefcase className="w-4 h-4" />完成待建專案
                            </button>
                        ) : canManageQuotes ? (
                            <button type="button" onClick={openNewQuoteForm} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium shadow-sm">
                                <Plus className="w-4 h-4" />新增報價版本
                            </button>
                        ) : null}
                        {canCreateExceptionProject && (
                            <button type="button" onClick={openExceptionProject} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">
                                例外成立待建專案
                            </button>
                        )}
                        {canDelete && !isTerminal && (
                            <button
                                onClick={() => {
                                    if (confirm("確定要刪除此商機嗎？此操作無法復原。")) {
                                        deleteOpportunityMutation.mutate({ id });
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2 border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium shadow-sm"
                            >
                                刪除商機
                            </button>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-6 border-t border-border/50">
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">商機代號</span>
                        <p className="font-mono font-semibold">{(opp as any).opportunityCode || `#${opp.id}`}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">商機類型</span>
                        {(isBusinessOwner || hasRole("admin") || hasRole("manager") || hasRole("presales")) && !isTerminal ? (
                            <select
                                value={(opp as any).opportunityType || (Number(opp.estimatedValue || 0) > 0 ? "revenue" : "presales")}
                                onChange={(event) => updateOpportunityTypeMutation.mutate({ id, opportunityType: event.target.value as "revenue" | "presales" })}
                                disabled={updateOpportunityTypeMutation.isPending}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold"
                            >
                                {OPP_TYPES.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
                        ) : (
                            <p className="font-semibold">{OPP_TYPES.find((item) => item.value === ((opp as any).opportunityType || "revenue"))?.label || "營收型商機"}</p>
                        )}
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-muted-foreground">預估金額</span>
                            {(isBusinessOwner || hasRole("admin") || hasRole("manager") || hasRole("presales")) && !isTerminal && (
                                <button
                                    onClick={() => {
                                        setEditedEstimatedValue(opp.estimatedValue.toString());
                                        setEstimatedValueError("");
                                        setShowEditEstimatedValueModal(true);
                                    }}
                                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                    編輯
                                </button>
                            )}
                        </div>
                        <p className="font-semibold text-lg text-primary">NT$ {opp.estimatedValue.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">協銷金額</span>
                        <p className="font-semibold">NT$ {Number((opp as any).presalesAmount || 0).toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">目前報價金額</span>
                        <p className="font-semibold">NT$ {Number((opp as any).quotedAmount || 0).toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">最終成交金額</span>
                        <p className="font-semibold text-green-700">NT$ {Number((opp as any).finalDealAmount || 0).toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-muted-foreground">商機成功率</span>
                            {canEditProbability && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditedProbability(((opp as any).probability ?? 0) as OpportunityProbabilityValue);
                                        setEditedProbabilityNote((opp as any).probabilityNote || "");
                                        setProbabilityError("");
                                        setShowEditProbabilityModal(true);
                                    }}
                                    className="text-xs font-medium text-primary hover:text-primary/80"
                                >編輯</button>
                            )}
                        </div>
                        <p className="font-semibold text-primary">{(opp as any).probability ?? 0}%</p>
                        <p className="text-xs text-muted-foreground">
                            {OPPORTUNITY_PROBABILITY_OPTIONS.find((item) => item.value === ((opp as any).probability ?? 0))?.label || "未定義"}
                        </p>
                        {(opp as any).probabilityNote && <p className="max-w-xs text-xs text-foreground/70">備註：{(opp as any).probabilityNote}</p>}
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground flex items-center"><Calendar className="w-4 h-4 mr-1" />建立日期</span>
                        <p className="font-semibold">{new Date(opp.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-sm text-muted-foreground">業務部門</span>
                        <p className="font-semibold">{(opp as any).salesDepartment || "未填寫"}</p>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-muted-foreground">業務</span>
                            {canEditSalesOwner && !isTerminal && (
                                <button
                                    onClick={() => {
                                        setEditedSalesUserId((opp as any).salesUserId || "");
                                        setEditedSalesRep((opp as any).salesRep || "");
                                        setEditedSalesDepartment((opp as any).salesDepartment || "");
                                        setShowEditSalesModal(true);
                                    }}
                                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                    編輯
                                </button>
                            )}
                        </div>
                        <p className="font-semibold">{(opp as any).salesRep || "未填寫"}</p>
                    </div>
                </div>

                {(opp.productNames?.length > 0 || opp.description || isBusinessOwner) && (
                    <div className="mt-6 pt-6 border-t border-border/50 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {opp.productNames?.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-sm font-medium text-muted-foreground">產品名稱</span>
                                <div className="flex flex-wrap gap-2">
                                    {opp.productNames.map((p: string) => (
                                        <span key={p} className="px-2 py-1 bg-primary/10 text-primary text-xs font-bold rounded-md border border-primary/20">
                                            {p}
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-3 space-y-2">
                                    {(productApprovals || []).map((approval: any) => (
                                        <div key={approval.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-2">
                                            <div>
                                                <div className="text-sm font-semibold">{approval.productName}</div>
                                                <div className="font-mono text-[10px] text-muted-foreground">{approval.productCode}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${approval.status === "approved" ? "bg-emerald-100 text-emerald-700" : approval.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{approval.status === "approved" ? "已核准" : approval.status === "rejected" ? "已拒絕" : approval.status === "not_required" ? "不需核准" : "待核准"}</span>
                                                {canManageQuotes && <select value={approval.status} onChange={(event) => {
                                                    const status = event.target.value as "pending" | "approved" | "rejected" | "not_required";
                                                    const reason = status === "rejected" ? window.prompt("請輸入拒絕原因") || "" : "";
                                                    if (status === "rejected" && !reason.trim()) return;
                                                    reviewProductApprovalMutation.mutate({ id: approval.id, status, reason: reason || undefined });
                                                }} className="rounded border bg-background px-2 py-1 text-xs"><option value="pending">待核准</option><option value="approved">核准</option><option value="rejected">拒絕</option><option value="not_required">不需核准</option></select>}
                                            </div>
                                            {approval.reason && <div className="w-full text-xs text-muted-foreground">原因：{approval.reason}</div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="space-y-2 md:col-span-2">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-muted-foreground">商機描述</span>
                                {isBusinessOwner && !isTerminal && (
                                    <button
                                        onClick={() => {
                                            setEditedDescription(opp.description || "");
                                            setDescriptionError("");
                                            setShowEditDescriptionModal(true);
                                        }}
                                        className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                    >
                                        編輯描述
                                    </button>
                                )}
                            </div>
                            <div className="bg-muted/30 p-4 rounded-xl border border-border/50 text-sm leading-relaxed whitespace-pre-wrap min-h-[120px]">
                                {opp.description ? opp.description : <span className="text-muted-foreground italic">尚未填寫商機描述</span>}
                            </div>
                        </div>
                    </div>
                )}

                {/* 自訂欄位表格展示 */}
                <div className="flex justify-between items-center pt-6 mt-6 border-t border-border/50">
                    <h3 className="font-semibold text-lg flex items-center">
                        <FileText className="w-5 h-5 mr-2 text-primary" /> 商機自訂欄位
                    </h3>
                    {!isTerminal && (hasRole("admin") || hasRole("manager") || user?.id === opp.ownerId) && !hasRole("business") && (
                        <button
                            onClick={() => {
                                setShowCustomFieldsModal(true);
                                setEditingCustomFields(opp.customFields?.map((c: any) => ({ fieldId: c.fieldId, value: c.value })) || []);
                            }}
                            className="text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 flex items-center rounded-lg transition-colors"
                        >
                            編輯欄位
                        </button>
                    )}
                </div>

                {oppFields.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                        {oppFields.map((f: any) => (
                            <div key={f.id} className={`space-y-1.5 ${f.fieldType === 'textarea' ? 'md:col-span-3' : ''}`}>
                                <span className="text-sm font-medium text-muted-foreground">{f.name}</span>
                                <div className={`font-semibold text-sm ${f.fieldType === 'textarea' ? 'whitespace-pre-wrap bg-muted/40 p-4 rounded-xl border border-border/50 text-base leading-relaxed' : 'text-base'}`}>
                                    {getFieldValue(f.id) !== "未填寫" ? (
                                        f.fieldType === "switch" ? (getFieldValue(f.id) === "true" ? "✅ 啟用" : "❌ 關閉") : getFieldValue(f.id)
                                    ) : (
                                        <span className="text-muted-foreground italic font-normal text-xs">未填寫</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center p-6 border border-dashed rounded-lg bg-background text-sm text-muted-foreground mt-4">尚無設定自訂欄位系統</div>
                )}
            </div>

            <div id="quote-section" className="scroll-mt-4 rounded-xl border border-border/50 bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 p-4">
                    <div>
                        <h3 className="font-bold flex items-center"><FileText className="mr-2 h-5 w-5 text-primary" />報價版本</h3>
                        <p className="mt-1 text-xs text-muted-foreground">每次報價建立獨立版本，保留協銷內容與歷次議價依據。</p>
                    </div>
                    {canManageQuotes && (
                        <button
                            type="button"
                            onClick={() => {
                                if (showQuoteForm) resetQuoteForm();
                                else openNewQuoteForm();
                            }}
                            className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                            <Plus className="mr-1 h-4 w-4" />新增報價版本
                        </button>
                    )}
                </div>

                {showQuoteForm && canManageQuotes && (
                    <div className="grid gap-3 border-b border-border/50 bg-muted/20 p-4 md:grid-cols-2">
                        <label className="space-y-1 text-sm">
                            <span className="font-medium">報價名稱 *</span>
                            <input value={quoteName} onChange={(event) => setQuoteName(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" />
                        </label>
                        <label className="space-y-1 text-sm">
                            <span className="font-medium">報價金額 *</span>
                            <input type="number" min="0" value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" />
                        </label>
                        <label className="space-y-1 text-sm">
                            <span className="font-medium">產品（以逗號分隔）</span>
                            <input value={quoteProducts} onChange={(event) => setQuoteProducts(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" />
                        </label>
                        <label className="space-y-1 text-sm">
                            <span className="font-medium">預計成交日</span>
                            <input type="date" value={quoteExpectedCloseDate} onChange={(event) => setQuoteExpectedCloseDate(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2" />
                        </label>
                        <label className="space-y-1 text-sm md:col-span-2">
                            <span className="font-medium">報價說明</span>
                            <textarea value={quoteDescription} onChange={(event) => setQuoteDescription(event.target.value)} className="min-h-20 w-full rounded-lg border bg-background px-3 py-2" />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={quoteTaxIncluded} onChange={(event) => setQuoteTaxIncluded(event.target.checked)} />
                            含稅
                        </label>
                        <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={resetQuoteForm} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">取消</button>
                            <button
                                type="button"
                                disabled={createQuoteMutation.isPending}
                                onClick={() => {
                                    const amount = Number(quoteAmount);
                                    if (!quoteName.trim()) return setQuoteError("請輸入報價名稱");
                                    if (!Number.isFinite(amount) || amount < 0) return setQuoteError("請輸入有效的報價金額");
                                    createQuoteMutation.mutate({
                                        opportunityId: id,
                                        name: quoteName.trim(),
                                        description: quoteDescription.trim() || undefined,
                                        products: quoteProducts.split(/[,，、]/).map((value) => value.trim()).filter(Boolean),
                                        amount,
                                        currency: "TWD",
                                        taxIncluded: quoteTaxIncluded,
                                        expectedCloseDate: quoteExpectedCloseDate ? new Date(`${quoteExpectedCloseDate}T00:00:00+08:00`) : undefined
                                    });
                                }}
                                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                            >
                                建立版本
                            </button>
                        </div>
                        {quoteError && <p className="text-sm text-red-600 md:col-span-2">{quoteError}</p>}
                    </div>
                )}

                <div className="divide-y divide-border/50">
                    {(quotes || []).map((quote: any) => (
                        <div key={quote.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-xs text-muted-foreground">{quote.quoteCode}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${quote.status === "accepted" ? "border-green-200 bg-green-100 text-green-800" : quote.status === "void" ? "border-red-200 bg-red-100 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                                        {QUOTE_STATUS_LABELS[quote.status] || quote.status}
                                    </span>
                                </div>
                                <p className="mt-1 font-semibold">V{quote.version} · {quote.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {quote.currency} {Number(quote.amount || 0).toLocaleString()} · {quote.taxIncluded ? "含稅" : "未稅"}
                                    {quote.expectedCloseDate ? ` · 預計成交 ${new Date(quote.expectedCloseDate).toLocaleDateString()}` : ""}
                                </p>
                                {quote.status === "accepted" && quote.acceptedAt && (
                                    <p className="mt-1 text-xs text-green-700">客戶確認日：{new Date(quote.acceptedAt).toLocaleDateString()}{quote.acceptanceNote ? ` · ${quote.acceptanceNote}` : ""}</p>
                                )}
                            </div>
                            {quote.status !== "void" && (canManageQuotes || canConfirmQuotes) && (
                                <div className="flex flex-wrap gap-2">
                                    {canManageQuotes && quote.status === "draft" && (
                                        <button type="button" onClick={() => submitQuoteMutation.mutate({ quoteId: quote.id })} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">送出</button>
                                    )}
                                    {canConfirmQuotes && quote.status === "submitted" && (
                                        <button type="button" onClick={() => openQuoteConfirmation(quote.id)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">確認客戶接受</button>
                                    )}
                                    {canManageQuotes && ["draft", "submitted"].includes(quote.status) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const reason = window.prompt("請輸入報價作廢原因")?.trim();
                                                if (reason) voidQuoteMutation.mutate({ quoteId: quote.id, reason });
                                            }}
                                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                        >作廢</button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {(!quotes || quotes.length === 0) && <div className="p-6 text-center text-sm text-muted-foreground">尚未建立報價版本</div>}
                </div>
            </div>

            <details className="rounded-xl border border-border/50 bg-card shadow-sm">
                <summary className="cursor-pointer list-none p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="font-bold flex items-center"><Clock className="mr-2 h-5 w-5 text-primary" />商機操作歷程</h3>
                            <p className="mt-1 text-xs text-muted-foreground">永久保存重要商務異動；安全 Audit 仍獨立記錄登入、拒絕與匯出事件。</p>
                        </div>
                        <button
                            type="button"
                            onClick={(event) => { event.preventDefault(); void refetchHistory(); }}
                            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                        >{isFetchingHistory ? "更新中..." : "重新整理"}</button>
                    </div>
                </summary>
                <div className="divide-y divide-border/50 border-t border-border/50">
                    {(historyEvents || []).map((event: any) => (
                        <div key={event.id} className="grid gap-1 p-4 text-sm md:grid-cols-[180px_1fr_auto] md:items-center">
                            <span className="text-xs text-muted-foreground">{new Date(event.occurredAt).toLocaleString()}</span>
                            <div>
                                <p className="font-medium">{HISTORY_ACTION_LABELS[event.action] || event.action}</p>
                                {event.reason && <p className="mt-1 text-xs text-muted-foreground">原因：{event.reason}</p>}
                            </div>
                            <span className="text-xs text-muted-foreground">{event.actorRole || event.source}</span>
                        </div>
                    ))}
                    {(!historyEvents || historyEvents.length === 0) && <div className="p-6 text-center text-sm text-muted-foreground">尚無操作歷程</div>}
                </div>
            </details>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 協銷指派 */}
                <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-border/50 bg-muted/30 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold flex items-center"><Briefcase className="w-5 h-5 mr-2 text-primary" />協銷指派</h3>
                            <p className="mt-1 text-[11px] text-muted-foreground">共用時薪：NT$ {Number((opp as any).presalesHourlyRate ?? 1000).toLocaleString()}</p>
                        </div>
                        {!hasRole("business") && (
                            <button onClick={() => { if (!isTerminal) { setAssignHourlyRate(String((opp as any).presalesHourlyRate ?? 1000)); setShowAssignModal(true); setAssignError(""); } }}
                                disabled={isTerminal}
                                className="text-xs font-medium text-primary hover:text-primary/80 flex items-center px-2 py-1 rounded hover:bg-primary/10 transition-colors disabled:opacity-50">
                                <Plus className="w-3 h-3 mr-1" /> 新增指派
                            </button>
                        )}
                    </div>
                    <div className="p-4 flex-1">
                        {assignments && assignments.length > 0 ? (
                            <div className="space-y-3">
                                {assignments.map((a: any) => (
                                    <div key={a.id} className="p-3 border rounded-lg flex justify-between items-center hover:bg-muted/50 transition-colors">
                                        <div>
                                            <p className="font-medium text-sm">{getTechName(a.techId)}</p>
                                            <p className="text-xs text-muted-foreground">預估時數: {a.estimatedHours} 小時</p>
                                            <p className="text-xs text-muted-foreground">系統金額: NT$ {(Number(a.estimatedHours || 0) * Number((opp as any).presalesHourlyRate ?? 1000)).toLocaleString()}</p>
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
                        {canEditOpportunityMembers && (
                            <button onClick={() => { if (!isTerminal) { setShowMemberModal(true); setMemberError(""); } }}
                                disabled={isTerminal}
                                className="text-xs font-medium text-primary hover:text-primary/80 flex items-center px-2 py-1 rounded hover:bg-primary/10 transition-colors disabled:opacity-50">
                                <UserPlus className="w-3 h-3 mr-1" /> 新增成員
                            </button>
                        )}
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
                                            {canEditOpportunityMembers && m.memberRole !== "owner" && (
                                                <button
                                                    onClick={() => !isTerminal && removeMemberMutation.mutate({ memberId: m.id })}
                                                    disabled={isTerminal}
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
                        {canReportTime && (
                            <button onClick={() => { if (!isTerminal) { setShowTimesheetModal(true); setTsError(""); } }}
                                disabled={isTerminal}
                                className="text-xs font-medium text-primary hover:text-primary/80 flex items-center px-2 py-1 rounded hover:bg-primary/10 transition-colors disabled:opacity-50">
                                <Plus className="w-3 h-3 mr-1" /> 回報工時
                            </button>
                        )}
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
                                {canReportTime && (
                                    <button onClick={() => { if (!isTerminal) { setShowTimesheetModal(true); setTsError(""); } }}
                                        disabled={isTerminal}
                                        className="mt-3 text-xs text-primary hover:underline flex items-center disabled:opacity-50 disabled:hover:no-underline">
                                        <Plus className="w-3 h-3 mr-1" /> 立即回報工時
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-1 gap-6 mb-8">
                <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden p-6">
                    <div className="mb-5">
                        <h3 className="mb-3 flex items-center text-base font-semibold">
                            <Paperclip className="mr-2 h-4 w-4 text-primary" />
                            商機附件
                        </h3>
                        {!isTerminal ? (
                            <div
                                onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
                                onDragLeave={() => setIsDraggingFile(false)}
                                onDrop={handleFileDrop}
                                onClick={() => !isUploadingFile && document.getElementById("opportunity-file-input")?.click()}
                                className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${isDraggingFile ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"} ${isUploadingFile ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                                <Upload className={`mx-auto mb-2 h-7 w-7 ${isDraggingFile ? "text-primary" : "text-muted-foreground/50"}`} />
                                <p className="text-xs text-muted-foreground">{isUploadingFile ? "上傳中..." : "拖曳或點擊上傳商機附件"}</p>
                                <input
                                    id="opportunity-file-input"
                                    type="file"
                                    multiple
                                    className="hidden"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.ppt,.pptx"
                                    disabled={isUploadingFile}
                                    onChange={(event) => void handleFileUpload(event.target.files)}
                                />
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                                此商機已鎖定，不可再上傳附件。
                            </div>
                        )}
                        {opp.attachments && opp.attachments.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {[...(opp.attachments || [])].sort((left: any, right: any) => new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime()).map((attachment: any, index: number) => (
                                    <div key={attachment._id ? String(attachment._id) : `${attachment.fileName}-${index}`} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs">
                                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                                        <a href={attachment.fileUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate font-medium hover:text-primary" title={attachment.fileName}>
                                            {attachment.fileName}
                                        </a>
                                        <span className="whitespace-nowrap text-muted-foreground">{formatSize(attachment.fileSize)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {opp.localFolderPath ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 font-semibold">
                                <FileText className="w-4 h-4 text-primary" />
                                商機專屬本機文件目錄
                            </div>
                            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-sm break-all">
                                {opp.localFolderPath}
                            </div>
                        </div>
                    ) : (
                        <SharePointFilesSection
                            category="商機"
                            sharePointFolderUrl={opp.sharePointFolderUrl}
                            title="商機專屬 SharePoint 文件庫"
                        />
                    )}
                </div>
            </div>

            {/* ====== Modals ====== */}
            {/* 協銷指派 Modal */}
            {showAssignModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><Briefcase className="w-5 h-5 mr-2 text-primary" />新增協銷指派</h2>
                            <button onClick={() => setShowAssignModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
	                        <div className="space-y-4">
	                            <div>
	                                <label className="block text-sm font-medium mb-1">選擇技術員 / 售前人員</label>
	                                <UserSearchPicker
	                                    users={presalesList || []}
	                                    assignmentContext="presales"
	                                    selectedUserId={assignTechId}
	                                    placeholder="搜尋姓名或 Email..."
	                                    onSelect={(selectedUser) => setAssignTechId(selectedUser.id)}
	                                    onClear={() => setAssignTechId("")}
	                                    filterUser={(pickerUser) => {
	                                        return ["presales", "tech", "pm"].includes(pickerUser.role || "");
	                                    }}
	                                />
	                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">預估時數（小時）</label>
                                <input type="number" min="0.5" step="0.5" value={assignHours} onChange={e => setAssignHours(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">本商機協銷時薪</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={assignHourlyRate}
                                    disabled={(opp as any).presalesHourlyRate !== undefined}
                                    onChange={e => setAssignHourlyRate(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">首次指派時保存；同一商機後續所有協銷人員共用此時薪。</p>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><UserPlus className="w-5 h-5 mr-2 text-primary" />新增商機成員</h2>
                            <button onClick={() => setShowMemberModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
	                            <div>
	                                <label className="block text-sm font-medium mb-1">選擇使用者</label>
	                                <UserSearchPicker
	                                    users={allUsers?.items || []}
	                                    assignmentContext="project_member"
	                                    selectedUserId={memberUserId}
	                                    placeholder="搜尋姓名或 Email..."
	                                    onSelect={(selectedUser) => setMemberUserId(selectedUser.id)}
	                                    onClear={() => setMemberUserId("")}
	                                    filterUser={(pickerUser) => memberRole === "owner"
                                            ? !members?.find((m: any) => m.userId === pickerUser.id && m.memberRole === "owner")
                                            : !members?.find((m: any) => m.userId === pickerUser.id)}
	                                />
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

            {/* 編輯業務 Modal */}
            {showEditSalesModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
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
                        <div className="flex justify-end space-x-3">
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

            {/* 編輯商機金額 Modal */}
            {showEditEstimatedValueModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold">輸入商機金額</h2>
                            <button onClick={() => setShowEditEstimatedValueModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">商機金額</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={editedEstimatedValue}
                                    onChange={(e) => setEditedEstimatedValue(e.target.value)}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                            {estimatedValueError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{estimatedValueError}</p>}
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setShowEditEstimatedValueModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button onClick={handleUpdateEstimatedValue} disabled={updateEstimatedValueMutation.isPending}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
                                {updateEstimatedValueMutation.isPending ? "儲存中..." : "儲存金額"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 編輯商機成功率 Modal */}
            {showEditProbabilityModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">編輯商機成功率</h2>
                            <button onClick={() => setShowEditProbabilityModal(false)} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium">成功率
                                <select
                                    value={editedProbability}
                                    onChange={(event) => setEditedProbability(Number(event.target.value) as OpportunityProbabilityValue)}
                                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                >
                                    {OPPORTUNITY_PROBABILITY_OPTIONS.map((item) => (
                                        <option key={item.value} value={item.value}>{item.value}% — {item.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block text-sm font-medium">成功率備註
                                <textarea
                                    value={editedProbabilityNote}
                                    onChange={(event) => setEditedProbabilityNote(event.target.value)}
                                    rows={4}
                                    maxLength={2000}
                                    placeholder="說明目前機率的判斷依據，例如預算、決策進度或客戶回覆"
                                    className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                />
                            </label>
                            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                                成功率用於 Pipeline 預測。設定為 100% 不會自動建立專案，仍須確認客戶接受報價或執行例外轉案。
                            </p>
                            {probabilityError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{probabilityError}</p>}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowEditProbabilityModal(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">取消</button>
                            <button onClick={handleUpdateProbability} disabled={updateProbabilityMutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                                {updateProbabilityMutation.isPending ? "儲存中..." : "儲存成功率"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 編輯描述 Modal */}
            {showEditDescriptionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><FileText className="w-5 h-5 mr-2 text-primary" />編輯商機描述</h2>
                            <button onClick={() => setShowEditDescriptionModal(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">商機描述</label>
                                <textarea
                                    value={editedDescription}
                                    onChange={(e) => setEditedDescription(e.target.value)}
                                    rows={8}
                                    className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                                />
                            </div>
                            {descriptionError && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{descriptionError}</p>}
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setShowEditDescriptionModal(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button
                                onClick={handleUpdateDescription}
                                disabled={updateDescriptionMutation.isPending}
                                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                            >
                                {updateDescriptionMutation.isPending ? "儲存中..." : "儲存描述"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 回報工時 Modal */}
            {showTimesheetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
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

            {/* 客戶接受報價確認 */}
            {!!confirmingQuoteId && confirmingQuote && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-6 shadow-xl">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center"><Check className="w-5 h-5 mr-2 text-green-600" />確認客戶接受報價</h2>
                            <button onClick={() => setConfirmingQuoteId("")} className="p-1 rounded-full hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                            <p className="font-semibold">V{confirmingQuote.version} · {confirmingQuote.name}</p>
                            <p className="mt-1">{confirmingQuote.currency} {Number(confirmingQuote.amount || 0).toLocaleString()}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">確認後會自動產生或更新待建專案，並以本版本作為合約與最終金額依據。</p>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium">客戶確認日期
                                <input type="date" value={quoteAcceptedAt} onChange={(event) => setQuoteAcceptedAt(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
                            </label>
                            <label className="block text-sm font-medium">確認備註
                                <textarea value={quoteAcceptanceNote} onChange={(event) => setQuoteAcceptanceNote(event.target.value)} placeholder="例：客戶以 Email 確認" className="mt-1 min-h-20 w-full rounded-lg border bg-background px-3 py-2" />
                            </label>
                            {requiresReplacementReason && (
                                <label className="block text-sm font-medium">更換報價原因 *
                                    <textarea value={quoteReplacementReason} onChange={(event) => setQuoteReplacementReason(event.target.value)} placeholder="待建專案已綁定其他報價，請說明更換原因" className="mt-1 min-h-20 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2" />
                                </label>
                            )}
                            {quoteConfirmationError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{quoteConfirmationError}</p>}
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setConfirmingQuoteId("")} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">取消</button>
                            <button
                                onClick={() => {
                                    if (!quoteAcceptedAt) return setQuoteConfirmationError("請選擇客戶確認日期");
                                    if (requiresReplacementReason && !quoteReplacementReason.trim()) return setQuoteConfirmationError("請填寫更換報價原因");
                                    confirmQuoteMutation.mutate({
                                        quoteId: confirmingQuoteId,
                                        acceptedAt: new Date(`${quoteAcceptedAt}T00:00:00+08:00`),
                                        acceptanceNote: quoteAcceptanceNote.trim() || undefined,
                                        replacementReason: requiresReplacementReason ? quoteReplacementReason.trim() : undefined
                                    });
                                }}
                                disabled={confirmQuoteMutation.isPending}
                                className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                                {confirmQuoteMutation.isPending ? "確認中..." : "確認並產生待建專案"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 無確認報價的例外轉案 */}
            {showExceptionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md space-y-5 rounded-xl border border-amber-300 bg-card p-6 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-amber-800">例外成立待建專案</h2>
                            <button onClick={() => setShowExceptionModal(false)} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
                        </div>
                        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">此商機沒有客戶已確認的報價。例外轉案會留下操作者、時間、金額與原因。</p>
                        <label className="block text-sm font-medium">確認金額 *
                            <input type="number" min="0" value={exceptionAmount} onChange={(event) => setExceptionAmount(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
                        </label>
                        <label className="block text-sm font-medium">例外原因 *
                            <textarea value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border bg-background px-3 py-2" />
                        </label>
                        {exceptionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{exceptionError}</p>}
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowExceptionModal(false)} className="rounded-lg border px-4 py-2 text-sm">取消</button>
                            <button onClick={handleCreateExceptionProject} disabled={createSRMutation.isPending} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                                {createSRMutation.isPending ? "建立中..." : "確認例外轉案"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCustomFieldsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 shadow-2xl backdrop-blur-sm transition-opacity animate-in fade-in">
                    <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col space-y-5 rounded-xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95">
                        <div className="flex justify-between items-center border-b border-border/50 pb-3">
                            <h2 className="text-xl font-bold flex items-center tracking-tight"><FileText className="w-5 h-5 mr-2 text-primary" />編輯商機細節欄位</h2>
                            <button onClick={() => setShowCustomFieldsModal(false)} className="p-1.5 rounded-full hover:bg-muted bg-muted/50 transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>

                        <div className="space-y-5 flex-1 overflow-y-auto pr-2">
                            {oppFields.length === 0 ? (
                                <p className="text-sm text-muted-foreground p-4 text-center">後台設定中尚未建立對應商機的可用欄位。</p>
                            ) : (
                                oppFields.map((field: any) => {
                                    const currentValue = editingCustomFields.find(f => f.fieldId === field.id)?.value || "";
                                    const handleFieldChange = (val: string) => {
                                        const newFields = [...editingCustomFields];
                                        const exist = newFields.find(f => f.fieldId === field.id);
                                        if (exist) { exist.value = val; } else { newFields.push({ fieldId: field.id, value: val }); }
                                        setEditingCustomFields(newFields);
                                    };

                                    return (
                                        <div key={field.id} className={`space-y-1.5 ${field.fieldType === 'textarea' ? 'col-span-full' : ''}`}>
                                            <label className="block text-sm font-semibold text-foreground/90">
                                                {field.name} {field.isRequired && <span className="text-red-500">*</span>}
                                            </label>

                                            {field.fieldType === "textarea" ? (
                                                <textarea
                                                    rows={4}
                                                    value={currentValue}
                                                    onChange={e => handleFieldChange(e.target.value)}
                                                    className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                                                />
                                            ) : field.fieldType === "switch" ? (
                                                <select
                                                    value={currentValue}
                                                    onChange={e => handleFieldChange(e.target.value)}
                                                    className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                >
                                                    <option value="">未設定</option>
                                                    <option value="true">啟用</option>
                                                    <option value="false">關閉</option>
                                                </select>
                                            ) : field.fieldType === "select" && field.options ? (
                                                <select
                                                    value={currentValue}
                                                    onChange={e => handleFieldChange(e.target.value)}
                                                    className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                >
                                                    <option value="">請選擇...</option>
                                                    {field.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            ) : (
                                                <input
                                                    type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
                                                    value={currentValue}
                                                    onChange={e => handleFieldChange(e.target.value)}
                                                    className="w-full border border-input rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                />
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                            <button onClick={() => setShowCustomFieldsModal(false)} className="px-5 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors">取消</button>
                            <button
                                onClick={() => updateCustomFieldsMutation.mutate({ id, customFields: editingCustomFields })}
                                disabled={updateCustomFieldsMutation.isPending}
                                className="px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                            >
                                儲存欄位變更
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
