import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../lib/msal";
import { CircleHelp, LogIn, Mail, Lock, ShieldAlert, Rocket } from "lucide-react";
import { useAuth } from "../lib/auth";
import type { Role } from "../../../shared/types";

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
    const { instance, accounts, inProgress } = useMsal();
    const { setAuthSession } = useAuth();
    
    // Form state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingMsal, setIsProcessingMsal] = useState(false);

    // Mutations
    const { data: demoStatus } = trpc.auth.demoStatus.useQuery(undefined, {
        staleTime: 60_000,
        retry: false,
    });
    const { data: entraConfig } = trpc.auth.entraConfig.useQuery(undefined, {
        staleTime: 5 * 60_000,
        retry: false,
    });
    const loginMutation = trpc.auth.login.useMutation();
    const entraLoginMutation = trpc.auth.entraLogin.useMutation();
    const demoLoginMutation = trpc.auth.demoLogin.useMutation();

    const handleLoginSuccess = (payload: { token: string; user?: { id: string; email: string; name: string; role: Role; roles: Role[]; isActive: boolean } | null }) => {
        setAuthSession(payload.token, payload.user ?? null);
        window.location.href = "/";
    };

    // Auto-login logic for MSAL redirect flow
    useEffect(() => {
        if (inProgress === "none" && accounts.length > 0 && !isProcessingMsal && !error) {
            setIsProcessingMsal(true);
            setIsLoading(true);
            const account = accounts[0];
            instance.acquireTokenSilent({ ...loginRequest, account })
                .then(async (tokenResponse) => {
                    if (tokenResponse?.accessToken) {
                        const res = await entraLoginMutation.mutateAsync({ accessToken: tokenResponse.accessToken });
                        handleLoginSuccess(res);
                    }
                })
                .catch((err: any) => {
                    setError(toFriendlyErrorMessage(err.message || ""));
                    setIsLoading(false);
                });
        }
    }, [inProgress, accounts, instance, isProcessingMsal, error]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!email || !password) { setError("請輸入帳號和密碼"); return; }
        
        setIsLoading(true);
        try {
            const res = await loginMutation.mutateAsync({ email, password });
            handleLoginSuccess(res);
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
            handleLoginSuccess(res);
        } catch (err: any) {
            setError(toFriendlyErrorMessage(err.message || ""));
        } finally {
            setIsLoading(false);
        }
    };

    const handleMicrosoftLogin = async () => {
        if (!entraConfig?.enabled) {
            setError("此環境尚未啟用 Microsoft Entra ID SSO");
            return;
        }

        setError("");
        setIsLoading(true);
        try {
            await instance.loginRedirect(loginRequest);
        } catch (err: any) {
            setError(toFriendlyErrorMessage(err.message || ""));
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

                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">或使用企業登入</span></div>
                    </div>

                    <div className="space-y-3">
                        <button
                            onClick={handleMicrosoftLogin}
                            disabled={isLoading || !entraConfig?.enabled}
                            className="w-full border border-border hover:bg-muted/50 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                            Sign in with Microsoft
                        </button>
                        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            {entraConfig?.enabled
                                ? "已啟用 Entra ID SSO，首次登入會自動建立或更新對應帳號資料。"
                                : "尚未啟用 Entra ID SSO，請由管理員至系統設定完成 Tenant ID / Client ID / Client Secret 設定。"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
