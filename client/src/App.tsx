import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
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
import { ErrorBoundary } from "./components/ErrorBoundary";

const ENTRA_CONFIG_CACHE_KEY = "pmp_entra_runtime_config";
const createClientEventId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage").then((module) => ({ default: module.UserManagementPage })));
const AssignmentIntegrityPage = lazy(() => import("./pages/AssignmentIntegrityPage").then((module) => ({ default: module.AssignmentIntegrityPage })));
const CostRatesPage = lazy(() => import("./pages/CostRatesPage").then((module) => ({ default: module.CostRatesPage })));
const SettlementsPage = lazy(() => import("./pages/RecognitionCenterPage").then((module) => ({ default: module.RecognitionCenterPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const SystemSettingsPage = lazy(() => import("./pages/SystemSettingsPage").then((module) => ({ default: module.SystemSettingsPage })));
const CustomFieldsPage = lazy(() => import("./pages/CustomFieldsPage").then((module) => ({ default: module.CustomFieldsPage })));
const CompanyManagementPage = lazy(() => import("./pages/CompanyManagementPage").then((module) => ({ default: module.CompanyManagementPage })));
const OpportunitiesPage = lazy(() => import("./pages/OpportunitiesPage").then((module) => ({ default: module.OpportunitiesPage })));
const ServiceRequestsPage = lazy(() => import("./pages/ServiceRequestsPage").then((module) => ({ default: module.ServiceRequestsPage })));
const ProjectTimesheetsPage = lazy(() => import("./pages/ProjectTimesheetsPage").then((module) => ({ default: module.ProjectTimesheetsPage })));
const PresalesTimesheetsPage = lazy(() => import("./pages/PresalesTimesheetsPage").then((module) => ({ default: module.PresalesTimesheetsPage })));
const KpiDashboardPage = lazy(() => import("./pages/KpiDashboardPage").then((module) => ({ default: module.KpiDashboardPage })));
const WbsManagementPage = lazy(() => import("./pages/WbsManagementPage").then((module) => ({ default: module.WbsManagementPage })));
const ChangeRequestsPage = lazy(() => import("./pages/ChangeRequestsPage").then((module) => ({ default: module.ChangeRequestsPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const PmDashboardPage = lazy(() => import("./pages/PmDashboardPage").then((module) => ({ default: module.PmDashboardPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((module) => ({ default: module.CalendarPage })));
const ReportBuilderPage = lazy(() => import("./pages/ReportCenterPage").then((module) => ({ default: module.ReportCenterPage })));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage").then((module) => ({ default: module.ResourcesPage })));
const ProjectResourcesPage = lazy(() => import("./pages/ProjectResourcesPage").then((module) => ({ default: module.ProjectResourcesPage })));
const OpportunityDetailPage = lazy(() => import("./pages/OpportunityDetailPage").then((module) => ({ default: module.OpportunityDetailPage })));
const ProjectManagementPage = lazy(() => import("./pages/ProjectManagementPage").then((module) => ({ default: module.ProjectManagementPage })));
const ProfitCenterFormulaPage = lazy(() => import("./pages/ProfitCenterFormulaPage"));
const ProfitCenterReportPage = ReportBuilderPage;
const AuditPage = lazy(() => import("./pages/AuditPage").then((module) => ({ default: module.AuditPage })));
const PlatformControlPage = lazy(() => import("./pages/PlatformControlPage").then((module) => ({ default: module.PlatformControlPage })));
const AccountSecurityPage = lazy(() => import("./pages/AccountSecurityPage").then((module) => ({ default: module.AccountSecurityPage })));

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
  const { hasPermission, isLoading } = useCurrentUser();

  if (isLoading) {
    return <AppLoadingFallback />;
  }

  const canAccess = hasPermission("module.projects.view", ["admin", "manager", "pm", "tech", "presales"]);
  return canAccess ? <ProjectManagementPage /> : <RestrictedPage message="您沒有權限存取專案管理。" />;
}

function CalendarRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.calendar.view", ["admin", "manager", "pm", "tech", "presales"])
    ? <CalendarPage />
    : <RestrictedPage message="您沒有權限存取排程與人力。" />;
}

function OpportunitiesRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.opportunities.view", ["admin", "manager", "business", "presales", "tech", "pm"])
    ? <OpportunitiesPage />
    : <RestrictedPage message="您沒有權限存取商機管理。" />;
}

function OpportunityDetailRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.opportunities.view", ["admin", "manager", "business", "presales", "tech", "pm"])
    ? <OpportunityDetailPage />
    : <RestrictedPage message="您沒有權限存取商機管理。" />;
}

function ServiceRequestsRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.projects.view", ["admin", "manager", "pm", "tech", "presales"])
    ? <ServiceRequestsPage />
    : <RestrictedPage message="您沒有權限存取專案管理。" />;
}

function WbsRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.projects.view", ["admin", "manager", "pm", "tech", "presales"])
    ? <WbsManagementPage />
    : <RestrictedPage message="您沒有權限存取專案管理。" />;
}

function ResourcesRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.resources.view", ["admin", "manager", "pm", "presales", "business", "tech"])
    ? <ResourcesPage />
    : <RestrictedPage message="您沒有權限存取資源管理。" />;
}

function ProjectResourcesRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.resources.view", ["admin", "manager", "pm", "presales", "business", "tech"])
    ? <ProjectResourcesPage />
    : <RestrictedPage message="您沒有權限存取專案人力規劃。" />;
}

function UtilizationRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => setLocation("/resources?tab=utilization", { replace: true }), [setLocation]);
  return <AppLoadingFallback />;
}

function PmDashboardRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.projects.view", ["admin", "manager", "pm", "presales"])
    ? <PmDashboardPage />
    : <RestrictedPage message="您沒有權限存取專案總表。" />;
}

function ProjectTimesheetsRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.projects.view", ["admin", "manager", "pm", "tech", "presales"])
    ? <ProjectTimesheetsPage />
    : <RestrictedPage message="您沒有權限存取專案工時。" />;
}

function ChangeRequestsRoute() {
  const { hasPermission, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return hasPermission("module.projects.view", ["admin", "manager", "pm", "tech", "presales", "business"])
    ? <ChangeRequestsPage />
    : <RestrictedPage message="您沒有權限存取變更單。" />;
}

function AuditRoute() {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return user?.isPlatformOwner
    ? <AuditPage />
    : <RestrictedPage message="只有平台擁有者可以查看 Audit 使用者互動紀錄。" />;
}

function PlatformControlRoute() {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return user?.isPlatformOwner
    ? <PlatformControlPage />
    : <RestrictedPage message="只有平台擁有者可以使用平台控制中心。" />;
}

function SystemSettingsRoute() {
  const { user, hasRole, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return user?.isPlatformOwner || hasRole("admin") || hasRole("manager")
    ? <SystemSettingsPage />
    : <RestrictedPage message="只有管理者可以存取系統設定與產品列表。" />;
}

function CustomFieldsRoute() {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return user?.isPlatformOwner
    ? <CustomFieldsPage />
    : <RestrictedPage message="只有平台擁有者可以修改欄位定義。" />;
}

function ProfitCenterFormulaRoute() {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) return <AppLoadingFallback />;
  return user?.isPlatformOwner
    ? <ProfitCenterFormulaPage />
    : <RestrictedPage message="只有平台擁有者可以修改平台公式。" />;
}

const activeRoutes: ActiveRouteDefinition[] = [
  { path: "/", component: DashboardPage, pageFile: "DashboardPage.tsx", lifecycle: "保留 / 上線", notes: "主儀表板首頁。" },
  { path: "/resources", component: ResourcesRoute, pageFile: "ResourcesPage.tsx", lifecycle: "保留 / 上線", notes: "人員、容量、配置、核定與實際稼動整合中心。" },
  { path: "/users", component: UserManagementPage, pageFile: "UserManagementPage.tsx", lifecycle: "保留 / 上線", notes: "正式帳號管理頁，取代舊版 UsersPage。" },
  { path: "/assignment-integrity", component: AssignmentIntegrityPage, pageFile: "AssignmentIntegrityPage.tsx", lifecycle: "保留 / 上線", notes: "歷史指派資料掃描與安全修復。" },
  { path: "/cost-rates", component: CostRatesPage, pageFile: "CostRatesPage.tsx", lifecycle: "保留 / 上線", notes: "費率設定。" },
  { path: "/utilization", component: UtilizationRedirect, pageFile: "ResourcesPage.tsx", lifecycle: "保留 / 上線", notes: "相容導向資源管理的實際稼動分頁。" },
  { path: "/settlements", component: SettlementsPage, pageFile: "RecognitionCenterPage.tsx", lifecycle: "保留 / 上線", notes: "協銷與專案認列結算中心。" },
  { path: "/notifications", component: NotificationsPage, pageFile: "NotificationsPage.tsx", lifecycle: "保留 / 上線", notes: "通知中心。" },
  { path: "/system-settings", component: SystemSettingsRoute, pageFile: "SystemSettingsPage.tsx", lifecycle: "保留 / 上線", notes: "Platform Owner 系統設定。" },
  { path: "/custom-fields", component: CustomFieldsRoute, pageFile: "CustomFieldsPage.tsx", lifecycle: "保留 / 上線", notes: "Platform Owner 自訂欄位管理。" },
  { path: "/companies", component: CompanyManagementPage, pageFile: "CompanyManagementPage.tsx", lifecycle: "保留 / 上線", notes: "公司主檔管理與商機客戶選擇來源。" },
  { path: "/opportunities", component: OpportunitiesRoute, pageFile: "OpportunitiesPage.tsx", lifecycle: "保留 / 上線", notes: "商機清單。" },
  { path: "/opportunities/:id", component: OpportunityDetailRoute, pageFile: "OpportunityDetailPage.tsx", lifecycle: "保留 / 上線", notes: "商機詳情。" },
  { path: "/projects", component: ProjectManagementRoute, pageFile: "ProjectManagementPage.tsx", lifecycle: "保留 / 上線（權限控管）", notes: "正式專案管理入口，僅 Manager / PM 可見。" },
  { path: "/pm-dashboard", component: PmDashboardRoute, pageFile: "PmDashboardPage.tsx", lifecycle: "保留 / 上線", notes: "專案高階儀表板與卡片看板" },
  { path: "/calendar", component: CalendarRoute, pageFile: "CalendarPage.tsx", lifecycle: "保留 / 上線", notes: "個人 AM／PM 排程與主管團隊負載" },
  { path: "/service-requests", component: ServiceRequestsRoute, pageFile: "ServiceRequestsPage.tsx", lifecycle: "保留 / 上線", notes: "SR 清單。" },
  { path: "/service-requests/:id/resources", component: ProjectResourcesRoute, pageFile: "ProjectResourcesPage.tsx", lifecycle: "保留 / 上線（權限控管）", notes: "專案人力需求、配置異動與取消入口。" },
  { path: "/service-requests/:id", component: WbsRoute, pageFile: "WbsManagementPage.tsx", lifecycle: "保留 / 上線", notes: "SR 對應 WBS 管理。" },
  { path: "/change-requests", component: ChangeRequestsRoute, pageFile: "ChangeRequestsPage.tsx", lifecycle: "保留 / 上線", notes: "CR 清單與審核。" },
  { path: "/presales-timesheets", component: PresalesTimesheetsPage, pageFile: "PresalesTimesheetsPage.tsx", lifecycle: "保留 / 上線", notes: "協銷工時填報。" },
  { path: "/project-timesheets", component: ProjectTimesheetsRoute, pageFile: "ProjectTimesheetsPage.tsx", lifecycle: "保留 / 上線", notes: "專案工時填報。" },
  { path: "/kpi", component: KpiDashboardPage, pageFile: "KpiDashboardPage.tsx", lifecycle: "保留 / 上線", notes: "KPI 儀表板。" },
  { path: "/reports", component: ReportBuilderPage, pageFile: "ReportCenterPage.tsx", lifecycle: "保留 / 上線", notes: "整併後的報表中心與匯出。" },
  { path: "/formula/profit-center", component: ProfitCenterFormulaRoute, pageFile: "ProfitCenterFormulaPage.tsx", lifecycle: "保留 / 上線", notes: "Platform Owner 利潤中心公式專用頁面。" },
  { path: "/profit-center-report", component: ProfitCenterReportPage, pageFile: "ReportCenterPage.tsx", lifecycle: "保留 / 上線", notes: "舊利潤中心報表入口相容導向報表中心。" },
  { path: "/audit", component: AuditRoute, pageFile: "AuditPage.tsx", lifecycle: "保留 / 上線", notes: "Platform Owner 專用使用者互動稽核中心" },
  { path: "/platform-control", component: PlatformControlRoute, pageFile: "PlatformControlPage.tsx", lifecycle: "保留 / 上線", notes: "Platform Owner 專用文字、參數與版面控制中心" },
  { path: "/account-security", component: AccountSecurityPage, pageFile: "AccountSecurityPage.tsx", lifecycle: "保留 / 上線", notes: "使用者修改本人密碼與查看密碼狀態" },
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
  const { data, isLoading } = trpc.auth.entraConfig.useQuery(undefined, {
    staleTime: 5 * 60_000,
    retry: false,
    initialData: () => {
      try {
        const cached = localStorage.getItem(ENTRA_CONFIG_CACHE_KEY);
        return cached ? JSON.parse(cached) : undefined;
      } catch {
        return undefined;
      }
    },
  });

  useEffect(() => {
    if (!data?.clientId || !data?.tenantId) return;
    localStorage.setItem(ENTRA_CONFIG_CACHE_KEY, JSON.stringify(data));
  }, [data]);

  // Keep the MSAL instance stable while the effective Entra configuration is unchanged.
  // Primitive dependencies prevent background query refreshes from discarding redirect state.
  const instance = useMemo(() => {
    if (isLoading) return null;
    return createMsalInstance({
      clientId: data?.clientId,
      tenantId: data?.tenantId,
    });
  }, [data?.clientId, data?.tenantId, isLoading]);

  if (!instance) {
    // Still waiting for entraConfig before we can build the MSAL instance
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">系統初始化中...</div>;
  }

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
  const { user } = useCurrentUser();
  const { inProgress } = useMsal();
  const { mutate: trackPageView } = trpc.audit.trackPageView.useMutation();
  const lastTrackedPage = useRef("");

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

  useEffect(() => {
    if (!isAuthenticated || !user || location === "/login") return;
    const trackingKey = `${user.id}:${location}`;
    if (lastTrackedPage.current === trackingKey) return;
    lastTrackedPage.current = trackingKey;
    trackPageView({ route: location });
  }, [isAuthenticated, location, trackPageView, user]);

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
          <ErrorBoundary>
            <Switch>
              {activeRoutes.map((route) => (
                <Route key={route.path} path={route.path} component={route.component} />
              ))}
              <Route path="/:rest*" component={NotFound} />
            </Switch>
          </ErrorBoundary>
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
            let sessionId = sessionStorage.getItem("pmp_audit_session_id");
            if (!sessionId) {
              sessionId = createClientEventId();
              sessionStorage.setItem("pmp_audit_session_id", sessionId);
            }
            return {
              authorization: `Bearer ${localStorage.getItem("pmp_auth_token") || ""}`,
              "x-request-id": createClientEventId(),
              "x-session-id": sessionId,
            };
          },
          fetch: async (url, options) => {
            const key = (import.meta as any).env.VITE_API_ENCRYPTION_KEY;
            const modifiedOptions: any = { ...options };
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
