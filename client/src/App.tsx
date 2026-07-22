import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import ProtectedRoute from './routes/ProtectedRoute';
import Login from './pages/Login';
import AdminRestaurants from './pages/AdminRestaurants';
import PublicTable from './pages/PublicTable';
import PublicOrderConfirmation from './pages/PublicOrderConfirmation';
import ManagerOrders from './pages/ManagerOrders';

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

          {/* Protected Routes (all roles) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/manager/orders" replace />} />
          </Route>

          {/* Super Admin only routes */}
          <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
            <Route path="/admin/restaurants" element={<AdminRestaurants />} />
          </Route>

          {/* Manager/Staff/Super Admin routes */}
          <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'STAFF', 'SUPER_ADMIN']} />}>
            <Route path="/manager/orders" element={<ManagerOrders />} />
            <Route path="/manager/order" element={<Navigate to="/manager/orders" replace />} />
          </Route>

          {/* Manager/Super Admin only routes */}
          <Route element={<ProtectedRoute allowedRoles={['MANAGER', 'SUPER_ADMIN']} />}>
            <Route path="/manager/tables" element={<Navigate to="/manager/orders?tab=tables" replace />} />
            <Route path="/manager/menu" element={<Navigate to="/manager/orders?tab=menu" replace />} />
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
