import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from './lib/trpc';
import { Route, Switch } from "wouter";
import { AppLayout } from './components/AppLayout';
import { UserManagementPage } from './pages/UserManagementPage';
import { CostRatesPage } from './pages/CostRatesPage';
import { UtilizationPage } from './pages/UtilizationPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { CustomFieldsPage } from './pages/CustomFieldsPage';
import { ReportStoryPage } from './pages/ReportStoryPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { ServiceRequestsPage } from './pages/ServiceRequestsPage';
import { Toaster, toast } from 'react-hot-toast';

import { ProjectTimesheetsPage } from './pages/ProjectTimesheetsPage';
import { PresalesTimesheetsPage } from './pages/PresalesTimesheetsPage';
import { KpiDashboardPage } from './pages/KpiDashboardPage';
import { WbsManagementPage } from './pages/WbsManagementPage';
import { ChangeRequestsPage } from './pages/ChangeRequestsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { OpportunityDetailPage } from './pages/OpportunityDetailPage';
import { ProjectManagementPage } from './pages/ProjectManagementPage';

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h2 className="text-4xl font-bold mb-4">404</h2>
      <p className="text-muted-foreground mb-8">此頁面尚未實作或不存在 (Page not found)</p>
    </div>
  );
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          async headers() {
            return {
              authorization: `Bearer demo_admin@demo.com`,
            };
          },
        }),
      ],
    }),
  );

  queryClient.setDefaultOptions({
    mutations: {
      onError: (error: any) => {
        toast.error(error.message || "發生錯誤，請稍後再試");
      }
    },
    queries: {
      retry: 1,
    }
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
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
            <Route path="/reportstory" component={ReportStoryPage} />
            <Route path="/opportunities" component={OpportunitiesPage} />
            <Route path="/opportunities/:id" component={OpportunityDetailPage} />
            <Route path="/projects" component={ProjectManagementPage} />
            <Route path="/service-requests" component={ServiceRequestsPage} />
            <Route path="/service-requests/:id" component={WbsManagementPage} />
            <Route path="/change-requests" component={ChangeRequestsPage} />
            <Route path="/presales-timesheets" component={PresalesTimesheetsPage} />
            <Route path="/project-timesheets" component={ProjectTimesheetsPage} />
            <Route path="/kpi" component={KpiDashboardPage} />
            <Route path="/:rest*" component={NotFound} />
          </Switch>
        </AppLayout>
        <Toaster position="bottom-right" />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
