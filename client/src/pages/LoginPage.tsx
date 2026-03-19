import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../lib/msal";
import { CircleHelp, LogIn, Mail, Lock, ShieldAlert, Rocket } from "lucide-react";
import { useAuth } from "../lib/auth";

const DEMO_ACCOUNTS = [
    { label: "管理員", email: "demo_admin@demo.com", helper: "可查看全部模組與系統設定" },
    { label: "主管", email: "demo_manager@demo.com", helper: "可檢視儀表板、審核與分析" },
    { label: "業務", email: "demo_business@demo.com", helper: "聚焦商機與售前流程" },
    { label: "PM", email: "demo_pm@demo.com", helper: "聚焦專案、SR 與變更流程" },
    { label: "技術", email: "demo_tech@demo.com", helper: "聚焦工時、待辦與執行作業" },
] as const;

const toFriendlyErrorMessage = (message: string) => {
    if (!message) {
        return "登入失敗，請稍後再試";
    }

    if (message.includes("JWT_SECRET") || message.includes("系統設定不完整")) {
        return "系統設定不完整，請聯絡管理員";
    }

    if (message.includes("使用者不存在") || message.includes("密碼錯誤")) {
        return "登入失敗，請檢查帳號或密碼";
    }

    if (message.includes("Demo 登入目前未開放")) {
        return "目前環境未開放 Demo 登入";
    }

    if (message.includes("Demo 帳號") || message.includes("Demo 資料初始化")) {
        return message;
    }

    if (message.includes("Microsoft")) {
        return "Microsoft 驗證失敗，請稍後再試";
    }

    return "登入失敗，請稍後再試";
};

export function LoginPage() {
    const { instance } = useMsal();
    const { setAuthToken } = useAuth();
    
    // Form state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Mutations
    const { data: demoStatus } = trpc.auth.demoStatus.useQuery(undefined, {
        staleTime: 60_000,
        retry: false,
    });
    const loginMutation = trpc.auth.login.useMutation();
    const entraLoginMutation = trpc.auth.entraLogin.useMutation();
    const demoLoginMutation = trpc.auth.demoLogin.useMutation();

    const handleLoginSuccess = (token: string) => {
        setAuthToken(token);
        window.location.href = "/";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!email || !password) { setError("請輸入帳號和密碼"); return; }
        
        setIsLoading(true);
        try {
            const res = await loginMutation.mutateAsync({ email, password });
            handleLoginSuccess(res.token);
        } catch (err: any) {
            setError(toFriendlyErrorMessage(err.message || ""));
        } finally {
            setIsLoading(false);
        }
    };

    const handleDemoLogin = async (demoEmail: string) => {
        setError("");
        setIsLoading(true);
        try {
            const res = await demoLoginMutation.mutateAsync({ email: demoEmail });
            handleLoginSuccess(res.token);
        } catch (err: any) {
            setError(toFriendlyErrorMessage(err.message || ""));
        } finally {
            setIsLoading(false);
        }
    };

    const handleMicrosoftLogin = async () => {
        setError("");
        setIsLoading(true);
        try {
            // 彈出 MS 登入窗
            const loginResponse = await instance.loginPopup(loginRequest);
            const accessToken = loginResponse.accessToken;

            // 後端換取本系統 JWT
            const res = await entraLoginMutation.mutateAsync({ accessToken });
            handleLoginSuccess(res.token);
        } catch (err: any) {
            if (err.name !== "BrowserAuthError") { // 略過使用者取消登入
                setError(toFriendlyErrorMessage(err.message || ""));
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/50 to-background">
            <div className="w-full max-w-md p-2">
                <div className="bg-card border border-border rounded-2xl shadow-xl p-8 space-y-6">
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                            <LogIn className="w-6 h-6 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">PMP 專案管理系統</h1>
                        <p className="text-sm text-muted-foreground">歡迎回來，請選擇登入方式</p>
                    </div>

                    {error && (
                        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">電子信箱</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                <input 
                                    type="email" 
                                    placeholder="your@email.com" 
                                    className="w-full pl-10 pr-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">密碼</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                <input 
                                    type="password" 
                                    placeholder="••••••••" 
                                    className="w-full pl-10 pr-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                    required
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-2 rounded-lg font-medium transition-all shadow-md mt-2 disabled:opacity-50"
                        >
                            {isLoading ? "處理中..." : "帳密登入"}
                        </button>
                    </form>

                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="rounded-full bg-primary/10 p-2 text-primary">
                                {demoStatus?.enabled ? <Rocket className="w-4 h-4" /> : <CircleHelp className="w-4 h-4" />}
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold">{demoStatus?.enabled ? "快速體驗 Demo" : "此環境尚未開放 Demo"}</h2>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {demoStatus?.enabled
                                        ? "一鍵登入測試角色，系統會自動寫入合法 JWT，不需要手動輸入測試帳密。"
                                        : "若你是管理員，可依下方步驟啟用 Demo 體驗；一般使用者請改用正式帳號登入。"}
                                </p>
                            </div>
                        </div>

                        {demoStatus?.enabled ? (
                            <>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {DEMO_ACCOUNTS.map((account) => (
                                        <button
                                            key={account.email}
                                            type="button"
                                            disabled={isLoading}
                                            onClick={() => handleDemoLogin(account.email)}
                                            className="rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                                        >
                                            <div className="text-sm font-medium">Demo {account.label}</div>
                                            <div className="text-[11px] text-muted-foreground mt-1">{account.helper}</div>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    {demoStatus?.seeded
                                        ? "已偵測到 Demo 帳號，可直接使用上方快速登入。"
                                        : "尚未建立 Demo 資料，請先執行資料初始化。"}
                                </p>
                            </>
                        ) : (
                            <div className="rounded-lg border border-dashed border-border bg-background/80 p-3">
                                <div className="text-xs font-semibold text-foreground">管理員啟用方式</div>
                                <ol className="mt-2 space-y-1 list-decimal pl-4 text-[11px] text-muted-foreground">
                                    <li>在本機 `.env` 或 Azure App Service 新增 `DEMO_LOGIN_ENABLED=true`。</li>
                                    <li>確認已設定 `JWT_SECRET` 與 `MONGODB_URI`。</li>
                                    <li>執行 `pnpm seed:demo` 建立 Demo 帳號資料。</li>
                                    <li>重新部署或重啟服務後，再回到此頁使用 Demo 快速登入。</li>
                                </ol>
                            </div>
                        )}
                    </div>

                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">或使用企業登入</span></div>
                    </div>

                    <button 
                        onClick={handleMicrosoftLogin}
                        disabled={isLoading}
                        className="w-full border border-border hover:bg-muted/50 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                        Sign in with Microsoft
                    </button>
                </div>
            </div>
        </div>
    );
}
