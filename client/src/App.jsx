import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import useAuthStore from '@/stores/authStore';
import AuthLayout from '@/components/layout/AuthLayout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import InviteAcceptPage from '@/pages/InviteAcceptPage';
import DashboardPage from '@/pages/DashboardPage';
import UsersPage from '@/pages/UsersPage';
import ClientsPage from '@/pages/ClientsPage';
import DeliveriesPage from '@/pages/DeliveriesPage';
import GoalsPage from '@/pages/GoalsPage';
import CalculationsPage from '@/pages/CalculationsPage';
import RankingPage from '@/pages/RankingPage';
import SettingsPage from '@/pages/SettingsPage';
import SimulatorPage from '@/pages/SimulatorPage';
import PortalPage from '@/pages/PortalPage';
import SalariesPage from '@/pages/SalariesPage';
import BoostPage from '@/pages/BoostPage';
import ClientProfilePage from '@/pages/ClientProfilePage';
import ScheduleCalendarPage from '@/pages/ScheduleCalendarPage';

const MANAGEMENT = ['ceo', 'director', 'manager'];
const ADMIN = ['ceo', 'director'];
const ALL_INTERNAL = ['ceo', 'director', 'manager', 'account_manager', 'producer'];

function App() {
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <AuthLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/users" element={
            <ProtectedRoute roles={MANAGEMENT}><UsersPage /></ProtectedRoute>
          } />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientProfilePage />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/schedule" element={
            <ProtectedRoute roles={ALL_INTERNAL}><ScheduleCalendarPage /></ProtectedRoute>
          } />
          <Route path="/goals" element={
            <ProtectedRoute roles={MANAGEMENT}><GoalsPage /></ProtectedRoute>
          } />
          <Route path="/boost" element={
            <ProtectedRoute roles={ADMIN}><CalculationsPage /></ProtectedRoute>
          } />
          <Route path="/ranking" element={
            <ProtectedRoute roles={ALL_INTERNAL}><RankingPage /></ProtectedRoute>
          } />
          <Route path="/roles" element={
            <ProtectedRoute roles={['ceo']}><SalariesPage /></ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute roles={['ceo']}><SettingsPage /></ProtectedRoute>
          } />
          <Route path="/simulator" element={
            <ProtectedRoute roles={['producer']}><SimulatorPage /></ProtectedRoute>
          } />
          <Route path="/comofunciona" element={
            <ProtectedRoute roles={ALL_INTERNAL}><BoostPage /></ProtectedRoute>
          } />
          <Route path="/portal" element={
            <ProtectedRoute roles={['client']}><PortalPage /></ProtectedRoute>
          } />
        </Route>

        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  );
}

export default App;
