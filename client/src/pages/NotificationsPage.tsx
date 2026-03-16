import { trpc } from "../lib/trpc";
import { Bell, CheckCircle2, Info, AlertTriangle, Clock } from "lucide-react";

export function NotificationsPage() {
    const { data, isLoading, refetch } = trpc.analytics.getNotifications.useQuery();
    const notifications = (data || []) as any[];
    const markRead = trpc.analytics.markNotificationRead.useMutation({
        onSuccess: () => refetch()
    });
    const markAllRead = trpc.analytics.markAllNotificationsRead.useMutation({
        onSuccess: () => refetch()
    });

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">載入通知中...</div>;

    const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

    const getIcon = (type: string) => {
        switch (type) {
            case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            case 'info': return <Info className="w-5 h-5 text-blue-500" />;
            case 'todo': return <Clock className="w-5 h-5 text-indigo-500" />;
            case 'approval': return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
            default: return <Bell className="w-5 h-5 text-gray-500" />;
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div className="flex items-center space-x-3">
                    <Bell className="w-8 h-8 text-primary" />
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">通知中心</h2>
                        <p className="text-muted-foreground mt-1">來自系統的提醒、審核請求與警告事項</p>
                    </div>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={() => markAllRead.mutate()}
                        disabled={markAllRead.isPending}
                        className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        全部標示為已讀
                    </button>
                )}
            </div>

            <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                {notifications?.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        目前沒有任何通知
                    </div>
                ) : (
                    <ul className="divide-y divide-border">
                        {notifications?.map((n: any) => (
                            <li
                                key={n.id}
                                className={`p-4 flex items-start space-x-4 transition-colors ${!n.isRead ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/30'}`}
                            >
                                <div className="mt-1 flex-shrink-0">
                                    {getIcon(n.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${!n.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                                        {n.message}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {new Date(n.createdAt).toLocaleString()}
                                    </p>
                                    {n.actionUrl && (
                                        <a href={n.actionUrl} className="text-xs text-primary hover:underline mt-2 inline-block">
                                            查看詳情 &rarr;
                                        </a>
                                    )}
                                </div>
                                {!n.isRead && (
                                    <button
                                        onClick={() => markRead.mutate({ id: n.id })}
                                        disabled={markRead.isPending}
                                        className="text-xs text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                                        title="標示為已讀"
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
