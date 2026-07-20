import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { LogOut, ShieldAlert, UserCheck, Shield, TableProperties } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#F9FAFB] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <h1 className="font-display tracking-tight text-3xl font-semibold text-slate-900">
          Pixora QR <span className="text-xs font-sans px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-medium">Phase 2 Dev</span>
        </h1>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.75} />
          <span>Log Out</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="max-w-xl mx-auto px-4 py-12 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white rounded-2xl border border-slate-100 p-8 shadow-sm space-y-6"
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
              <UserCheck className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Logged in as {user?.name}</h2>
              <p className="text-xs text-slate-500 font-mono">{user?.email}</p>
            </div>
          </div>

          <div className="border-t border-slate-50 pt-6 space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <span className="text-sm font-medium text-slate-500">Authorized Role</span>
              <span className="text-xs font-mono font-bold px-2 py-1 bg-slate-900 text-white rounded">
                {user?.role}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <span className="text-sm font-medium text-slate-500">Account Status</span>
              <span className="text-xs font-semibold px-2.5 py-1 bg-green-50 text-green-700 rounded-full">
                Active
              </span>
            </div>
          </div>

          {/* Role-Specific Actions */}
          <div className="space-y-3 pt-2">
            {user?.role === 'SUPER_ADMIN' && (
              <Link
                to="/admin/restaurants"
                className="flex items-center gap-3 w-full p-4 border border-slate-100 rounded-2xl bg-slate-50 hover:bg-slate-100/50 hover:border-amber-200 transition-all group"
              >
                <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 group-hover:bg-amber-100 transition">
                  <Shield className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-slate-800">Manage Restaurants</h4>
                  <p className="text-xs text-slate-500">Super admin console to list, create, and suspend tenants</p>
                </div>
              </Link>
            )}

            {(user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN') && (
              <Link
                to="/manager/tables"
                className="flex items-center gap-3 w-full p-4 border border-slate-100 rounded-2xl bg-slate-50 hover:bg-slate-100/50 hover:border-amber-200 transition-all group"
              >
                <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 group-hover:bg-amber-100 transition">
                  <TableProperties className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-slate-800">Manage Restaurant Tables</h4>
                  <p className="text-xs text-slate-500">Configure tables, view QRs, and regenerate secure access codes</p>
                </div>
              </Link>
            )}
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" strokeWidth={1.75} />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-800">Operational Shell Platform</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                This is a secure placeholder shell. Subsequent development phases (Phases 3-12) will construct operations menus, ordering workflows, live dashboards, and branding configurations here.
              </p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};
export default Dashboard;
