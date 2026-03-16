import { useState } from "react";
import { trpc } from "../lib/trpc";

import { Clock, Plus, Trash2, AlertCircle } from "lucide-react";

export function PresalesTimesheetsPage() {
    const utils = trpc.useContext();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [selectedOppId, setSelectedOppId] = useState<number | "">("");
    const [workDate, setWorkDate] = useState<string>(new Date().toISOString().split("T")[0]);
    const [hours, setHours] = useState<number | "">("");
    const [description, setDescription] = useState("");

    // Fetches
    const { data: assignments } = trpc.opportunities.getMyPresalesAssignments.useQuery();
    const { data: timesheets, isLoading: loadingTimesheets } = trpc.opportunities.getMyPresalesTimesheets.useQuery();

    // Mutations
    const logTime = trpc.opportunities.logPresalesTime.useMutation({
        onSuccess: () => {
            utils.opportunities.getMyPresalesTimesheets.invalidate();
            setSelectedOppId("");
            setHours("");
            setDescription("");
        }
    });

    const deleteTime = trpc.opportunities.deletePresalesTimesheet.useMutation({
        onSuccess: () => {
            utils.opportunities.getMyPresalesTimesheets.invalidate();
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOppId || !hours || !workDate || !description) return;

        setIsSubmitting(true);
        try {
            await logTime.mutateAsync({
                opportunityId: Number(selectedOppId),
                workDate: new Date(workDate),
                hours: Number(hours),
                description,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60 flex items-center gap-2">
                        <Clock className="w-8 h-8 text-primary" />
                        協銷工時填寫
                    </h2>
                    <p className="text-muted-foreground mt-1">回報您在協銷商機上花費的時間</p>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Form Section */}
                <div className="md:col-span-1 space-y-4">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" />
                            新增工時紀錄
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">對應商機</label>
                                <select
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={selectedOppId}
                                    onChange={(e) => setSelectedOppId(e.target.value === "" ? "" : Number(e.target.value))}
                                    required
                                >
                                    <option value="">-- 選擇您被指派的商機 --</option>
                                    {assignments?.map((a: any) => (
                                        <option key={a.id} value={a.opportunityId}>
                                            {a.opportunityTitle} ({a.customerName})
                                        </option>
                                    ))}
                                </select>
                                {assignments?.length === 0 && (
                                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> 找不到指派給您的協銷商機
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">工作日期</label>
                                <input
                                    type="date"
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={workDate}
                                    onChange={(e) => setWorkDate(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">花費時數</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    max="24"
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    value={hours}
                                    onChange={(e) => setHours(e.target.value === "" ? "" : Number(e.target.value))}
                                    placeholder="例: 2.5"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">工作描述</label>
                                <textarea
                                    className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm min-h-[100px] focus:ring-1 focus:ring-primary outline-none"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="例: 客戶需求訪談與架構規劃..."
                                    required
                                ></textarea>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting || !selectedOppId}
                                className="w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? "送出中..." : "儲存工時"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* History Section */}
                <div className="md:col-span-2 space-y-4">
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm min-h-full">
                        <h3 className="text-xl font-bold mb-4">我的填報紀錄</h3>

                        {loadingTimesheets ? (
                            <div className="animate-pulse space-y-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-20 bg-muted rounded-md w-full"></div>
                                ))}
                            </div>
                        ) : timesheets?.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground bg-muted/20 border border-dashed border-border rounded-xl">
                                <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>您目前沒有任何協銷工時紀錄</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {timesheets?.map((t: any) => (
                                    <div key={t.id} className="p-4 border border-border rounded-lg bg-background hover:border-primary/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-semibold text-primary">{t.opportunityTitle}</span>
                                                <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{t.customerName}</span>
                                            </div>
                                            <p className="text-sm">{t.description}</p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {t.hours} 小時</span>
                                                <span className="flex items-center gap-1">{new Date(t.workDate).toISOString().split('T')[0].replace(/-/g, '/')}</span>
                                                <span>約 NT$ {t.costAmount?.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => deleteTime.mutate({ id: t.id })}
                                                className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
                                                title="刪除"
                                                disabled={deleteTime.isPending}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
