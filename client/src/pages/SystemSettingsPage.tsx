import { useEffect, useState } from "react";
import { Settings, Save, Database, Shield, Layout, Bell } from "lucide-react";
import { toast } from "react-hot-toast";
import { trpc } from "../lib/trpc";

const defaultSettings = {
    companyName: "Demo Tech Corp",
    systemEmail: "noreply@demotech.com",
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
