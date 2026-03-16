import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';
import AuthLayout from '@/components/layout/AuthLayout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import InviteAcceptPage from '@/pages/InviteAcceptPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import DashboardPage from '@/pages/DashboardPage';

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
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <AuthLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>

        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
