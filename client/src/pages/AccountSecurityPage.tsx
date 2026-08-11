import { useState } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/auth";
import { useCurrentUser } from "../lib/useCurrentUser";

export function AccountSecurityPage() {
    const { user } = useCurrentUser();
    const { setAuthSession } = useAuth();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const changePassword = trpc.auth.changePassword.useMutation({
        onSuccess: (result) => {
            setAuthSession(result.token, {
                ...result.user,
                isPlatformOwner: result.user.isPlatformOwner === true,
                provider: result.user.provider || "manual",
                passwordConfigured: result.user.passwordConfigured === true,
                passwordChangedAt: result.user.passwordChangedAt
            });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            toast.success("密碼已更新，其他登入工作階段已失效");
        },
        onError: (error) => toast.error(error.message)
    });

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        changePassword.mutate({ currentPassword, newPassword, confirmPassword });
    };

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">帳號安全</h1>
                        <p className="text-sm text-muted-foreground">密碼不會顯示於前端，系統只保存不可逆的加鹽雜湊。</p>
                    </div>
                </div>
                <div className="mt-5 grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2">
                    <div><span className="text-muted-foreground">登入帳號：</span>{user?.email}</div>
                    <div><span className="text-muted-foreground">登入方式：</span>{user?.provider === "entra" ? "Microsoft Entra ID" : "本機密碼"}</div>
                    <div><span className="text-muted-foreground">密碼狀態：</span>{user?.passwordConfigured ? "已設定" : "未設定"}</div>
                    <div><span className="text-muted-foreground">最後修改：</span>{user?.passwordChangedAt ? new Date(user.passwordChangedAt).toLocaleString() : "尚無紀錄"}</div>
                </div>
            </div>

            {user?.provider === "entra" ? (
                <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
                    此帳號使用 Microsoft Entra ID，請至組織的身分管理入口修改密碼。
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
                    <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">修改密碼</h2></div>
                    {[
                        ["目前密碼", currentPassword, setCurrentPassword],
                        ["新密碼", newPassword, setNewPassword],
                        ["確認新密碼", confirmPassword, setConfirmPassword]
                    ].map(([label, value, setter]) => (
                        <label key={label as string} className="block space-y-1.5">
                            <span className="text-sm font-medium">{label as string}</span>
                            <input
                                type="password"
                                autoComplete={label === "目前密碼" ? "current-password" : "new-password"}
                                value={value as string}
                                onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)}
                                required
                                className="w-full rounded-lg border bg-background px-3 py-2.5"
                            />
                        </label>
                    ))}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
                        新密碼至少 12 字元，並包含英文大小寫、數字及特殊符號；不可包含帳號或姓名。
                    </div>
                    <button disabled={changePassword.isPending} className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                        <Lock className="mr-2 h-4 w-4" />{changePassword.isPending ? "更新中…" : "更新密碼"}
                    </button>
                </form>
            )}
        </div>
    );
}
