import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { Users as UsersIcon, Edit, UserX, UserPlus, Search } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const userSchema = z.object({
    name: z.string().min(1, "姓名不可為空"),
    email: z.string().email("請輸入有效的電子郵件"),
    department: z.string().optional(),
    role: z.enum(["admin", "manager", "pm", "presales", "tech", "business", "user"]),
    roles: z.array(z.string()).optional(),
    isActive: z.boolean().default(true)
});

const editUserSchema = z.object({
    department: z.string().optional(),
    role: z.enum(["admin", "manager", "pm", "presales", "tech", "user"]),
    roles: z.array(z.string()).optional(),
    isActive: z.boolean().default(true)
});

export function UserManagementPage() {
    const {
        data,
        isLoading,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = trpc.users.list.useInfiniteQuery(
        { limit: 20 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

    // Flatten the infinite pages into a single array
    const users = (data?.pages.flatMap(page => page.items) || []) as any[];
    const updateUser = trpc.users.updateUser.useMutation({ onSuccess: () => { setEditingUser(null); refetch() } });
    const deleteUser = trpc.users.deleteManual.useMutation({ onSuccess: () => refetch() });
    const createUser = trpc.users.createManual.useMutation({ onSuccess: () => { setIsCreatingUser(false); refetch(); createForm.reset(); } });

    const [searchTerm, setSearchTerm] = useState("");
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [isCreatingUser, setIsCreatingUser] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createForm = useForm<any>({
        resolver: zodResolver(userSchema) as any,
        defaultValues: { name: "", email: "", department: "", role: "user", isActive: true, roles: [] }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editForm = useForm<any>({
        resolver: zodResolver(editUserSchema) as any,
        defaultValues: { department: "", role: "user", isActive: true, roles: [] }
    });

    useEffect(() => {
        if (editingUser) {
            editForm.reset({
                department: editingUser.department || "",
                role: editingUser.role,
                isActive: editingUser.isActive,
                roles: editingUser.roles || []
            });
        }
    }, [editingUser, editForm]);

    const filteredUsers = users?.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.department && u.department.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleEditClick = (user: any) => {
        setEditingUser(user);
    };

    const handleSave = (values: z.infer<typeof editUserSchema>) => {
        if (!editingUser) return;
        updateUser.mutate({
            id: editingUser.id,
            department: values.department,
            role: values.role,
            isActive: values.isActive,
            roles: values.roles || []
        });
    };

    const handleCreate = (values: z.infer<typeof userSchema>) => {
        createUser.mutate({
            name: values.name,
            email: values.email,
            department: values.department,
            role: values.role,
            isActive: values.isActive,
            roles: values.roles || []
        });
    };

    const handleDelete = (id: number, name: string) => {
        if (confirm(`確定要刪除使用者 ${name} 嗎？此動作無法復原。`)) {
            deleteUser.mutate({ id });
        }
    };

    const handleRoleToggle = (roleName: string, currentRoles: string[], onChange: (roles: string[]) => void) => {
        const hasRole = currentRoles.includes(roleName);
        if (hasRole) {
            onChange(currentRoles.filter(r => r !== roleName));
        } else {
            onChange([...currentRoles, roleName]);
        }
    };

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>;

    const availableSecondaryRoles = ["pm", "presales", "tech", "business"];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">用戶管理 (User Management)</h2>
                    <p className="text-muted-foreground mt-1">管理系統帳號、權限角色與部門資訊</p>
                </div>
                <button
                    onClick={() => setIsCreatingUser(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-lg inline-flex items-center text-sm font-medium transition-all shadow-md hover:shadow-lg">
                    <UserPlus className="w-4 h-4 mr-2" />
                    新增手動帳號
                </button>
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
                                <th className="px-6 py-3 font-medium">用戶姓名</th>
                                <th className="px-6 py-3 font-medium">電子郵件</th>
                                <th className="px-6 py-3 font-medium">部門</th>
                                <th className="px-6 py-3 font-medium">主角色 (Role)</th>
                                <th className="px-6 py-3 font-medium">副角色 (Roles)</th>
                                <th className="px-6 py-3 font-medium text-center">狀態</th>
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
                                        <td className="px-6 py-4 font-medium">{user.name}</td>
                                        <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
                                        <td className="px-6 py-4 text-muted-foreground">{user.department || "-"}</td>
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
                                            {user.provider === "manual" && (
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

            {hasNextPage && (
                <div className="flex justify-center mt-6">
                    <Button
                        variant="outline"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                    >
                        {isFetchingNextPage ? "載入中..." : "載入更多"}
                    </Button>
                </div>
            )}

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
