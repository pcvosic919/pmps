import { Suspense, lazy, useEffect, useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "./lib/trpc";
import { Route, Switch, useLocation } from "wouter";
import { AppLayout } from "./components/AppLayout";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./lib/msal";
import { Toaster, toast } from "react-hot-toast";
import { useCurrentUser } from "./lib/useCurrentUser";

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

export default function App() {
  const [location, setLocation] = useLocation();
  const [token, setToken] = useState(() => localStorage.getItem("pmp_auth_token"));

  const handleUnauthorized = () => {
    localStorage.removeItem("pmp_auth_token");
    setToken(null);
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
        }),
      ],
    }),
  );

  useEffect(() => {
    const syncToken = () => setToken(localStorage.getItem("pmp_auth_token"));
    window.addEventListener("storage", syncToken);
    syncToken();
    return () => window.removeEventListener("storage", syncToken);
  }, []);

  useEffect(() => {
    if (!token && location !== "/login") {
      setLocation("/login");
    }
  }, [location, setLocation, token]);

  return (
    <MsalProvider instance={msalInstance}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<AppLoadingFallback />}>
            {location === "/login" ? (
              <LoginPage />
            ) : (
              <AppLayout>
                <Switch>
                  <Route path="/" component={DashboardPage} />
                  <Route path="/resources" component={ResourcesPage} />
                  <Route path="/users" component={UserManagementPage} />
                  <Route path="/cost-rates" component={CostRatesPage} />
                  <Route path="/utilization" component={UtilizationPage} />
                  <Route path="/settlements" component={SettlementsPage} />
                  <Route path="/notifications" component={NotificationsPage} />
                  <Route path="/system-settings" component={SystemSettingsPage} />
                  <Route path="/custom-fields" component={CustomFieldsPage} />
                  <Route path="/opportunities" component={OpportunitiesPage} />
                  <Route path="/opportunities/:id" component={OpportunityDetailPage} />
                  <Route path="/projects" component={ProjectManagementRoute} />
                  <Route path="/service-requests" component={ServiceRequestsPage} />
                  <Route path="/service-requests/:id" component={WbsManagementPage} />
                  <Route path="/change-requests" component={ChangeRequestsPage} />
                  <Route path="/presales-timesheets" component={PresalesTimesheetsPage} />
                  <Route path="/project-timesheets" component={ProjectTimesheetsPage} />
                  <Route path="/kpi" component={KpiDashboardPage} />
                  <Route path="/:rest*" component={NotFound} />
                </Switch>
              </AppLayout>
            )}
          </Suspense>
          <Toaster position="bottom-right" />
        </QueryClientProvider>
      </trpc.Provider>
    </MsalProvider>
  );
}
