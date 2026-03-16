import { trpc } from "../lib/trpc";
import { UserPlus, Trash2 } from "lucide-react";

export function UsersPage() {
    const { data: usersData, isLoading, refetch } = trpc.users.list.useQuery({ limit: 100 });
    const deleteMutation = trpc.users.deleteManual.useMutation({
        onSuccess: () => refetch()
    });

    if (isLoading) {
        return <div className="p-8 text-center">載入中...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">用戶管理</h2>
                    <p className="text-muted-foreground mt-1">管理員可查看所有帳號、設定角色</p>
                </div>
                <button className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md inline-flex items-center text-sm font-medium transition-colors">
                    <UserPlus className="w-4 h-4 mr-2" />
                    新增帳號
                </button>
            </div>

            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-6 py-3 font-medium">姓名 / Email</th>
                                <th className="px-6 py-3 font-medium">部門 / 職稱</th>
                                <th className="px-6 py-3 font-medium">主角色</th>
                                <th className="px-6 py-3 font-medium">附加角色</th>
                                <th className="px-6 py-3 font-medium">狀態/來源</th>
                                <th className="px-6 py-3 font-medium text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {usersData?.items?.map((user: any) => (
                                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-foreground">{user.name}</div>
                                        <div className="text-muted-foreground text-xs mt-0.5">{user.email}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-foreground">{user.department || "-"}</div>
                                        <div className="text-muted-foreground text-xs mt-0.5">{user.title || "-"}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2.5 py-0.5 justify-center rounded-full text-xs font-semibold bg-primary/10 text-primary capitalize">
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {user.roles?.length > 0 ? user.roles.map((r: string) => (
                                                <span key={r} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground border">
                                                    {r}
                                                </span>
                                            )) : <span className="text-muted-foreground text-xs">-</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-2">
                                            <span className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                            <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-muted font-medium tracking-wide">
                                                {user.provider}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end space-x-2">
                                            <button className="text-sm font-medium text-primary hover:underline px-2 py-1">
                                                編輯
                                            </button>
                                            {user.provider === "manual" && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`確定永久刪除使用者 ${user.name}?`)) {
                                                            deleteMutation.mutate({ id: user.id });
                                                        }
                                                    }}
                                                    className="text-sm font-medium text-destructive hover:bg-destructive/10 p-1.5 rounded transition-colors"
                                                    title="永久刪除"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
