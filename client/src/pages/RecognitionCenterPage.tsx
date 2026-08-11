import { useEffect, useMemo, useState } from "react";
import { Download, History, Lock, RefreshCw, RotateCcw, Save, Unlock } from "lucide-react";
import toast from "react-hot-toast";
import { trpc } from "../lib/trpc";
import { exportRowsToXlsx, formatExportDate, makeXlsxFileName } from "../lib/exportXlsx";
import { useCurrentUser } from "../lib/useCurrentUser";

type SettlementType = "project" | "presales";
type SettlementView = "closed" | "recognized";

const currentMonth = () => new Date().toISOString().slice(0, 7);
const nextMonth = (month: string) => {
    const [year, value] = month.split("-").map(Number);
    return new Date(year, value, 1).toISOString().slice(0, 7);
};

const statusLabels: Record<string, string> = {
    pending: "待認列",
    recognized: "已認列",
    not_recognized: "不認列",
    reversed: "已沖銷"
};

export function RecognitionCenterPage() {
    const utils = trpc.useContext();
    const { hasRole } = useCurrentUser();
    const [month, setMonth] = useState(currentMonth());
    const [type, setType] = useState<SettlementType>("project");
    const [view, setView] = useState<SettlementView>("closed");
    const [drafts, setDrafts] = useState<Record<string, { acceptedHours: string; recognitionRate: string; recognizedAmount: string; reason: string }>>({});
    const [historyId, setHistoryId] = useState<string | null>(null);

    const query = trpc.recognition.getSettlement.useQuery({ month, type, view });
    const history = trpc.recognition.getHistory.useQuery({ id: historyId || "" }, { enabled: !!historyId });

    useEffect(() => {
        if (!query.data) return;
        setDrafts(Object.fromEntries(query.data.rows.map((row: any) => [row.id, {
            acceptedHours: String(row.acceptedHours ?? 0),
            recognitionRate: String(row.recognitionRate ?? 0),
            recognizedAmount: String(row.recognizedAmount ?? 0),
            reason: row.reason || ""
        }])));
    }, [query.data]);

    const invalidate = async () => {
        await utils.recognition.getSettlement.invalidate();
        if (historyId) await utils.recognition.getHistory.invalidate({ id: historyId });
    };

    const updateRecord = trpc.recognition.updateRecord.useMutation({
        onSuccess: () => { toast.success("認列資料已更新"); invalidate(); },
        onError: (error) => toast.error(error.message)
    });
    const confirmRecord = trpc.recognition.confirmRecord.useMutation({
        onSuccess: () => { toast.success("已完成正式認列"); invalidate(); },
        onError: (error) => toast.error(error.message)
    });
    const markNotRecognized = trpc.recognition.markNotRecognized.useMutation({
        onSuccess: () => { toast.success("已標記為不認列"); invalidate(); },
        onError: (error) => toast.error(error.message)
    });
    const createCorrection = trpc.recognition.createCorrection.useMutation({
        onSuccess: () => { toast.success("次月調整／沖銷已建立"); invalidate(); },
        onError: (error) => toast.error(error.message)
    });
    const lockMonth = trpc.recognition.lockMonth.useMutation({
        onSuccess: (result) => { toast.success(`月份已鎖帳（版本 ${result.version}）`); invalidate(); },
        onError: (error) => toast.error(error.message)
    });
    const unlockMonth = trpc.recognition.unlockMonth.useMutation({
        onSuccess: () => { toast.success("月份已解除鎖帳"); invalidate(); },
        onError: (error) => toast.error(error.message)
    });

    const rows = query.data?.rows || [];
    const totals = query.data?.totals;
    const amountLabel = type === "project" ? "專案認列金額" : "協銷認列金額";
    const exportRows = useMemo(() => rows.map((row: any) => ({
        "結案月份": row.closureMonth,
        "認列月份": row.recognitionMonth || "",
        "案件代號": row.sourceCode,
        "案件": row.sourceTitle,
        "公司": row.customerName,
        "業務": row.salesName,
        "業務部門": row.salesDepartment,
        "PM": row.pmName,
        "Owner": row.ownerName,
        "協銷人員": row.participantName,
        "協銷人員部門": row.participantDepartment,
        "原始時數": row.originalHours,
        "接受時數": row.acceptedHours,
        "原始時薪": row.originalRate,
        "認列時薪": row.recognitionRate,
        "系統金額": row.systemAmount,
        "最終認列金額": row.status === "not_recognized" ? 0 : row.recognizedAmount,
        "調整／沖銷": row.amountDelta,
        "狀態": statusLabels[row.status] || row.status,
        "原因": row.reason
    })), [rows]);

    const saveRow = (row: any) => {
        const draft = drafts[row.id];
        if (!draft) return;
        updateRecord.mutate({
            id: row.id,
            acceptedHours: type === "presales" ? Number(draft.acceptedHours) : undefined,
            recognitionRate: type === "presales" ? Number(draft.recognitionRate) : undefined,
            recognizedAmount: type === "project" ? Number(draft.recognizedAmount) : undefined,
            reason: draft.reason || undefined
        });
    };

    const notRecognize = (row: any) => {
        const reason = window.prompt("請輸入不認列原因");
        if (!reason?.trim()) return;
        markNotRecognized.mutate({ id: row.id, recognitionMonth: month, reason: reason.trim() });
    };

    const correct = (row: any, mode: "adjustment" | "reversal") => {
        const targetMonth = window.prompt("請輸入調整／沖銷月份（YYYY-MM）", nextMonth(row.recognitionMonth || month));
        if (!targetMonth) return;
        const reason = window.prompt("請輸入調整／沖銷原因");
        if (!reason?.trim()) return;
        if (mode === "reversal") {
            createCorrection.mutate({ id: row.id, targetMonth, mode, reason: reason.trim() });
            return;
        }
        if (type === "presales") {
            const acceptedHours = Number(window.prompt("調整後接受時數", String(row.acceptedHours)));
            const recognitionRate = Number(window.prompt("調整後認列時薪", String(row.recognitionRate)));
            if (!Number.isFinite(acceptedHours) || !Number.isFinite(recognitionRate)) return toast.error("時數與時薪格式錯誤");
            createCorrection.mutate({ id: row.id, targetMonth, mode, acceptedHours, recognitionRate, reason: reason.trim() });
        } else {
            const recognizedAmount = Number(window.prompt("調整後專案認列總額", String(row.recognizedAmount)));
            if (!Number.isFinite(recognizedAmount)) return toast.error("金額格式錯誤");
            createCorrection.mutate({ id: row.id, targetMonth, mode, recognizedAmount, reason: reason.trim() });
        }
    };

    const handleUnlock = () => {
        const reason = window.prompt("請輸入解除鎖帳原因");
        if (!reason?.trim()) return;
        unlockMonth.mutate({ month, type, reason: reason.trim() });
    };

    return (
        <div className="mx-auto max-w-[1600px] space-y-5">
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">認列結算中心</h1>
                    <p className="mt-1 text-sm text-muted-foreground">案件結案後才進入待認列，正式認列月份與結案月份分開管理。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border bg-background px-3 py-2" />
                    <button type="button" onClick={() => query.refetch()} className="rounded-lg border px-3 py-2 text-sm"><RefreshCw className="mr-1 inline h-4 w-4" />重新整理</button>
                    <button type="button" disabled={rows.length === 0} onClick={() => exportRowsToXlsx(exportRows, makeXlsxFileName(type === "project" ? "專案認列結算" : "協銷認列結算", formatExportDate()), type)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"><Download className="mr-1 inline h-4 w-4" />匯出 Excel</button>
                    {view === "recognized" && !query.data?.isLocked && (hasRole("admin") || hasRole("manager")) && <button type="button" onClick={() => lockMonth.mutate({ month, type })} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"><Lock className="mr-1 inline h-4 w-4" />確認鎖帳</button>}
                    {view === "recognized" && query.data?.isLocked && hasRole("admin") && <button type="button" onClick={handleUnlock} className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-700"><Unlock className="mr-1 inline h-4 w-4" />解除鎖帳</button>}
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setType("project")} className={`rounded-lg px-4 py-2 text-sm font-medium ${type === "project" ? "bg-primary text-primary-foreground" : "border bg-card"}`}>專案認列</button>
                <button type="button" onClick={() => setType("presales")} className={`rounded-lg px-4 py-2 text-sm font-medium ${type === "presales" ? "bg-primary text-primary-foreground" : "border bg-card"}`}>協銷認列</button>
                <span className="mx-1 border-l" />
                <button type="button" onClick={() => setView("closed")} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === "closed" ? "bg-sky-600 text-white" : "border bg-card"}`}>本月結案待認列</button>
                <button type="button" onClick={() => setView("recognized")} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === "recognized" ? "bg-emerald-600 text-white" : "border bg-card"}`}>本月正式認列</button>
                {query.data?.isLocked && <span className="self-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">此月份已鎖帳</span>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                    ["案件／人員列數", totals?.itemCount || 0],
                    ["原始時數", totals?.originalHours || 0],
                    ["接受時數", totals?.acceptedHours || 0],
                    ["系統金額", `NT$ ${(totals?.systemAmount || 0).toLocaleString()}`],
                    [amountLabel, `NT$ ${(totals?.recognizedAmount || 0).toLocaleString()}`]
                ].map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4 shadow-sm"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>)}
            </div>

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                {query.isLoading ? <div className="p-12 text-center text-muted-foreground">載入中…</div> : rows.length === 0 ? <div className="p-12 text-center text-muted-foreground">此月份沒有符合條件的認列資料。</div> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-[1450px] w-full text-sm">
                            <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr>
                                <th className="px-3 py-3">案件</th><th className="px-3 py-3">業務／部門</th>{type === "presales" && <th className="px-3 py-3">協銷人員／部門</th>}<th className="px-3 py-3">結案／認列月份</th>{type === "presales" && <><th className="px-3 py-3">原始／接受時數</th><th className="px-3 py-3">原始／認列時薪</th></>}<th className="px-3 py-3">系統／最終金額</th><th className="px-3 py-3">狀態／原因</th><th className="px-3 py-3">操作</th>
                            </tr></thead>
                            <tbody>
                                {rows.map((row: any) => {
                                    const draft = drafts[row.id];
                                    return <tr key={row.id} className="border-t align-top hover:bg-muted/20">
                                        <td className="px-3 py-3"><div className="font-mono text-xs text-primary">{row.sourceCode}</div><div className="font-semibold">{row.sourceTitle}</div><div className="text-xs text-muted-foreground">{row.customerName}</div></td>
                                        <td className="px-3 py-3"><div>{row.salesName || "-"}</div><div className="text-xs text-muted-foreground">{row.salesDepartment || "-"}</div></td>
                                        {type === "presales" && <td className="px-3 py-3"><div>{row.participantName || "-"}</div><div className="text-xs text-muted-foreground">{row.participantDepartment || "-"}</div></td>}
                                        <td className="px-3 py-3"><div>結案：{row.closureMonth}</div><div className="text-xs text-muted-foreground">認列：{row.recognitionMonth || "尚未確認"}</div></td>
                                        {type === "presales" && <><td className="px-3 py-3"><div className="text-xs text-muted-foreground">原始 {row.originalHours}</div>{row.status === "pending" && draft ? <input type="number" min="0" value={draft.acceptedHours} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...current[row.id], acceptedHours: event.target.value } }))} className="mt-1 w-24 rounded border px-2 py-1" /> : <div>{row.acceptedHours}</div>}</td><td className="px-3 py-3"><div className="text-xs text-muted-foreground">原始 {row.originalRate.toLocaleString()}</div>{row.status === "pending" && draft ? <input type="number" min="0" value={draft.recognitionRate} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...current[row.id], recognitionRate: event.target.value } }))} className="mt-1 w-28 rounded border px-2 py-1" /> : <div>{row.recognitionRate.toLocaleString()}</div>}</td></>}
                                        <td className="px-3 py-3"><div className="text-xs text-muted-foreground">系統 NT$ {row.systemAmount.toLocaleString()}</div>{type === "project" && row.status === "pending" && draft ? <input type="number" min="0" value={draft.recognizedAmount} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...current[row.id], recognizedAmount: event.target.value } }))} className="mt-1 w-36 rounded border px-2 py-1" /> : <div className="font-semibold">NT$ {(row.status === "not_recognized" ? 0 : row.recognizedAmount).toLocaleString()}</div>}</td>
                                        <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === "recognized" ? "bg-emerald-100 text-emerald-700" : row.status === "not_recognized" || row.status === "reversed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{statusLabels[row.status] || row.status}</span>{row.status === "pending" && draft ? <input placeholder="調整原因" value={draft.reason} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...current[row.id], reason: event.target.value } }))} className="mt-2 block w-40 rounded border px-2 py-1 text-xs" /> : row.reason && <div className="mt-2 max-w-48 text-xs text-muted-foreground">{row.reason}</div>}</td>
                                        <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{row.status === "pending" && <><button type="button" onClick={() => saveRow(row)} className="rounded border px-2 py-1 text-xs"><Save className="mr-1 inline h-3 w-3" />儲存</button><button type="button" onClick={() => confirmRecord.mutate({ id: row.id, recognitionMonth: month })} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">確認認列</button><button type="button" onClick={() => notRecognize(row)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">不認列</button></>}{view === "recognized" && query.data?.isLocked && row.recordKind === "base" && row.status === "recognized" && <><button type="button" onClick={() => correct(row, "adjustment")} className="rounded border px-2 py-1 text-xs"><RotateCcw className="mr-1 inline h-3 w-3" />次月調整</button><button type="button" onClick={() => correct(row, "reversal")} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">沖銷</button></>}<button type="button" onClick={() => setHistoryId(row.id)} className="rounded border px-2 py-1 text-xs"><History className="mr-1 inline h-3 w-3" />歷程</button></div></td>
                                    </tr>;
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {historyId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setHistoryId(null)}><div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-card p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">認列異動歷程</h2><button type="button" onClick={() => setHistoryId(null)} className="rounded border px-3 py-1 text-sm">關閉</button></div><div className="mt-4 space-y-3">{history.isLoading ? <div>載入中…</div> : history.data?.length ? history.data.map((event: any) => <div key={event.id} className="rounded-lg border p-3"><div className="flex justify-between gap-3"><span className="font-semibold">{event.action}</span><span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span></div><div className="mt-1 text-xs text-muted-foreground">{event.actorName}（{event.actorRole}）</div>{event.reason && <div className="mt-2 text-sm">原因：{event.reason}</div>}</div>) : <div className="text-sm text-muted-foreground">尚無異動歷程。</div>}</div></div></div>}
        </div>
    );
}
