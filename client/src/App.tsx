import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import ProtectedRoute from './routes/ProtectedRoute';
import Login from './pages/Login';
import AdminRestaurants from './pages/AdminRestaurants';
import ManagerTables from './pages/ManagerTables';
import ManagerMenu from './pages/ManagerMenu';
import ManagerOrders from './pages/ManagerOrders';
import ManagerWaiterCalls from './pages/ManagerWaiterCalls';
import ManagerSettings from './pages/ManagerSettings';
import ManagerAnalytics from './pages/ManagerAnalytics';
import ManagerProfile from './pages/ManagerProfile';
import ManagerLayout from './components/ManagerLayout';
import PublicTable from './pages/PublicTable';
import PublicOrderConfirmation from './pages/PublicOrderConfirmation';

const DashboardRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'SUPER_ADMIN') {
    return <Navigate to="/admin/restaurants" replace />;
  }
  return <Navigate to="/manager/orders" replace />;
};

export const App = () => {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public customer dining view */}
            <Route path="/r/:restaurantSlug/t/:tableToken" element={<PublicTable />} />
            <Route path="/r/:restaurantSlug/t/:tableToken/order/:orderId" element={<PublicOrderConfirmation />} />

            {/* Public login */}
            <Route path="/login" element={<Login />} />

            {/* Protected Routes (all roles) - root redirect */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardRedirect />} />
            </Route>

            {/* Super Admin only routes */}
            <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
              <Route path="/admin/restaurants" element={<AdminRestaurants />} />
            </Route>

            {/* Nested Manager/Staff/Super Admin routes under ManagerLayout */}
            <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'STAFF', 'SUPER_ADMIN']} />}>
              <Route element={<ManagerLayout />}>
                <Route path="/manager/orders" element={<ManagerOrders />} />
                <Route path="/manager/waiter-calls" element={<ManagerWaiterCalls />} />
                <Route path="/manager/profile" element={<ManagerProfile />} />

                {/* Manager/Super Admin only routes inside layout */}
                <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'SUPER_ADMIN']} />}>
                  <Route path="/manager/tables" element={<ManagerTables />} />
                  <Route path="/manager/menu" element={<ManagerMenu />} />
                  <Route path="/manager/settings" element={<ManagerSettings />} />
                  <Route path="/manager/analytics" element={<ManagerAnalytics />} />
                </Route>
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
