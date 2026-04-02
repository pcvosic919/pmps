import { useEffect, useState } from "react";
import { TrendingUp, Save } from "lucide-react";
import { toast } from "react-hot-toast";
import { trpc } from "../lib/trpc";

const defaultSettings = {
    pcOverheadRate: 15,
    pcTargetMargin: 30,
    pcSlaTarget: 95,
    pcRenewalTarget: 85,
    pcUtilizationTarget: 80,
};

export default function ProfitCenterFormulaPage() {
    const [settings, setSettings] = useState(defaultSettings);
    const utils = trpc.useUtils();

    const { data, isLoading } = trpc.system.getSettings.useQuery();
    const updateSettings = trpc.system.updateSettings.useMutation({
        onSuccess: async () => {
            toast.success("利潤中心公式設定已儲存");
            await utils.system.getSettings.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "儲存失敗，請稍後再試");
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
            });
        }
    }, [data]);

    const handleSave = () => {
        // We only update the formula-related settings, so we merge with existing data to satisfy the mutation schema
        if (!data) return;
        
        const updatedPayload = {
            ...data,
            ...settings
        };
        
        updateSettings.mutate(updatedPayload);
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
                    {updateSettings.isPending ? "儲存中..." : "儲存設定"}
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
                </div>

                <div className="bg-muted/30 border border-border/50 rounded-lg p-5">
                    <h4 className="text-sm font-semibold mb-3 flex items-center">
                        <TrendingUp className="w-4 h-4 mr-2 text-primary" />
                        <span>💡 公式與目標計算說明</span>
                    </h4>
                    <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed">
                        <li>• <strong>專案毛利 (Project Margin)</strong> = 合約金額 − 直接人力成本 − (直接成本 × 管銷費用分攤率)</li>
                        <li>• <strong>達標判定 (Success Tracking)</strong>：實際毛利率 ≥ 目標毛利率 → <span className="text-emerald-500 font-semibold underline decoration-dotted">綠色標記</span>; 反之則顯示 <span className="text-rose-500 font-semibold underline decoration-dotted">紅色警示</span>。</li>
                        <li>• <strong>稼動率 (Utilization Rate)</strong> = (實際可計費工時 / 月標準法定工時) × 100%</li>
                        <li>• <strong>SLA 達成率 (SLA Fulfillment)</strong> = (準時完成之服務工單數 / 總結案工單數) × 100%</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
