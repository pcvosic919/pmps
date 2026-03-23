import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "./lib/trpc";
import { Route, Switch, useLocation } from "wouter";
import { AppLayout } from "./components/AppLayout";
import { MsalProvider, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { createMsalInstance } from "./lib/msal";
import { Toaster, toast } from "react-hot-toast";
import { useCurrentUser } from "./lib/useCurrentUser";
import { AuthProvider, useAuth } from "./lib/auth";
import { encryptPayload, decryptPayload } from "../../shared/crypto";

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage").then((module) => ({ default: module.UserManagementPage })));
const CostRatesPage = lazy(() => import("./pages/CostRatesPage").then((module) => ({ default: module.CostRatesPage })));
const UtilizationPage = lazy(() => import("./pages/UtilizationPage").then((module) => ({ default: module.UtilizationPage })));
const SettlementsPage = lazy(() => import("./pages/SettlementsPage").then((module) => ({ default: module.SettlementsPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const SystemSettingsPage = lazy(() => import("./pages/SystemSettingsPage").then((module) => ({ default: module.SystemSettingsPage })));
const CustomFieldsPage = lazy(() => import("./pages/CustomFieldsPage").then((module) => ({ default: module.CustomFieldsPage })));
const OpportunitiesPage = lazy(() => import("./pages/OpportunitiesPage").then((module) => ({ default: module.OpportunitiesPage })));
const ServiceRequestsPage = lazy(() => import("./pages/ServiceRequestsPage").then((module) => ({ default: module.ServiceRequestsPage })));
const ProjectTimesheetsPage = lazy(() => import("./pages/ProjectTimesheetsPage").then((module) => ({ default: module.ProjectTimesheetsPage })));
const PresalesTimesheetsPage = lazy(() => import("./pages/PresalesTimesheetsPage").then((module) => ({ default: module.PresalesTimesheetsPage })));
const KpiDashboardPage = lazy(() => import("./pages/KpiDashboardPage").then((module) => ({ default: module.KpiDashboardPage })));
const WbsManagementPage = lazy(() => import("./pages/WbsManagementPage").then((module) => ({ default: module.WbsManagementPage })));
const ChangeRequestsPage = lazy(() => import("./pages/ChangeRequestsPage").then((module) => ({ default: module.ChangeRequestsPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage").then((module) => ({ default: module.ResourcesPage })));
const OpportunityDetailPage = lazy(() => import("./pages/OpportunityDetailPage").then((module) => ({ default: module.OpportunityDetailPage })));
const ProjectManagementPage = lazy(() => import("./pages/ProjectManagementPage").then((module) => ({ default: module.ProjectManagementPage })));

type ActiveRouteDefinition = {
  path: string;
  component: ComponentType;
  pageFile: string;
  lifecycle: "保留 / 上線" | "保留 / 上線（權限控管）";
  notes: string;
};

type PageInventoryEntry = {
  pageFile: string;
  status: "保留 / 上線" | "保留 / 上線（權限控管）" | "移除" | "合併後移除";
  route: string;
  notes: string;
};

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h2 className="text-4xl font-bold mb-4">404</h2>
      <p className="text-muted-foreground mb-8">此頁面尚未實作或不存在 (Page not found)</p>
    </div>
  );
}

function AppLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      載入頁面中...
    </div>
  );
}

function RestrictedPage({ message = "您沒有權限檢視此頁面" }: { message?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-dashed bg-card text-muted-foreground">
      {message}
    </div>
  );
}

function ProjectManagementRoute() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <AppLoadingFallback />;
  }

  const canAccess = !!user && (user.role === "manager" || user.role === "pm" || user.roles.includes("manager") || user.roles.includes("pm"));
  return canAccess ? <ProjectManagementPage /> : <RestrictedPage message="只有 Manager 與 PM 可以檢視專案管理。" />;
}

const activeRoutes: ActiveRouteDefinition[] = [
  { path: "/", component: DashboardPage, pageFile: "DashboardPage.tsx", lifecycle: "保留 / 上線", notes: "主儀表板首頁。" },
  { path: "/resources", component: ResourcesPage, pageFile: "ResourcesPage.tsx", lifecycle: "保留 / 上線", notes: "資源池與人力配置視圖。" },
  { path: "/users", component: UserManagementPage, pageFile: "UserManagementPage.tsx", lifecycle: "保留 / 上線", notes: "正式帳號管理頁，取代舊版 UsersPage。" },
  { path: "/cost-rates", component: CostRatesPage, pageFile: "CostRatesPage.tsx", lifecycle: "保留 / 上線", notes: "費率設定。" },
  { path: "/utilization", component: UtilizationPage, pageFile: "UtilizationPage.tsx", lifecycle: "保留 / 上線", notes: "稼動率看板。" },
  { path: "/settlements", component: SettlementsPage, pageFile: "SettlementsPage.tsx", lifecycle: "保留 / 上線", notes: "月度結算。" },
  { path: "/notifications", component: NotificationsPage, pageFile: "NotificationsPage.tsx", lifecycle: "保留 / 上線", notes: "通知中心。" },
  { path: "/system-settings", component: SystemSettingsPage, pageFile: "SystemSettingsPage.tsx", lifecycle: "保留 / 上線", notes: "系統設定。" },
  { path: "/custom-fields", component: CustomFieldsPage, pageFile: "CustomFieldsPage.tsx", lifecycle: "保留 / 上線", notes: "自訂欄位管理。" },
  { path: "/opportunities", component: OpportunitiesPage, pageFile: "OpportunitiesPage.tsx", lifecycle: "保留 / 上線", notes: "商機清單。" },
  { path: "/opportunities/:id", component: OpportunityDetailPage, pageFile: "OpportunityDetailPage.tsx", lifecycle: "保留 / 上線", notes: "商機詳情。" },
  { path: "/projects", component: ProjectManagementRoute, pageFile: "ProjectManagementPage.tsx", lifecycle: "保留 / 上線（權限控管）", notes: "正式專案管理入口，僅 Manager / PM 可見。" },
  { path: "/service-requests", component: ServiceRequestsPage, pageFile: "ServiceRequestsPage.tsx", lifecycle: "保留 / 上線", notes: "SR 清單。" },
  { path: "/service-requests/:id", component: WbsManagementPage, pageFile: "WbsManagementPage.tsx", lifecycle: "保留 / 上線", notes: "SR 對應 WBS 管理。" },
  { path: "/change-requests", component: ChangeRequestsPage, pageFile: "ChangeRequestsPage.tsx", lifecycle: "保留 / 上線", notes: "CR 清單與審核。" },
  { path: "/presales-timesheets", component: PresalesTimesheetsPage, pageFile: "PresalesTimesheetsPage.tsx", lifecycle: "保留 / 上線", notes: "協銷工時填報。" },
  { path: "/project-timesheets", component: ProjectTimesheetsPage, pageFile: "ProjectTimesheetsPage.tsx", lifecycle: "保留 / 上線", notes: "專案工時填報。" },
  { path: "/kpi", component: KpiDashboardPage, pageFile: "KpiDashboardPage.tsx", lifecycle: "保留 / 上線", notes: "KPI 儀表板。" },
];

// `client/src/App.tsx` is the source of truth for routed pages; README and navigation
// should stay aligned with this inventory to avoid stale placeholder pages.
export const pageInventory: PageInventoryEntry[] = [
  ...activeRoutes.map(({ pageFile, lifecycle, path, notes }) => ({
    pageFile,
    status: lifecycle,
    route: path,
    notes,
  })),
  { pageFile: "LoginPage.tsx", status: "保留 / 上線", route: "/login", notes: "登入頁，由 AppShell 於未登入時直接切換。" },
  { pageFile: "UsersPage.tsx", status: "合併後移除", route: "—", notes: "舊版帳號管理雛形，功能已由 UserManagementPage 完整取代。" },
  { pageFile: "TimesheetsPage.tsx", status: "合併後移除", route: "—", notes: "工時入口已拆成 presales / project 兩個正式頁面，不再保留入口殼層。" },
  { pageFile: "ReportStoryPage.tsx", status: "移除", route: "—", notes: "AI 報表故事已停用，不再提供路由或 README 導覽說明。" },
];

function RuntimeMsalProvider({ children }: { children: ReactNode }) {
  const { data } = trpc.auth.entraConfig.useQuery(undefined, {
    staleTime: 5 * 60_000,
    retry: false,
  });

  const instance = useMemo(
    () => createMsalInstance({ clientId: data?.clientId, tenantId: data?.tenantId }),
    [data?.clientId, data?.tenantId],
  );

  return <MsalProvider instance={instance}>{children}</MsalProvider>;
}

function createAppQueryClient(onUnauthorized: () => void) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
      },
    },
    queryCache: new QueryCache({
      onError: (error: any) => {
        if (error.data?.code === "UNAUTHORIZED") {
          onUnauthorized();
        }
      }
    }),
    mutationCache: new MutationCache({
      onError: (error: any) => {
        if (error.data?.code === "UNAUTHORIZED") {
          onUnauthorized();
        } else {
          toast.error(error.message || "發生錯誤，請稍後再試");
        }
      }
    })
  });
}

function AppShell() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { inProgress } = useMsal();

  // While MSAL is processing a redirect, don't touch the route
  const msalBusy = inProgress !== InteractionStatus.None;

  useEffect(() => {
    if (msalBusy) return;

    if (!isAuthenticated && location !== "/login") {
      setLocation("/login");
      return;
    }

    if (isAuthenticated && location === "/login") {
      setLocation("/");
    }
  }, [isAuthenticated, location, setLocation, msalBusy]);

  // Show loading while MSAL is processing redirect
  if (msalBusy && !isAuthenticated) {
    return <AppLoadingFallback />;
  }

  return (
    <Suspense fallback={<AppLoadingFallback />}>
      {location === "/login" ? (
        <LoginPage />
      ) : (
        <AppLayout>
          <Switch>
            {activeRoutes.map((route) => (
              <Route key={route.path} path={route.path} component={route.component} />
            ))}
            <Route path="/:rest*" component={NotFound} />
          </Switch>
        </AppLayout>
      )}
    </Suspense>
  );
}

export default function App() {
  const handleUnauthorized = () => {
    localStorage.removeItem("pmp_auth_token");
    window.location.href = "/login";
  };

  const [queryClient] = useState(() => createAppQueryClient(handleUnauthorized));
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          async headers() {
            return {
              authorization: `Bearer ${localStorage.getItem("pmp_auth_token") || ""}`,
            };
          },
          fetch: async (url, options) => {
            const key = (import.meta as any).env.VITE_API_ENCRYPTION_KEY;
            let modifiedOptions: any = { ...options };
            if (key && modifiedOptions.body && typeof modifiedOptions.body === "string") {
              modifiedOptions.body = JSON.stringify({
                encrypted: encryptPayload(JSON.parse(modifiedOptions.body), key)
              });
            }

            const response = await fetch(url, modifiedOptions);
            if (key) {
              const originalJson = response.json.bind(response);
              response.json = async () => {
                const data = await originalJson();
                if (data && data.encrypted) {
                  return decryptPayload(data.encrypted, key);
                }
                return data;
              };
            }
            return response;
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RuntimeMsalProvider>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
          <Toaster position="bottom-right" />
        </RuntimeMsalProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
