import { useState, useEffect, useRef } from "react";
import { trpc } from "../lib/trpc";
import { Users as UsersIcon, Edit, UserX, UserPlus, Search, Loader2, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { z } from "zod";
import { featurePermissions, roles, type FeaturePermission, type Role } from "../../../shared/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebounce } from "../lib/useDebounce";
import { toast } from "react-hot-toast";
import { useCurrentUser } from "../lib/useCurrentUser";

const userSchema = z.object({
    name: z.string().min(1, "姓名不可為空"),
    email: z.string().email("請輸入有效的電子郵件"),
    password: z.string().optional(),
    department: z.string().optional(),
    role: z.enum(roles),
    roles: z.array(z.enum(roles)).optional(),
    isActive: z.boolean().default(true)
});

const editableRoles = ["admin", "manager", "pm", "presales", "tech", "user"] as const;

const editUserSchema = z.object({
    department: z.string().optional(),
    managedDepartments: z.array(z.string()).optional(),
    role: z.enum(editableRoles),
    roles: z.array(z.enum(roles)).optional(),
    permissionOverrides: z.object({
        allow: z.array(z.enum(featurePermissions)),
        deny: z.array(z.enum(featurePermissions))
    }),
    isActive: z.boolean().default(true)
});

const permissionLabels: Record<FeaturePermission, string> = {
    "module.opportunities.view": "檢視商機管理",
    "module.projects.view": "檢視專案管理",
    "module.calendar.view": "檢視排程行事曆",
    "project.create_sr": "建立 SR",
    "project.edit": "編輯專案",
    "project.manage_members": "管理專案成員",
    "project.archive": "封存／還原專案",
    "project.delete": "永久刪除專案",
    "wbs.submit": "編輯與送審 WBS",
    "wbs.review": "審核 WBS"
};

export function UserManagementPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] = useState("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const { user: currentUser } = useCurrentUser();
    const canDelete = currentUser?.email?.trim().toLowerCase() === "demo@demo.com";

    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    const {
        data,
        isLoading,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = trpc.users.list.useInfiniteQuery(
        { limit: 20, search: debouncedSearchTerm, sortBy, sortOrder },
        { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

    const observerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
            }
        });
        if (observerRef.current) observer.observe(observerRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    // Flatten the infinite pages into a single array
    const users = (data?.pages.flatMap(page => page.items) || []) as any[];
    const utils = trpc.useUtils();
    const refreshUsers = async () => {
        await utils.users.list.invalidate();
        await refetch();
    };
    const updateUser = trpc.users.updateUser.useMutation({ onSuccess: () => { setEditingUser(null); void refreshUsers(); } });
    const deleteUser = trpc.users.deleteManual.useMutation({ onSuccess: () => { void refreshUsers(); } });
    const createUser = trpc.users.createManual.useMutation({ onSuccess: () => { setIsCreatingUser(false); createForm.reset(); void refreshUsers(); } });
    
    const syncEntraUsers = trpc.users.syncEntraUsers.useMutation({
        onSuccess: async () => {
            await utils.users.list.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "Entra ID 同步失敗");
        }
    });

    const clearAllEntraUsers = trpc.users.clearAllEntraUsers.useMutation({
        onSuccess: async (data) => {
            toast.success(`已刪除 ${data.deletedCount} 筆舊的 Entra ID 帳號`);
            await utils.users.list.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "刪除舊帳號失敗");
        }
    });

    const updateBatchRoles = trpc.users.updateBatchRoles.useMutation({
        onSuccess: () => {
            setIsBatchEditing(false);
            setSelectedUserIds([]);
            void refreshUsers();
        }
    });

    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [isCreatingUser, setIsCreatingUser] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [isBatchEditing, setIsBatchEditing] = useState(false);

    const createForm = useForm<any>({
        resolver: zodResolver(userSchema) as any,
        defaultValues: { name: "", email: "", password: "", department: "", role: "user", isActive: true, roles: [] }
    });

    const editForm = useForm<any>({
        resolver: zodResolver(editUserSchema) as any,
        defaultValues: {
            department: "",
            managedDepartments: [],
            role: "user",
            isActive: true,
            roles: [],
            permissionOverrides: { allow: [], deny: [] }
        }
    });

    const batchEditForm = useForm<any>({
        defaultValues: { department: "", role: "user", roles: [] }
    });

    useEffect(() => {
        if (editingUser) {
            editForm.reset({
                department: editingUser.department || "",
                managedDepartments: editingUser.managedDepartments || [],
                role: editingUser.role,
                isActive: editingUser.isActive,
                roles: (editingUser.roles || []) as Role[]
                ,
                permissionOverrides: editingUser.permissionOverrides || { allow: [], deny: [] }
            });
        }
    }, [editingUser, editForm]);

    const filteredUsers = users; // 已經由後端過濾

    const handleEditClick = (user: any) => {
        setEditingUser(user);
    };

    const handleSave = (values: any) => {
        if (!editingUser) return;
        updateUser.mutate({
            id: editingUser.id,
            department: values.department,
            managedDepartments: values.managedDepartments || [],
            role: values.role,
            isActive: values.isActive,
            roles: (values.roles || []) as Role[]
            ,
            permissionOverrides: values.permissionOverrides
        });
    };

    const handleCreate = (values: any) => {
        createUser.mutate({
            name: values.name,
            email: values.email,
            password: values.password || undefined,
            department: values.department,
            role: values.role,
            isActive: values.isActive,
            roles: (values.roles || []) as Role[]
        });
    };

    const handleDelete = (id: string, name: string) => {
        if (confirm(`確定要刪除使用者 ${name} 嗎？此動作無法復原。`)) {
            deleteUser.mutate({ id });
        }
    };

    const handleSyncEntraUsers = () => {
        toast.promise(syncEntraUsers.mutateAsync(), {
            loading: "正在與 Microsoft Entra ID 同步...",
            success: "同步完成",
            error: "同步失敗"
        });
    };

    const handleClearEntraUsers = () => {
        if (confirm("系統會重新向 Microsoft Entra ID 取得目前帳號清單，並永久刪除本系統中已不存在於 Entra ID 的舊同步帳號。\n手動建立的帳號不會受影響。\n\n確定要刪除舊帳號嗎？")) {
            clearAllEntraUsers.mutate();
        }
    };

    const handleRoleToggle = (roleName: Role, currentRoles: Role[], onChange: (roles: Role[]) => void) => {
        const hasRole = currentRoles.includes(roleName);
        if (hasRole) {
            onChange(currentRoles.filter(r => r !== roleName));
        } else {
            onChange([...currentRoles, roleName]);
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedUserIds(filteredUsers.map(u => u.id));
        } else {
            setSelectedUserIds([]);
        }
    };

    const handleSelectUser = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedUserIds(prev => [...prev, id]);
        } else {
            setSelectedUserIds(prev => prev.filter(uid => uid !== id));
        }
    };

    const handleBatchSave = (values: any) => {
        updateBatchRoles.mutate({
            userIds: selectedUserIds,
            department: values.department || undefined,
            role: values.role,
            roles: (values.roles || []) as Role[]
        });
    };

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;

    const availableSecondaryRoles: Role[] = ["pm", "presales", "tech", "business"];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">用戶管理 (User Management)</h2>
                    <p className="text-muted-foreground mt-1">管理系統帳號、權限角色、部門資訊與 Entra ID 同步</p>
                </div>
                <div className="flex items-center gap-3">
                    {selectedUserIds.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setIsBatchEditing(true)}
                            className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md"
                        >
                            <Settings2 className="w-4 h-4 mr-2" />
                            批次修改權限 ({selectedUserIds.length})
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleSyncEntraUsers}
                        disabled={syncEntraUsers.isPending || clearAllEntraUsers.isPending}
                        className="border border-border bg-background hover:bg-muted/60 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${syncEntraUsers.isPending ? "animate-spin" : ""}`} />
                        {syncEntraUsers.isPending ? "同步中..." : "同步 Entra ID"}
                    </button>
                    {canDelete && (
                        <button
                            type="button"
                            onClick={handleClearEntraUsers}
                            disabled={clearAllEntraUsers.isPending || syncEntraUsers.isPending}
                            className="border border-destructive/20 text-destructive bg-destructive/5 hover:bg-destructive/10 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-sm disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {clearAllEntraUsers.isPending ? "刪除中..." : "刪除舊帳號"}
                        </button>
                    )}
                    <button
                        onClick={() => setIsCreatingUser(true)}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md hover:shadow-lg">
                        <UserPlus className="w-4 h-4 mr-2" />
                        新增手動帳號
                    </button>
                </div>
            </div>

            {syncEntraUsers.data && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                    Entra ID 同步完成：共抓取 {syncEntraUsers.data.totalFetched} 筆目錄資料，成功同步 {syncEntraUsers.data.totalSynced} 筆，其中新增 {syncEntraUsers.data.created} 筆、更新 {syncEntraUsers.data.updated} 筆、停用 {syncEntraUsers.data.disabled} 筆、刪除舊帳號 {syncEntraUsers.data.deleted} 筆。
                </div>
            )}

            {clearAllEntraUsers.data && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-foreground">
                    舊帳號清理完成：共比對 {clearAllEntraUsers.data.totalFetched} 筆 Entra ID 目錄資料，刪除 {clearAllEntraUsers.data.deletedCount} 筆已不存在於 Entra ID 的同步帳號。
                </div>
            )}

            <div className="bg-card border rounded-xl shadow-sm p-4 flex justify-between items-center flex-wrap gap-4">
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜尋人員姓名、信箱或部門..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">排序:</span>
                    <select 
                        value={`${sortBy}-${sortOrder}`}
                        onChange={(e) => {
                            const [field, order] = e.target.value.split("-");
                            setSortBy(field);
                            setSortOrder(order as "asc" | "desc");
                        }}
                        className="text-sm border border-border rounded-md px-3 py-1.5 bg-background font-semibold hover:border-primary/50 transition-colors focus:outline-none cursor-pointer"
                    >
                        <option value="name-asc">姓名 (A - Z)</option>
                        <option value="name-desc">姓名 (Z - A)</option>
                        <option value="email-asc">依 Email 排序</option>
                        <option value="role-asc">依主角色排序</option>
                    </select>
                </div>
            </div>

            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-6 py-3 font-medium w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                        className="rounded border-gray-300 text-primary w-4 h-4 cursor-pointer"
                                    />
                                </th>
                                <th className="px-6 py-3 font-medium">用戶姓名</th>
                                <th className="px-6 py-3 font-medium">電子郵件</th>
                                <th className="px-6 py-3 font-medium">部門</th>
                                <th className="px-6 py-3 font-medium">管理部門</th>
                                <th className="px-6 py-3 font-medium">登入來源</th>
                                <th className="px-6 py-3 font-medium">主角色 (Role)</th>
                                <th className="px-6 py-3 font-medium">副角色 (Roles)</th>
                                <th className="px-6 py-3 font-medium text-center">狀態</th>
                                <th className="px-6 py-3 font-medium text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredUsers?.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">找不到符合的人員</td>
                                </tr>
                            ) : (
                                filteredUsers?.map((user) => (
                                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedUserIds.includes(user.id)}
                                                onChange={(e) => handleSelectUser(user.id, e.target.checked)}
                                                className="rounded border-gray-300 text-primary w-4 h-4 cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-medium">{user.name}</td>
                                        <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
                                        <td className="px-6 py-4 text-muted-foreground">{user.department || "-"}</td>
                                        <td className="px-6 py-4 text-muted-foreground text-xs">
                                            {user.managedDepartments && user.managedDepartments.length > 0
                                                ? user.managedDepartments.join(", ")
                                                : "-"}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${user.provider === "entra" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}`}>
                                                {user.provider === "entra" ? "Entra ID" : "Manual"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-semibold uppercase">{user.role}</td>
                                        <td className="px-6 py-4 uppercase text-xs text-muted-foreground">
                                            {user.roles && user.roles.length > 0 ? user.roles.join(', ') : "-"}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {user.isActive ? "啟用" : "停用"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => handleEditClick(user)}
                                                className="p-2 text-primary hover:bg-primary/10 rounded-md transition-colors"
                                                title="編輯用戶"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            {canDelete && user.provider === "manual" && (
                                                <button
                                                    onClick={() => handleDelete(user.id, user.name)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors ml-2"
                                                    title="刪除帳號"
                                                >
                                                    <UserX className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div ref={observerRef} className="flex justify-center mt-6">
                {isFetchingNextPage && (
                    <div className="text-muted-foreground text-sm flex items-center gap-1">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" /> 載入中...
                    </div>
                )}
            </div>

            {/* Batch Edit Modal */}
            <Dialog open={isBatchEditing} onOpenChange={setIsBatchEditing}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <Settings2 className="w-5 h-5 text-indigo-600" />
                            <span>批次修改權限 ({selectedUserIds.length} 人)</span>
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...batchEditForm}>
                        <form onSubmit={batchEditForm.handleSubmit(handleBatchSave as any)} className="space-y-4">
                            <FormField
                                control={batchEditForm.control}
                                name="department"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>批次設定部門 (選填)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="留空代表不更動" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={batchEditForm.control}
                                name="role"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>主角色 (Role)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="user">USER</SelectItem>
                                                <SelectItem value="admin">ADMIN</SelectItem>
                                                <SelectItem value="manager">MANAGER</SelectItem>
                                                <SelectItem value="pm">PM</SelectItem>
                                                <SelectItem value="presales">PRESALES</SelectItem>
                                                <SelectItem value="tech">TECH</SelectItem>
                                                <SelectItem value="business">BUSINESS</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={batchEditForm.control}
                                name="roles"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>副角色 (Secondary Roles)</FormLabel>
                                        <div className="flex flex-wrap gap-2">
                                            {availableSecondaryRoles.map(r => (
                                                <label key={r} className="flex items-center space-x-2 bg-muted/50 px-3 py-1.5 rounded-md border">
                                                    <input
                                                        type="checkbox"
                                                        checked={(field.value ?? []).includes(r)}
                                                        onChange={() => handleRoleToggle(r, field.value ?? [], field.onChange)}
                                                        className="rounded border-input text-primary focus:ring-primary"
                                                    />
                                                    <span className="text-sm font-medium uppercase">{r}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="mt-6 flex justify-end space-x-3">
                                <Button type="button" variant="outline" onClick={() => setIsBatchEditing(false)}>
                                    取消
                                </Button>
                                <Button type="submit" disabled={updateBatchRoles.isPending}>
                                    {updateBatchRoles.isPending ? "套用中..." : "套用變更"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <UsersIcon className="w-5 h-5 text-primary" />
                            <span>編輯用戶 - {editingUser?.name}</span>
                        </DialogTitle>
                    </DialogHeader>
                    {editingUser && (
                        <Form {...editForm}>
                            <form onSubmit={editForm.handleSubmit(handleSave as any)} className="space-y-4">
                                <FormField
                                    control={editForm.control}
                                    name="department"
                                    render={({ field }: any) => (
                                        <FormItem>
                                            <FormLabel>部門 (Department)</FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editForm.control}
                                    name="role"
                                    render={({ field }: any) => (
                                        <FormItem>
                                            <FormLabel>主角色 (Role)</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="user">USER</SelectItem>
                                                    <SelectItem value="admin">ADMIN</SelectItem>
                                                    <SelectItem value="manager">MANAGER</SelectItem>
                                                    <SelectItem value="pm">PM</SelectItem>
                                                    <SelectItem value="presales">PRESALES</SelectItem>
                                                    <SelectItem value="tech">TECH</SelectItem>
                                                    <SelectItem value="business">BUSINESS</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editForm.control}
                                    name="managedDepartments"
                                    render={({ field }: any) => (
                                        <FormItem>
                                            <FormLabel>管理部門 (Managed Departments)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="輸入部門代碼，以逗號分隔，例如: IE0C00, IE0C30"
                                                    value={(field.value || []).join(", ")}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        const depts = raw.split(",").map((s: string) => s.trim()).filter(Boolean);
                                                        field.onChange(depts);
                                                    }}
                                                />
                                            </FormControl>
                                            <p className="text-xs text-muted-foreground">僅 manager 角色需要設定。設定後該主管可看到指定部門的所有案件與報表</p>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={editForm.control}
                                    name="roles"
                                    render={({ field }: any) => (
                                        <FormItem>
                                            <FormLabel>副角色 (Secondary Roles)</FormLabel>
                                            <div className="flex flex-wrap gap-2">
                                                {availableSecondaryRoles.map(r => (
                                                    <label key={r} className="flex items-center space-x-2 bg-muted/50 px-3 py-1.5 rounded-md border">
                                                        <input
                                                            type="checkbox"
                                                            checked={field.value.includes(r)}
                                                            onChange={() => handleRoleToggle(r, field.value, field.onChange)}
                                                            className="rounded border-input text-primary focus:ring-primary"
                                                        />
                                                        <span className="text-sm font-medium uppercase">{r}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="space-y-3 rounded-lg border border-border p-4">
                                    <div>
                                        <p className="text-sm font-medium">帳號功能權限覆寫</p>
                                        <p className="mt-1 text-xs text-muted-foreground">未設定時沿用角色預設；拒絕優先於允許。</p>
                                    </div>
                                    <div className="space-y-2">
                                        {featurePermissions.map(permission => {
                                            const allow = editForm.watch("permissionOverrides.allow") || [];
                                            const deny = editForm.watch("permissionOverrides.deny") || [];
                                            const mode = deny.includes(permission) ? "deny" : allow.includes(permission) ? "allow" : "default";
                                            return (
                                                <div key={permission} className="grid grid-cols-[1fr_140px] items-center gap-3 rounded-md bg-muted/30 px-3 py-2">
                                                    <span className="text-sm">{permissionLabels[permission]}</span>
                                                    <select
                                                        value={mode}
                                                        onChange={event => {
                                                            const nextMode = event.target.value;
                                                            editForm.setValue(
                                                                "permissionOverrides.allow",
                                                                nextMode === "allow"
                                                                    ? Array.from(new Set([...allow, permission]))
                                                                    : allow.filter((item: FeaturePermission) => item !== permission),
                                                                { shouldDirty: true }
                                                            );
                                                            editForm.setValue(
                                                                "permissionOverrides.deny",
                                                                nextMode === "deny"
                                                                    ? Array.from(new Set([...deny, permission]))
                                                                    : deny.filter((item: FeaturePermission) => item !== permission),
                                                                { shouldDirty: true }
                                                            );
                                                        }}
                                                        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                                                    >
                                                        <option value="default">角色預設</option>
                                                        <option value="allow">明確允許</option>
                                                        <option value="deny">明確拒絕</option>
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => editForm.setValue("permissionOverrides", { allow: [], deny: [] }, { shouldDirty: true })}
                                        className="text-xs font-medium text-primary hover:underline"
                                    >
                                        恢復全部角色預設
                                    </button>
                                </div>
                                <FormField
                                    control={editForm.control}
                                    name="isActive"
                                    render={({ field }: any) => (
                                        <FormItem className="flex items-center space-x-2 space-y-0 mt-4 pt-4 border-t">
                                            <FormControl>
                                                <input
                                                    type="checkbox"
                                                    checked={field.value}
                                                    onChange={field.onChange}
                                                    className="rounded border-input text-primary focus:ring-primary"
                                                />
                                            </FormControl>
                                            <FormLabel className="font-medium">帳號啟用 (Active)</FormLabel>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="mt-6 flex justify-end space-x-3">
                                    <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                                        取消
                                    </Button>
                                    <Button type="submit" disabled={updateUser.isPending}>
                                        {updateUser.isPending ? "儲存中..." : "儲存設定"}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create Modal */}
            <Dialog open={isCreatingUser} onOpenChange={setIsCreatingUser}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                            <UserPlus className="w-5 h-5 text-primary" />
                            <span>新增手動帳號</span>
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...createForm}>
                        <form onSubmit={createForm.handleSubmit(handleCreate as any)} className="space-y-4">
                            <FormField
                                control={createForm.control}
                                name="name"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>姓名 (Name) *</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={createForm.control}
                                name="email"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>電子郵件 (Email) *</FormLabel>
                                        <FormControl>
                                            <Input type="email" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={createForm.control}
                                name="password"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>密碼 (Password)</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="留空代表不設定密碼" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={createForm.control}
                                name="department"
                                render={({ field }: any) => (
                                    <FormItem>
                                        <FormLabel>部門 (Department)</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={createForm.control}
                                name="role"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>主角色 (Role)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="user">USER</SelectItem>
                                                <SelectItem value="admin">ADMIN</SelectItem>
                                                <SelectItem value="manager">MANAGER</SelectItem>
                                                <SelectItem value="pm">PM</SelectItem>
                                                <SelectItem value="presales">PRESALES</SelectItem>
                                                <SelectItem value="tech">TECH</SelectItem>
                                                <SelectItem value="business">BUSINESS</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={createForm.control}
                                name="roles"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>副角色 (Secondary Roles)</FormLabel>
                                        <div className="flex flex-wrap gap-2">
                                            {availableSecondaryRoles.map(r => (
                                                <label key={r} className="flex items-center space-x-2 bg-muted/50 px-3 py-1.5 rounded-md border">
                                                    <input
                                                        type="checkbox"
                                                        checked={(field.value ?? []).includes(r)}
                                                        onChange={() => handleRoleToggle(r, field.value ?? [], field.onChange)}
                                                        className="rounded border-input text-primary focus:ring-primary"
                                                    />
                                                    <span className="text-sm font-medium uppercase">{r}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="mt-6 flex justify-end space-x-3">
                                <Button type="button" variant="outline" onClick={() => setIsCreatingUser(false)}>
                                    取消
                                </Button>
                                <Button type="submit" disabled={createUser.isPending}>
                                    {createUser.isPending ? "建立中..." : "建立帳號"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
