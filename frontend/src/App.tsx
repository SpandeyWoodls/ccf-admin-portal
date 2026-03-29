import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageLoader } from "@/components/shared/PageLoader";
import { AccessDenied } from "@/components/shared/AccessDenied";
import { RoleGuard } from "@/components/shared/RoleGuard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const LoginPage = lazy(() => import("./pages/LoginPage").then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const LicensesPage = lazy(() => import("./pages/LicensesPage").then(m => ({ default: m.LicensesPage })));
const LicenseDetailPage = lazy(() => import("./pages/LicenseDetailPage").then(m => ({ default: m.LicenseDetailPage })));
const OrganizationsPage = lazy(() => import("./pages/OrganizationsPage").then(m => ({ default: m.OrganizationsPage })));
const OrgDetailPage = lazy(() => import("./pages/OrgDetailPage").then(m => ({ default: m.OrgDetailPage })));
const ReleasesPage = lazy(() => import("./pages/ReleasesPage").then(m => ({ default: m.ReleasesPage })));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage").then(m => ({ default: m.AnalyticsPage })));
const AnnouncementsPage = lazy(() => import("./pages/AnnouncementsPage").then(m => ({ default: m.AnnouncementsPage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then(m => ({ default: m.SupportPage })));
const TrialsPage = lazy(() => import("./pages/TrialsPage").then(m => ({ default: m.TrialsPage })));
const AuditPage = lazy(() => import("./pages/AuditPage").then(m => ({ default: m.AuditPage })));
const DownloadsPage = lazy(() => import("./pages/DownloadsPage").then(m => ({ default: m.DownloadsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));

function App() {
  return (
    <TooltipProvider>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes with dashboard layout */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/licenses" element={<LicensesPage />} />
          <Route path="/licenses/:id" element={<LicenseDetailPage />} />
          <Route path="/organizations" element={<OrganizationsPage />} />
          <Route path="/organizations/:id" element={<OrgDetailPage />} />
          <Route path="/releases" element={<ReleasesPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/analytics" element={
            <RoleGuard permission="analytics.view" fallback={<AccessDenied />}>
              <AnalyticsPage />
            </RoleGuard>
          } />
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/support" element={
            <RoleGuard permission="support.view" fallback={<AccessDenied />}>
              <SupportPage />
            </RoleGuard>
          } />
          <Route path="/trials" element={
            <RoleGuard permission="trials.view" fallback={<AccessDenied />}>
              <TrialsPage />
            </RoleGuard>
          } />
          <Route path="/audit" element={
            <RoleGuard permission="audit.view" fallback={<AccessDenied />}>
              <AuditPage />
            </RoleGuard>
          } />
          <Route path="/settings" element={
            <RoleGuard permission="settings.view" fallback={<AccessDenied />}>
              <SettingsPage />
            </RoleGuard>
          } />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
