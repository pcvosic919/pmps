import { useState } from "react";
import { RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import toast from "react-hot-toast";
import { trpc } from "../lib/trpc";

const issueLabels: Record<string, string> = {
    missing: "帳號不存在",
    inactive: "帳號已停用",
    role_mismatch: "角色不符",
    duplicate: "重複指派"
};

export function AssignmentIntegrityPage() {
    const [lastResult, setLastResult] = useState<any>(null);
    const scan = trpc.users.scanAssignmentIntegrity.useQuery(undefined, { enabled: false });
    const repair = trpc.users.repairAssignmentIntegrity.useMutation({
        onSuccess: (result) => { setLastResult(result); toast.success(`安全修復完成，共修復 ${result.repairedCount} 項`); },
        onError: (error) => toast.error(error.message)
    });
    const result = lastResult || scan.data;

    const runScan = async () => {
        const response = await scan.refetch();
        if (response.data) setLastResult(response.data);
    };

    const runRepair = () => {
        if (!window.confirm("只會去除重複指派並補上 WBS 人員快照；不會刪除停用或不存在帳號的歷史參照。確定執行？")) return;
        repair.mutate({ confirmation: "REPAIR_SAFE_ASSIGNMENTS" });
    };

    return (
        <div className="mx-auto max-w-[1400px] space-y-5">
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
                <div><div className="flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-amber-600" /><h1 className="text-2xl font-bold">歷史指派資料檢查</h1></div><p className="mt-1 text-sm text-muted-foreground">掃描專案成員、WBS、商機協銷與議題指派，辨識停用、遺失、角色不符與重複帳號。</p></div>
                <div className="flex gap-2"><button type="button" onClick={runScan} disabled={scan.isFetching} className="rounded-lg border px-4 py-2 text-sm"><RefreshCw className="mr-2 inline h-4 w-4" />執行掃描</button><button type="button" onClick={runRepair} disabled={!result || repair.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"><Wrench className="mr-2 inline h-4 w-4" />執行安全修復</button></div>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">安全修復只處理可自動判斷的重複參照與 WBS 姓名／部門快照。停用帳號、缺失帳號及角色不符資料會保留供人工確認，不會靜默刪除。</div>
            {result && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["異常總數", result.issueCount], ["帳號不存在", result.counts.missing], ["已停用", result.counts.inactive], ["角色不符", result.counts.role_mismatch], ["重複指派", result.counts.duplicate]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-card p-4 shadow-sm"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>)}</div><div className="overflow-hidden rounded-xl border bg-card shadow-sm"><div className="overflow-x-auto"><table className="min-w-[1000px] w-full text-sm"><thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-3">資料類型</th><th className="px-3 py-3">案件</th><th className="px-3 py-3">欄位</th><th className="px-3 py-3">帳號 ID</th><th className="px-3 py-3">異常</th><th className="px-3 py-3">說明</th><th className="px-3 py-3">修復</th></tr></thead><tbody>{result.issues.map((issue: any, index: number) => <tr key={`${issue.entityType}-${issue.entityId}-${issue.path}-${index}`} className="border-t"><td className="px-3 py-3">{issue.entityType}</td><td className="px-3 py-3"><div className="font-semibold">{issue.entityName}</div><div className="font-mono text-xs text-muted-foreground">{issue.entityId}</div></td><td className="px-3 py-3 font-mono text-xs">{issue.path}</td><td className="px-3 py-3 font-mono text-xs">{issue.userId}</td><td className="px-3 py-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">{issueLabels[issue.issueType] || issue.issueType}</span></td><td className="px-3 py-3">{issue.detail}</td><td className="px-3 py-3">{issue.repaired ? <span className="text-emerald-700">已修復</span> : <span className="text-muted-foreground">人工確認</span>}</td></tr>)}</tbody></table></div></div></>}
        </div>
    );
}
