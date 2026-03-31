import { useEffect, useState } from "react";
import { Settings, Save, Database, Shield, Layout, Bell, Activity, TrendingUp } from "lucide-react";
import { toast } from "react-hot-toast";
import { trpc } from "../lib/trpc";

const defaultSettings = {
    companyName: "PMP System",
    systemEmail: "noreply@example.com",
    defaultCurrency: "TWD",
    sessionTimeout: 60,
    enableNotifications: true,
    allowClientAccess: false,
    entraClientId: "",
    entraClientSecret: "",
    entraTenantId: "",
    entraEnabled: false,
    apiToken: "",
    webhookUrl: "",
    webhookEnabled: false,
    hrSyncUrl: "",
    hrSyncEnabled: false,
    availableProducts: [] as string[],
    pcOverheadRate: 15,
    pcTargetMargin: 30,
    pcSlaTarget: 95,
    pcRenewalTarget: 85,
    pcUtilizationTarget: 80,
    sharePointSiteUrl: "",
};

export function SystemSettingsPage() {
    const [activeTab, setActiveTab] = useState("general");
    const [settings, setSettings] = useState(defaultSettings);

    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.system.getSettings.useQuery();
    const updateSettings = trpc.system.updateSettings.useMutation({
        onSuccess: async () => {
            toast.success("系統設定已儲存至資料庫");
            await utils.system.getSettings.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "儲存失敗，請稍後再試");
        }
    });

    useEffect(() => {
        if (data) {
            setSettings(data);
        }
    }, [data]);

    const handleSave = () => {
        updateSettings.mutate(settings);
    };

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">載入系統設定中...</div>;
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div className="flex items-center space-x-3">
                    <Settings className="w-8 h-8 text-primary" />
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">系統與進階設定</h2>
                        <p className="text-muted-foreground mt-1">管理 PMP 系統全域行為與安全策略</p>
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

            <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-64 space-y-1">
                    {[
                        { key: "general", icon: <Layout className="w-5 h-5" />, label: "一般設定" },
                        { key: "security", icon: <Shield className="w-5 h-5" />, label: "安全與存取" },
                        { key: "notifications", icon: <Bell className="w-5 h-5" />, label: "通知與郵件" },
                        { key: "integrations", icon: <Database className="w-5 h-5" />, label: "整合與 API" },
                        { key: "profitcenter", icon: <TrendingUp className="w-5 h-5" />, label: "利潤中心公式" },
                        { key: "jobs", icon: <Activity className="w-5 h-5" />, label: "背景作業排程" },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                <div className="flex-1 bg-card border rounded-xl shadow-sm p-6 lg:p-8">
                    {activeTab === "general" && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold mb-4 border-b pb-2">一般系統設定</h3>
                            <div className="grid gap-6 max-w-2xl">
                                <div>
                                    <label className="block text-sm font-bold mb-2">公司名稱</label>
                                    <input
                                        type="text"
                                        value={settings.companyName}
                                        onChange={e => setSettings(s => ({ ...s, companyName: e.target.value }))}
                                        className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">將顯示在系統左上角與報表中</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-2">預設幣別</label>
                                    <select
                                        value={settings.defaultCurrency}
                                        onChange={e => setSettings(s => ({ ...s, defaultCurrency: e.target.value }))}
                                        className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                                    >
                                        <option value="TWD">TWD (新台幣)</option>
                                        <option value="USD">USD (美元)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-2">系統寄件信箱</label>
                                    <input
                                        type="email"
                                        value={settings.systemEmail}
                                        onChange={e => setSettings(s => ({ ...s, systemEmail: e.target.value }))}
                                        className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-2">可選產品列表 (每行一個)</label>
                                    <textarea
                                        value={settings.availableProducts?.join("\n") || ""}
                                        onChange={e => setSettings(s => ({ ...s, availableProducts: e.target.value.split("\n").filter(x => x.trim()) }))}
                                        rows={5}
                                        className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors font-mono text-sm"
                                        placeholder="例如：\n雲端服務\n資安健檢\n系統開發"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">商機管理中可供選擇的產品項目</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "security" && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold mb-4 border-b pb-2">安全與存取控制</h3>
                            <div className="grid gap-6 max-w-2xl">
                                <div>
                                    <label className="block text-sm font-bold mb-2 flex items-center justify-between">
                                        <span>Session 逾時時間 (分鐘)</span>
                                        <span className="text-primary font-mono">{settings.sessionTimeout}m</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="15"
                                        max="240"
                                        step="15"
                                        value={settings.sessionTimeout}
                                        onChange={e => setSettings(s => ({ ...s, sessionTimeout: Number(e.target.value) }))}
                                        className="w-full accent-primary"
                                    />
                                </div>
                                <div className="pt-4">
                                    <label className="flex items-start space-x-3 cursor-pointer group">
                                        <div className="flex h-5 items-center">
                                            <input
                                                type="checkbox"
                                                checked={settings.allowClientAccess}
                                                onChange={e => setSettings(s => ({ ...s, allowClientAccess: e.target.checked }))}
                                                className="w-4 h-4 rounded border-input text-primary focus:ring-primary/20"
                                            />
                                        </div>
                                        <div>
                                            <span className="text-sm font-bold block group-hover:text-primary transition-colors">允許客戶端外部存取</span>
                                            <span className="text-sm text-muted-foreground">開啟此選項將允許未在內網的客端 IP 訪問外部協作模組。</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "notifications" && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold mb-4 border-b pb-2">通知策略</h3>
                            <div className="grid gap-6 max-w-2xl">
                                <label className="flex items-start space-x-3 cursor-pointer group">
                                    <div className="flex h-5 items-center">
                                        <input
                                            type="checkbox"
                                            checked={settings.enableNotifications}
                                            onChange={e => setSettings(s => ({ ...s, enableNotifications: e.target.checked }))}
                                            className="w-4 h-4 rounded border-input text-primary focus:ring-primary/20"
                                        />
                                    </div>
                                    <div>
                                        <span className="text-sm font-bold block group-hover:text-primary transition-colors">啟用全站通知</span>
                                        <span className="text-sm text-muted-foreground">開啟此選項系統將發送站內信給相關人員。</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {activeTab === "integrations" && (
                        <div className="space-y-8">
                            <div>
                                <div className="flex items-center justify-between mb-4 border-b pb-2">
                                    <h3 className="text-lg font-bold">Microsoft Entra ID (Azure AD) 整合</h3>
                                    <div
                                        onClick={() => setSettings(s => ({ ...s, entraEnabled: !s.entraEnabled }))}
                                        className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full transition-colors ${settings.entraEnabled ? 'bg-primary' : 'bg-muted border border-border'}`}
                                    >
                                        <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${settings.entraEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </div>
                                </div>
                                <div className={`grid gap-4 max-w-2xl ${settings.entraEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
                                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                                        啟用後，登入頁會自動套用 Tenant / Client 設定提供 SSO，且管理員可於「用戶管理」手動同步 Entra ID 帳號。請確認 Microsoft Graph 已授權至少
                                        <span className="font-semibold text-foreground"> User.Read、User.Read.All</span>
                                        ，若要批次同步則需使用應用程式權限並完成 admin consent。
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Tenant ID</label>
                                        <input
                                            type="text"
                                            value={settings.entraTenantId}
                                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                            onChange={e => setSettings(s => ({ ...s, entraTenantId: e.target.value }))}
                                            className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background font-mono text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Client ID (應用程式識別碼)</label>
                                        <input
                                            type="text"
                                            value={settings.entraClientId}
                                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                            onChange={e => setSettings(s => ({ ...s, entraClientId: e.target.value }))}
                                            className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background font-mono text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Client Secret</label>
                                        <input
                                            type="password"
                                            value={settings.entraClientSecret}
                                            placeholder="••••••••••••••••"
                                            onChange={e => setSettings(s => ({ ...s, entraClientSecret: e.target.value }))}
                                            className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background font-mono text-sm"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">設定後用戶可透過 Microsoft 帳號 SSO 登入</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold mb-4 border-b pb-2">系統 API Token</h3>
                                <div className="grid gap-4 max-w-2xl">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">API Token</label>
                                        <div className="flex space-x-2">
                                            <input
                                                type="text"
                                                value={settings.apiToken}
                                                placeholder="輸入或貼上 API Token"
                                                onChange={e => setSettings(s => ({ ...s, apiToken: e.target.value }))}
                                                className="flex-1 p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background font-mono text-sm"
                                            />
                                            <button
                                                onClick={() => setSettings(s => ({ ...s, apiToken: `pmp_${Math.random().toString(36).slice(2, 18)}` }))}
                                                className="px-4 py-2 text-sm bg-muted hover:bg-muted/80 border border-border rounded-lg whitespace-nowrap"
                                            >
                                                產生 Token
                                            </button>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">供外部系統呼叫 PMP API 時使用</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-4 border-b pb-2">
                                    <h3 className="text-lg font-bold">Webhook 通知</h3>
                                    <div
                                        onClick={() => setSettings(s => ({ ...s, webhookEnabled: !s.webhookEnabled }))}
                                        className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full transition-colors ${settings.webhookEnabled ? 'bg-primary' : 'bg-muted border border-border'}`}
                                    >
                                        <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${settings.webhookEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </div>
                                </div>
                                <div className={`grid gap-4 max-w-2xl ${settings.webhookEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Webhook URL</label>
                                        <input
                                            type="url"
                                            value={settings.webhookUrl}
                                            placeholder="https://your-service.com/webhook"
                                            onChange={e => setSettings(s => ({ ...s, webhookUrl: e.target.value }))}
                                            className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background text-sm"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">商機狀態變更、SR 建立等事件將推送至此 URL</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-4 border-b pb-2">
                                    <h3 className="text-lg font-bold">HR 系統同步</h3>
                                    <div
                                        onClick={() => setSettings(s => ({ ...s, hrSyncEnabled: !s.hrSyncEnabled }))}
                                        className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full transition-colors ${settings.hrSyncEnabled ? 'bg-primary' : 'bg-muted border border-border'}`}
                                    >
                                        <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${settings.hrSyncEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </div>
                                </div>
                                <div className={`grid gap-4 max-w-2xl ${settings.hrSyncEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">HR API Endpoint</label>
                                        <input
                                            type="url"
                                            value={settings.hrSyncUrl}
                                            placeholder="https://hr-system.company.com/api/sync"
                                            onChange={e => setSettings(s => ({ ...s, hrSyncUrl: e.target.value }))}
                                            className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background text-sm"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">自動同步員工名單與部門資訊</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold mb-4 border-b pb-2">📁 SharePoint Online 整合</h3>
                                <div className="grid gap-4 max-w-2xl">
                                    <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-3 text-xs text-muted-foreground">
                                        建立商機／SR 時，系統將自動在指定 SharePoint Site 建立目錄。<br />
                                        目錄命名：<span className="font-mono font-semibold">YYYYMMDD_名稱_Owner</span><br />
                                        需要 Entra App 具備 <span className="font-semibold text-foreground">Sites.Manage.All</span> 應用程式權限。
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">SharePoint Site URL</label>
                                        <input
                                            type="url"
                                            value={(settings as any).sharePointSiteUrl || ""}
                                            placeholder="https://yourdomain.sharepoint.com/sites/PMP"
                                            onChange={e => setSettings(s => ({ ...s, sharePointSiteUrl: e.target.value }))}
                                            className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background text-sm"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">留空則會停用自動建立目錄功能（mock 模式）</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "jobs" && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold mb-4 border-b pb-2">背景作業與排程監控</h3>
                            <div className="grid gap-6 max-w-2xl">
                                <div className="border border-border rounded-xl p-5 bg-card shadow-sm relative overflow-hidden">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className="font-bold flex items-center">
                                                Entra ID 每日人員排程同步
                                                <span className="ml-3 px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">執行中 (Active)</span>
                                            </h4>
                                            <p className="text-sm text-muted-foreground mt-2">
                                                每日凌晨 02:00 自動從 Microsoft Azure 讀取 Active Directory 異動並更新至本機資料庫。
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-5 border-t border-border/50 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">伺服器節點常駐 (Cron: 0 2 * * *)</span>
                                        <button className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-all shadow-sm active:scale-95 whitespace-nowrap" onClick={() => {
                                            toast.promise(utils.client.users.syncEntraUsers.mutate(), {
                                                loading: '手動觸發 Graph API 同步中...',
                                                success: (res: any) => `同步成功 (建立 ${res.created} 筆, 更新 ${res.updated} 筆)`,
                                                error: '同步失敗，請確認「整合與 API」設定檔'
                                            });
                                        }}>
                                            立即手動觸發
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "profitcenter" && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold mb-4 border-b pb-2">利潤中心制公式設定 (Profit Center Formulas)</h3>
                            <p className="text-sm text-muted-foreground -mt-2 mb-4">以下參數將套用至月度結算報表、KPI 儀表板、與自訂報表的利潤計算邏輯。</p>
                            <div className="grid gap-6 max-w-2xl">
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
                                <div>
                                    <label className="block text-sm font-bold mb-2">SLA 達標率目標 (SLA Target %)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={settings.pcSlaTarget}
                                        onChange={e => setSettings(s => ({ ...s, pcSlaTarget: Number(e.target.value) }))}
                                        className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">用於 SLA 達成率報表計算基準。</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-2">續約率目標 (Renewal Target %)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={settings.pcRenewalTarget}
                                        onChange={e => setSettings(s => ({ ...s, pcRenewalTarget: Number(e.target.value) }))}
                                        className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">用於客戶續約率報表計算基準。</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-2">稼動率目標 (Utilization Target %)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={settings.pcUtilizationTarget}
                                        onChange={e => setSettings(s => ({ ...s, pcUtilizationTarget: Number(e.target.value) }))}
                                        className="w-full p-2.5 rounded-lg border border-input bg-background/50 focus:bg-background transition-colors"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">人員稼動率報表的目標基準線。</p>
                                </div>
                            </div>
                            <div className="mt-4 bg-muted/30 border border-border/50 rounded-lg p-4">
                                <p className="text-sm font-semibold mb-2">💡 公式說明</p>
                                <ul className="text-xs text-muted-foreground space-y-1">
                                    <li>• <strong>專案毛利</strong> = 合約金額 − 直接人力成本 − (直接成本 × 管銷費用分攤率)</li>
                                    <li>• <strong>達標判定</strong>：毛利率 ≥ 目標毛利率 → 綠色; &lt; 目標 → 紅色警示</li>
                                    <li>• <strong>稼動率</strong> = (實際可計費時數 / 月標準工時) × 100%</li>
                                    <li>• <strong>SLA 達成率</strong> = (準時完成工單數 / 總工單數) × 100%</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
