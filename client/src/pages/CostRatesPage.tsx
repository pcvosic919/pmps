import { useState } from "react";
import { trpc } from "../lib/trpc";
import { CreditCard, Edit, Search } from "lucide-react";

export function CostRatesPage() {
    const { data, isLoading, refetch } = trpc.users.getCostRates.useQuery();
    const usersWithRates = (data || []) as any[];
    const updateRate = trpc.users.updateCostRate.useMutation({
        onSuccess: () => {
            setEditingUser(null);
            refetch();
        }
    });

    const [searchTerm, setSearchTerm] = useState("");
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [editForm, setEditForm] = useState({ dailyRate: 0, hourlyRate: 0, currency: "TWD" });

    const filteredUsers = usersWithRates?.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.department && u.department.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleEditClick = (user: any) => {
        setEditingUser(user);
        setEditForm({
            dailyRate: user.costRate?.dailyRate || 0,
            hourlyRate: user.costRate?.hourlyRate || 0,
            currency: user.costRate?.currency || "TWD"
        });
    };

    const handleSave = () => {
        if (!editingUser) return;
        updateRate.mutate({
            userId: editingUser.id,
            dailyRate: Number(editForm.dailyRate),
            hourlyRate: Number(editForm.hourlyRate),
            currency: editForm.currency
        });
    };

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">費率設定 (Cost Rates)</h2>
                    <p className="text-muted-foreground mt-1">管理人員的日薪與時薪成本，用於精準計算專案成本</p>
                </div>
            </div>

            <div className="bg-card border rounded-xl shadow-sm p-4 flex justify-between items-center">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜尋人員姓名、信箱或部門..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-input bg-background"
                    />
                </div>
            </div>

            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-6 py-3 font-medium">人員</th>
                                <th className="px-6 py-3 font-medium">部門 / 職責</th>
                                <th className="px-6 py-3 font-medium text-right">日費率 (Daily)</th>
                                <th className="px-6 py-3 font-medium text-right">時薪 (Hourly)</th>
                                <th className="px-6 py-3 font-medium text-center">幣別</th>
                                <th className="px-6 py-3 font-medium text-right">最後更新</th>
                                <th className="px-6 py-3 font-medium text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredUsers?.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">找不到符合的人員</td>
                                </tr>
                            ) : (
                                filteredUsers?.map((user) => (
                                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium">{user.name}</div>
                                            <div className="text-xs text-muted-foreground">{user.email}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div>{user.department || "-"}</div>
                                            <div className="text-xs text-muted-foreground uppercase">{user.role}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium">
                                            {user.costRate ? user.costRate.dailyRate.toLocaleString() : "-"}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium">
                                            {user.costRate ? user.costRate.hourlyRate.toLocaleString() : "-"}
                                        </td>
                                        <td className="px-6 py-4 text-center text-muted-foreground">
                                            {user.costRate ? user.costRate.currency : "-"}
                                        </td>
                                        <td className="px-6 py-4 text-right text-muted-foreground text-xs">
                                            {user.costRate ? new Date(user.costRate.updatedAt).toLocaleDateString() : "-"}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => handleEditClick(user)}
                                                className="p-2 text-primary hover:bg-primary/10 rounded-md transition-colors"
                                                title="設定費率"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card w-full max-w-md rounded-xl shadow-lg border p-6">
                        <div className="flex items-center space-x-2 mb-4">
                            <CreditCard className="w-5 h-5 text-primary" />
                            <h3 className="text-xl font-bold">費率設定 - {editingUser.name}</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">幣別 (Currency)</label>
                                <select
                                    value={editForm.currency}
                                    onChange={e => setEditForm(prev => ({ ...prev, currency: e.target.value }))}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    <option value="TWD">TWD (新台幣)</option>
                                    <option value="USD">USD (美元)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">日費率 (Daily Rate)</label>
                                <input
                                    type="number"
                                    value={editForm.dailyRate}
                                    onChange={e => setEditForm(prev => ({ ...prev, dailyRate: Number(e.target.value) }))}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">時薪 (Hourly Rate)</label>
                                <input
                                    type="number"
                                    value={editForm.hourlyRate}
                                    onChange={e => setEditForm(prev => ({ ...prev, hourlyRate: Number(e.target.value) }))}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end space-x-3">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-accent transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={updateRate.isPending}
                                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                {updateRate.isPending ? "儲存中..." : "儲存設定"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
