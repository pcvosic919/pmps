import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, TrendingUp, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { trpc } from "../lib/trpc";

const defaultSettings = {
    pcOverheadRate: 15,
    pcTargetMargin: 30,
    pcSlaTarget: 95,
    pcRenewalTarget: 85,
    pcUtilizationTarget: 80,
    pcPresalesHourlyRate: 1000,
    pcMaintenancePointValue: 500,
    pcKpiTarget: 5000000,
    pcDeptKpiTargets: {} as Record<string, number>,
};

type KpiSourceDefinition = {
    key: "target" | "recognizedRevenue" | "pipeline" | "settlement";
    label: string;
    source: string;
    rule: string;
    isActive: boolean;
};

const defaultPipelineWeights: Record<string, number> = {
    "lead": 0.2,
    "qualified": 0.4,
    "proposal": 0.6,
    "negotiation": 0.8,
    "won": 1,
    "lost": 0,
};

export default function ProfitCenterFormulaPage() {
    const [settings, setSettings] = useState(defaultSettings);
    const [targetYear, setTargetYear] = useState(new Date().getFullYear());
    const [selectedDept, setSelectedDept] = useState("");
    const [customTarget, setCustomTarget] = useState("");
    const [selectedPersonId, setSelectedPersonId] = useState("");
    const [personTarget, setPersonTarget] = useState("");
    const [personNote, setPersonNote] = useState("");
    const [pipelineWeights, setPipelineWeights] = useState<Record<string, number>>(defaultPipelineWeights);
    const [importedPipelineWeight, setImportedPipelineWeight] = useState(1);
    const [sourceDefinitions, setSourceDefinitions] = useState<KpiSourceDefinition[]>([]);
    const [settlementLinkRule, setSettlementLinkRule] = useState("");
    
    const utils = trpc.useUtils();
    const { data: departments } = trpc.users.getDepartments.useQuery();
    const { data: usersData } = trpc.users.list.useQuery({ limit: 500 });
    const allUsers = usersData?.items || [];
    const { data: governance, refetch: refetchGovernance } = trpc.analytics.getKpiGovernance.useQuery({ year: targetYear });

    const { data, isLoading } = trpc.system.getSettings.useQuery();
    const updateSettings = trpc.system.updateSettings.useMutation({
        onSuccess: async () => {
            toast.success("利潤中心公式設定已儲存");
            await utils.system.getSettings.invalidate();
            await utils.analytics.getKpiGovernance.invalidate();
            await utils.analytics.getDeptKpi.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "儲存失敗，請稍後再試");
        }
    });
    const upsertKpiTarget = trpc.analytics.upsertKpiTarget.useMutation({
        onSuccess: async () => {
            await refetchGovernance();
            await utils.analytics.getDeptKpi.invalidate();
            await utils.analytics.generateReport.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "年度目標儲存失敗");
        }
    });
    const updateKpiPolicy = trpc.analytics.updateKpiPolicy.useMutation({
        onSuccess: async () => {
            toast.success("KPI 治理規則已儲存");
            await refetchGovernance();
            await utils.analytics.getKpiGovernance.invalidate();
            await utils.analytics.getKpiData.invalidate();
            await utils.analytics.getKpiRevenueDashboard.invalidate();
            await utils.analytics.generateReport.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "KPI 治理規則儲存失敗");
        }
    });

    useEffect(() => {
        if (data) {
            setSettings({
                pcOverheadRate: data.pcOverheadRate,
                pcTargetMargin: data.pcTargetMargin,
                pcSlaTarget: data.pcSlaTarget,
                pcRenewalTarget: data.pcRenewalTarget,
                pcUtilizationTarget: data.pcUtilizationTarget,
                pcPresalesHourlyRate: data.pcPresalesHourlyRate ?? 1000,
                pcMaintenancePointValue: data.pcMaintenancePointValue ?? 500,
                pcKpiTarget: (data as any).pcKpiTarget ?? 5000000,
                pcDeptKpiTargets: (data as any).pcDeptKpiTargets ?? {},
            });
        }
    }, [data]);

    useEffect(() => {
        const policy = governance?.policy;
        if (!policy) return;
        setPipelineWeights(policy.pipelineWeights || defaultPipelineWeights);
        setImportedPipelineWeight(policy.importedPipelineWeight ?? 1);
        setSourceDefinitions(policy.sourceDefinitions || []);
        setSettlementLinkRule(policy.settlementLinkRule || "");
    }, [governance?.policy]);

    const deptTargetTotal = useMemo(
        () => Object.values(settings.pcDeptKpiTargets || {}).reduce((sum, value) => sum + Number(value || 0), 0),
        [settings.pcDeptKpiTargets]
    );
    const divisionTarget = Number((settings as any).pcKpiTarget || 0);
    const targetGap = deptTargetTotal - divisionTarget;
    const deptTargetsMatchDivision = targetGap === 0;
    const personTargets = (governance?.targets || []).filter((target: any) => target.scope === "person");

    const handleSave = async () => {
        // We only update the formula-related settings, so we merge with existing data to satisfy the mutation schema
        if (!data) return;
        if (!deptTargetsMatchDivision) {
            toast.error(`各部門 KPI 目標加總需等於處級目標，目前差額 NT$ ${Math.abs(targetGap).toLocaleString()}`);
            return;
        }
        
        const updatedPayload = {
            ...data,
            ...settings
        };
        
        await updateSettings.mutateAsync(updatedPayload);
        await Promise.all(Object.entries(settings.pcDeptKpiTargets || {}).map(([department, targetAmount]) =>
            upsertKpiTarget.mutateAsync({
                year: targetYear,
                scope: "department",
                department,
                targetAmount: Number(targetAmount || 0),
                note: "利潤中心公式頁同步"
            })
        ));
    };

    const handleSavePersonTarget = async () => {
        const selectedUser = allUsers.find((user: any) => user.id === selectedPersonId);
        if (!selectedUser) {
            toast.error("請先選擇人員");
            return;
        }
        await upsertKpiTarget.mutateAsync({
            year: targetYear,
            scope: "person",
            department: selectedUser.department || "未指定",
            userId: selectedUser.id,
            targetAmount: Number(personTarget || 0),
            note: personNote || undefined
        });
        setSelectedPersonId("");
        setPersonTarget("");
        setPersonNote("");
        toast.success("個人年度目標已儲存");
    };

    const handleSaveKpiPolicy = async () => {
        await updateKpiPolicy.mutateAsync({
            year: targetYear,
            sourceDefinitions,
            pipelineWeights,
            importedPipelineWeight,
            settlementLinkRule
        });
    };

    const updateSourceDefinition = (key: string, field: keyof KpiSourceDefinition, value: string) => {
        setSourceDefinitions((current) =>
            current.map((source) => source.key === key ? { ...source, [field]: value } : source)
        );
    };

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">載入公式設定中...</div>;
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div className="flex items-center space-x-3">
                    <TrendingUp className="w-8 h-8 text-primary" />
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">利潤中心公式設定</h2>
                        <p className="text-muted-foreground mt-1">維護系統核心利潤計算公式與績效指標目標</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={updateSettings.isPending}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg flex items-center text-sm font-medium transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {updateSettings.isPending || upsertKpiTarget.isPending ? "儲存中..." : "儲存設定"}
                </button>
            </div>

            <div className="bg-card border rounded-xl shadow-sm p-6 lg:p-8 space-y-8">
                <div className="grid gap-8">
                    <div className="grid md:grid-cols-2 gap-8 border-b border-border/50 pb-8">
                        <div>
                            <label className="block text-sm font-bold mb-2">管銷費用分攤率 (Overhead Rate %)</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={settings.pcOverheadRate}
                                onChange={e => setSettings(s => ({ ...s, pcOverheadRate: Number(e.target.value) }))}
                                className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">月度結算時，直接成本 × 此比例 = 間接管銷費用。建議 10~20%。</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2">目標毛利率 (Target Margin %)</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={settings.pcTargetMargin}
                                onChange={e => setSettings(s => ({ ...s, pcTargetMargin: Number(e.target.value) }))}
                                className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">報表中毛利率低於此目標值將以紅色警示標記。</p>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-bold mb-2">SLA 達標率目標 (%)</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={settings.pcSlaTarget}
                                onChange={e => setSettings(s => ({ ...s, pcSlaTarget: Number(e.target.value) }))}
                                className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-2 italic">用於 SLA 達成率報表。</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2">續約率目標 (%)</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={settings.pcRenewalTarget}
                                onChange={e => setSettings(s => ({ ...s, pcRenewalTarget: Number(e.target.value) }))}
                                className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-2 italic">用於客戶續約率報表。</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2">稼動率目標 (%)</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={settings.pcUtilizationTarget}
                                onChange={e => setSettings(s => ({ ...s, pcUtilizationTarget: Number(e.target.value) }))}
                                className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-2 italic">人員稼動率報表的目標值。</p>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 border-t border-border/50 pt-8">
                        <div>
                            <label className="block text-sm font-bold mb-2">協銷預設單價 (NT$ / 小時)</label>
                            <input
                                type="number"
                                min={0}
                                value={settings.pcPresalesHourlyRate}
                                onChange={e => setSettings(s => ({ ...s, pcPresalesHourlyRate: Number(e.target.value) }))}
                                className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">用於計算協銷收入：協銷時數 × 此單價。</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2">維運點數預設單價 (NT$ / 點)</label>
                            <input
                                type="number"
                                min={0}
                                value={settings.pcMaintenancePointValue}
                                onChange={e => setSettings(s => ({ ...s, pcMaintenancePointValue: Number(e.target.value) }))}
                                className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">用於計算維運收入：扣除點數 × 此單價。</p>
                        </div>
                    </div>

                    <div className="grid gap-6 border-t border-border/50 pt-8">
                        <div>
                            <label className="block text-sm font-bold mb-2">KPI Pipeline 加權規則</label>
                            <p className="text-xs text-muted-foreground mb-4">KPI 儀表板、年度目標認列報表與匯入 Pipeline 會統一使用此處權重。</p>
                            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {Object.entries(pipelineWeights).map(([status, weight]) => (
                                        <label key={status} className="grid grid-cols-[1fr_96px] items-center gap-3 rounded-lg border border-border/60 bg-muted/10 p-3 text-sm">
                                            <span className="font-medium">{status}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                max={1}
                                                step={0.05}
                                                value={weight}
                                                onChange={(event) => setPipelineWeights((current) => ({ ...current, [status]: Number(event.target.value) }))}
                                                className="rounded-md border border-input bg-background px-2 py-1 text-right"
                                            />
                                        </label>
                                    ))}
                                </div>
                                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                                    <label className="block text-sm font-bold mb-2">匯入 Pipeline 權重</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={importedPipelineWeight}
                                        onChange={(event) => setImportedPipelineWeight(Number(event.target.value))}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-right"
                                    />
                                    <p className="mt-2 text-xs text-muted-foreground">從 Excel 匯入的 Pipeline 若沒有狀態分級，使用此權重計算預估達成。</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-2">KPI 資料來源定義</label>
                            <div className="grid gap-3">
                                {sourceDefinitions.length === 0 ? (
                                    <div className="rounded-lg border border-border/60 p-4 text-sm text-muted-foreground">尚未建立資料來源定義</div>
                                ) : (
                                    sourceDefinitions.map((source) => (
                                        <div key={source.key} className="grid gap-3 rounded-lg border border-border/60 bg-muted/10 p-4">
                                            <input
                                                value={source.label}
                                                onChange={(event) => updateSourceDefinition(source.key, "label", event.target.value)}
                                                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                            />
                                            <input
                                                value={source.source}
                                                onChange={(event) => updateSourceDefinition(source.key, "source", event.target.value)}
                                                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                placeholder="資料來源"
                                            />
                                            <textarea
                                                value={source.rule}
                                                onChange={(event) => updateSourceDefinition(source.key, "rule", event.target.value)}
                                                className="min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                placeholder="統計規則"
                                            />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-2">月結與 KPI 認列關聯</label>
                            <textarea
                                value={settlementLinkRule}
                                onChange={(event) => setSettlementLinkRule(event.target.value)}
                                className="min-h-[84px] w-full rounded-lg border border-input bg-background/50 p-3 text-sm focus:bg-background"
                            />
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={handleSaveKpiPolicy}
                                disabled={updateKpiPolicy.isPending}
                                className="inline-flex items-center rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                            >
                                <Save className="mr-2 h-4 w-4" />
                                {updateKpiPolicy.isPending ? "儲存中..." : "儲存 KPI 治理規則"}
                            </button>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 border-t border-border/50 pt-8">
                        <div>
                            <label className="block text-sm font-bold mb-2">目標年度</label>
                            <input
                                type="number"
                                min={2020}
                                max={2100}
                                value={targetYear}
                                onChange={e => setTargetYear(Number(e.target.value))}
                                className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">部門與個人年度目標會同步到此年度的 KPI 目標設定。</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2">處級 KPI 目標金額 (NT$)</label>
                            <input
                                type="number"
                                min={0}
                                value={(settings as any).pcKpiTarget ?? 5000000}
                                onChange={e => setSettings(s => ({ ...s, pcKpiTarget: Number(e.target.value) } as any))}
                                className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">處級年度目標總額；各部門 KPI 目標加總必須等於此金額。</p>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-1 gap-8 border-t border-border/50 pt-8">
                        <div>
                            <label className="block text-sm font-bold mb-2">各部門 KPI 目標</label>
                            <p className="text-xs text-muted-foreground mb-4">各部門 KPI 目標加總需等於處級 KPI 目標，儲存時會同步到年度部門 KpiTarget。</p>
                            <div className={`mb-4 rounded-lg border p-3 text-sm ${deptTargetsMatchDivision ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                                <div className="flex items-center gap-2 font-semibold">
                                    {!deptTargetsMatchDivision && <AlertTriangle className="h-4 w-4" />}
                                    部門合計 NT$ {deptTargetTotal.toLocaleString()} / 處級目標 NT$ {divisionTarget.toLocaleString()}
                                </div>
                                {!deptTargetsMatchDivision && (
                                    <div className="mt-1 text-xs">
                                        目前{targetGap > 0 ? "超出" : "不足"} NT$ {Math.abs(targetGap).toLocaleString()}，請調整部門目標後再儲存。
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex gap-3 mb-4">
                                <select 
                                    className="p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background"
                                    value={selectedDept}
                                    onChange={e => setSelectedDept(e.target.value)}
                                >
                                    <option value="">選擇部門...</option>
                                    {departments?.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min={0}
                                    placeholder="目標金額"
                                    value={customTarget}
                                    onChange={e => setCustomTarget(e.target.value)}
                                    className="p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (selectedDept && customTarget) {
                                            setSettings(s => ({
                                                ...s,
                                                pcDeptKpiTargets: {
                                                    ...(s.pcDeptKpiTargets || {}),
                                                    [selectedDept]: Number(customTarget)
                                                }
                                            }));
                                            setSelectedDept("");
                                            setCustomTarget("");
                                        }
                                    }}
                                    className="bg-secondary text-secondary-foreground px-4 py-2 rounded-lg hover:bg-secondary/80 flex items-center"
                                >
                                    <Plus className="w-4 h-4 mr-1" /> 新增 / 更新
                                </button>
                            </div>

                            <div className="bg-muted/20 border border-border/50 rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">部門代碼</th>
                                            <th className="px-4 py-2 font-medium">專屬 KPI 目標 (NT$)</th>
                                            <th className="px-4 py-2 font-medium w-20 text-center">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {Object.entries(settings.pcDeptKpiTargets || {}).length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">尚未設定個別部門目標</td>
                                            </tr>
                                        ) : (
                                            Object.entries(settings.pcDeptKpiTargets || {}).map(([dept, target]) => (
                                                <tr key={dept} className="hover:bg-muted/10">
                                                    <td className="px-4 py-2.5 font-medium">{dept}</td>
                                                    <td className="px-4 py-2.5">{(target as number).toLocaleString()}</td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSettings(s => {
                                                                    const newTargets = { ...s.pcDeptKpiTargets };
                                                                    delete newTargets[dept];
                                                                    return { ...s, pcDeptKpiTargets: newTargets };
                                                                });
                                                            }}
                                                            className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-1 gap-8 border-t border-border/50 pt-8">
                        <div>
                            <label className="block text-sm font-bold mb-2">個人年度目標</label>
                            <p className="text-xs text-muted-foreground mb-4">設定每位人員在目標年度的 KPI 目標，年度認列報表的 Summary_個人會直接引用。</p>
                            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1.2fr_auto] mb-4">
                                <select
                                    value={selectedPersonId}
                                    onChange={e => setSelectedPersonId(e.target.value)}
                                    className="p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background"
                                >
                                    <option value="">選擇人員...</option>
                                    {allUsers.map((user: any) => (
                                        <option key={user.id} value={user.id}>{user.name} - {user.department || "未指定"}</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min={0}
                                    placeholder="年度目標"
                                    value={personTarget}
                                    onChange={e => setPersonTarget(e.target.value)}
                                    className="p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background"
                                />
                                <input
                                    placeholder="備註"
                                    value={personNote}
                                    onChange={e => setPersonNote(e.target.value)}
                                    className="p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background"
                                />
                                <button
                                    type="button"
                                    onClick={handleSavePersonTarget}
                                    disabled={upsertKpiTarget.isPending}
                                    className="bg-secondary text-secondary-foreground px-4 py-2 rounded-lg hover:bg-secondary/80 flex items-center justify-center disabled:opacity-50"
                                >
                                    <Plus className="w-4 h-4 mr-1" /> 新增 / 更新
                                </button>
                            </div>
                            <div className="bg-muted/20 border border-border/50 rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">人員</th>
                                            <th className="px-4 py-2 font-medium">部門</th>
                                            <th className="px-4 py-2 font-medium">年度目標 (NT$)</th>
                                            <th className="px-4 py-2 font-medium">備註</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {personTargets.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">尚未設定個人年度目標</td>
                                            </tr>
                                        ) : (
                                            personTargets.map((target: any) => (
                                                <tr key={target.id} className="hover:bg-muted/10">
                                                    <td className="px-4 py-2.5 font-medium">{target.userName || target.userId}</td>
                                                    <td className="px-4 py-2.5">{target.department || "未指定"}</td>
                                                    <td className="px-4 py-2.5">{Number(target.targetAmount || 0).toLocaleString()}</td>
                                                    <td className="px-4 py-2.5 text-muted-foreground">{target.note || ""}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-muted/30 border border-border/50 rounded-lg p-5">
                    <h4 className="text-sm font-semibold mb-3 flex items-center">
                        <TrendingUp className="w-4 h-4 mr-2 text-primary" />
                        <span>💡 公式與目標計算說明</span>
                    </h4>
                    <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed">
                        <li>• <strong>專案毛利 (Project Margin)</strong> = 最終成交金額 − 直接人力成本 − (直接成本 × 管銷費用分攤率)</li>
                        <li>• <strong>達標判定 (Success Tracking)</strong>：實際毛利率 ≥ 目標毛利率 → <span className="text-emerald-500 font-semibold underline decoration-dotted">綠色標記</span>; 反之則顯示 <span className="text-rose-500 font-semibold underline decoration-dotted">紅色警示</span>。</li>
                        <li>• <strong>稼動率 (Utilization Rate)</strong> = (實際可計費工時 / 月標準法定工時) × 100%</li>
                        <li>• <strong>SLA 達成率 (SLA Fulfillment)</strong> = (準時完成之服務工單數 / 總結案工單數) × 100%</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
