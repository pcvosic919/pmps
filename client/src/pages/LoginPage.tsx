import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../lib/msal";
import { LogIn, Mail, Lock, ShieldAlert } from "lucide-react";

export function LoginPage() {
    const { instance } = useMsal();
    
    // Form state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Mutations
    const loginMutation = trpc.auth.login.useMutation();
    const entraLoginMutation = trpc.auth.entraLogin.useMutation();

    const handleLoginSuccess = (token: string) => {
        // 保存 Token 到 localStorage
        localStorage.setItem("pmp_auth_token", token);
        // 跳轉至首頁 (儀表板)
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
            setError(err.message || "登入失敗，請檢查帳號密碼");
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
                setError(err.message || "Microsoft 驗證失敗");
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
