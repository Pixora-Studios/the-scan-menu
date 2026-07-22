import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useSocket, ConnectionStatus } from '../hooks/useSocket';
import ConnectionIndicator from './ConnectionIndicator';
import {
  Receipt,
  Bell,
  BookOpen,
  TableProperties,
  Settings,
  BarChart3,
  User,
  Volume2,
  VolumeX,
  BellRing,
} from 'lucide-react';
import apiClient from '../lib/api';

export const ManagerLayout: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  // Sound/notification toggles
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(false);

  const activeRestaurantId = user?.restaurants?.[0];
  const isStaff = user?.role === 'STAFF';

  // Fetch Live socket status
  const token = localStorage.getItem('accessToken');
  const { socket, status: connectionStatus } = useSocket(token);

  // Active tab tracking by pathname
  const currentPath = location.pathname;
  const activeTab = currentPath.startsWith('/manager/orders')
    ? 'orders'
    : currentPath.startsWith('/manager/waiter-calls')
    ? 'waiter-calls'
    : currentPath.startsWith('/manager/menu')
    ? 'menu'
    : currentPath.startsWith('/manager/tables')
    ? 'tables'
    : currentPath.startsWith('/manager/settings')
    ? 'settings'
    : currentPath.startsWith('/manager/analytics')
    ? 'analytics'
    : currentPath.startsWith('/manager/profile')
    ? 'profile'
    : '';

  // 1. Fetch Active Orders for count
  const { data: activeOrdersData } = useQuery({
    queryKey: ['activeOrdersQueue', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/orders/active`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  // 2. Fetch Waiter Calls for count
  const { data: waiterCallsData } = useQuery({
    queryKey: ['waiterCallsQueue', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/waiter-calls?limit=50`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  const activeOrdersCount = activeOrdersData?.success ? activeOrdersData.data.length : 0;

  const activeWaiterCallsCount = waiterCallsData?.success
    ? waiterCallsData.data.waiterCalls.filter(
        (c: any) => c.status === 'PENDING' || c.status === 'ACKNOWLEDGED'
      ).length
    : 0;

  // Synthesized chime
  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      const playNote = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      const nowTime = ctx.currentTime;
      playNote(523.25, nowTime, 0.4); // C5
      playNote(659.25, nowTime + 0.15, 0.5); // E5
    } catch (err) {
      console.error('Synthesized sound play failed:', err);
    }
  }, [soundEnabled]);

  // Set alert permissions on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setAlertsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const handleToggleAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast('Your browser does not support desktop notifications.', 'error');
      return;
    }

    if (Notification.permission === 'granted') {
      setAlertsEnabled(true);
      toast('Alerts are already enabled!', 'success');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setAlertsEnabled(true);
      toast('Desktop alerts successfully enabled!', 'success');
    } else {
      setAlertsEnabled(false);
      toast('Permission denied for desktop alerts.', 'error');
    }
  };

  // Register live Socket.IO events for global notification/refresh
  useEffect(() => {
    if (!socket || !activeRestaurantId) return;

    socket.emit('join_restaurant', { restaurantId: activeRestaurantId });

    socket.on('order:created', (newOrder: any) => {
      toast(`New Ticket: Order #${newOrder.orderNumber}`, 'success');
      playChime();

      // Trigger desktop notification
      if (Notification.permission === 'granted') {
        new Notification(`New Order #${newOrder.orderNumber}`, {
          body: `Table ${newOrder.tableId?.displayName || 'QR'} placed a new order.`,
          icon: '/favicon.ico',
        });
      }

      // Invalidate active orders query so child views reload
      queryClient.invalidateQueries({ queryKey: ['activeOrdersQueue', activeRestaurantId] });
    });

    socket.on('order:status_updated', () => {
      // Invalidate both active and served lists
      queryClient.invalidateQueries({ queryKey: ['activeOrdersQueue', activeRestaurantId] });
      queryClient.invalidateQueries({ queryKey: ['servedOrdersHistory', activeRestaurantId] });
    });

    socket.on('waiter_call:created', (newCall: any) => {
      toast(`Table ${newCall.tableNumberSnapshot} calls for waiter!`, 'info');
      playChime();

      if (Notification.permission === 'granted') {
        new Notification(`Table ${newCall.tableNumberSnapshot} calls for a waiter!`, {
          body: 'A customer requires floor service assistance.',
          icon: '/favicon.ico',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['waiterCallsQueue', activeRestaurantId] });
    });

    socket.on('waiter_call:resolved', () => {
      queryClient.invalidateQueries({ queryKey: ['waiterCallsQueue', activeRestaurantId] });
    });

    return () => {
      socket.off('order:created');
      socket.off('order:status_updated');
      socket.off('waiter_call:created');
      socket.off('waiter_call:resolved');
    };
  }, [socket, activeRestaurantId, toast, playChime, queryClient]);

  // If STAFF tries to visit a protected MANAGER route, redirect them to orders
  useEffect(() => {
    if (isStaff && (activeTab === 'menu' || activeTab === 'tables' || activeTab === 'settings' || activeTab === 'analytics')) {
      navigate('/manager/orders', { replace: true });
    }
  }, [activeTab, isStaff, navigate]);

  const renderHeader = () => (
    <header className="bg-white border-b border-slate-150 px-4 md:px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="font-display tracking-tight text-3xl font-semibold text-slate-900 leading-none">
          Pixora Staff
        </h1>
        <ConnectionIndicator status={connectionStatus as ConnectionStatus} />
      </div>

      <div className="flex items-center gap-2">
        {/* Sound Chime Switcher */}
        <button
          onClick={() => {
            setSoundEnabled(!soundEnabled);
            toast(soundEnabled ? 'Sound notifications muted' : 'Sound notifications enabled', 'info');
          }}
          className={`p-2 rounded-xl border transition-all ${
            soundEnabled
              ? 'bg-amber-50 border-amber-200 text-amber-600'
              : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
          }`}
          title={soundEnabled ? 'Mute Chime' : 'Unmute Chime'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" strokeWidth={1.75} /> : <VolumeX className="w-4 h-4" strokeWidth={1.75} />}
        </button>

        {/* Push notifications button */}
        <button
          onClick={handleToggleAlerts}
          className={`p-2 rounded-xl border transition-all ${
            alertsEnabled
              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
              : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
          }`}
          title={alertsEnabled ? 'Push Notifications Enabled' : 'Enable Push Notifications'}
        >
          <BellRing className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen max-h-screen flex flex-col md:flex-row bg-[#FAF9F6] text-slate-900 overflow-hidden font-sans select-none">

      {/* ----------------- SIDEBAR (TABLET/DESKTOP) ----------------- */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-150 shrink-0 h-full">
        <div className="p-6 border-b border-slate-150">
          <h2 className="font-display tracking-tight text-3xl font-normal text-slate-900">
            Pixora QR
          </h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono mt-0.5">
            Operations Panel
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {/* Orders tab */}
          <button
            onClick={() => navigate('/manager/orders')}
            className={`flex items-center justify-between w-full px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'orders'
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <Receipt className="w-4 h-4" strokeWidth={1.75} />
              <span>Orders</span>
            </div>
            {activeOrdersCount > 0 && (
              <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold font-mono ${
                activeTab === 'orders' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-700'
              }`}>
                {activeOrdersCount}
              </span>
            )}
          </button>

          {/* Waiter Calls tab */}
          <button
            onClick={() => navigate('/manager/waiter-calls')}
            className={`flex items-center justify-between w-full px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'waiter-calls'
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4" strokeWidth={1.75} />
              <span>Waiter Calls</span>
            </div>
            {activeWaiterCallsCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] rounded-full font-bold font-mono bg-amber-500 text-slate-950 animate-pulse">
                {activeWaiterCallsCount}
              </span>
            )}
          </button>

          {/* Menu tab (Manager/Super Admin only) */}
          {!isStaff && (
            <button
              onClick={() => navigate('/manager/menu')}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'menu'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" strokeWidth={1.75} />
              <span>Menu Management</span>
            </button>
          )}

          {/* Tables tab (Manager/Super Admin only) */}
          {!isStaff && (
            <button
              onClick={() => navigate('/manager/tables')}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'tables'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <TableProperties className="w-4 h-4" strokeWidth={1.75} />
              <span>Tables</span>
            </button>
          )}

          {/* Settings tab (Manager/Super Admin only) */}
          {!isStaff && (
            <button
              onClick={() => navigate('/manager/settings')}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'settings'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Settings className="w-4 h-4" strokeWidth={1.75} />
              <span>Settings</span>
            </button>
          )}

          {/* Analytics tab (Manager/Super Admin only) */}
          {!isStaff && (
            <button
              onClick={() => navigate('/manager/analytics')}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'analytics'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" strokeWidth={1.75} />
              <span>Analytics & Insights</span>
            </button>
          )}

          {/* Profile tab */}
          <button
            onClick={() => navigate('/manager/profile')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'profile'
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4" strokeWidth={1.75} />
            <span>Profile</span>
          </button>
        </nav>

        {/* User Footnote */}
        <div className="p-4 border-t border-slate-150 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 font-bold shrink-0 text-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-extrabold text-slate-900 truncate leading-tight">
                {user?.name}
              </h4>
              <p className="text-[10px] text-slate-500 truncate font-mono uppercase font-bold tracking-wider mt-0.5">
                {user?.role}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ----------------- MAIN VIEW WRAPPER ----------------- */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {renderHeader()}

        {/* Active Content Panel */}
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
      </div>

      {/* ----------------- BOTTOM BAR (MOBILE ONLY) ----------------- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-150 flex items-center justify-around px-2 pb-safe z-40 shadow-lg">
        {/* Orders */}
        <button
          onClick={() => navigate('/manager/orders')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full relative transition-all min-w-0 ${
            activeTab === 'orders' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <Receipt className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[9px] min-[375px]:text-[10px] truncate w-full text-center leading-none px-0.5">Orders</span>
          {activeOrdersCount > 0 && (
            <span className="absolute top-2 right-1/4 px-1.5 py-0.5 text-[8px] bg-amber-500 text-slate-950 rounded-full font-bold font-mono border border-white">
              {activeOrdersCount}
            </span>
          )}
        </button>

        {/* Waiter Calls */}
        <button
          onClick={() => navigate('/manager/waiter-calls')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full relative transition-all min-w-0 ${
            activeTab === 'waiter-calls' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <Bell className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[9px] min-[375px]:text-[10px] truncate w-full text-center leading-none px-0.5">Waiter Calls</span>
          {activeWaiterCallsCount > 0 && (
            <span className="absolute top-2 right-1/4 px-1.5 py-0.5 text-[8px] bg-amber-500 text-slate-950 rounded-full font-bold font-mono border border-white animate-pulse">
              {activeWaiterCallsCount}
            </span>
          )}
        </button>

        {/* Menu (Manager only) */}
        {!isStaff && (
          <button
            onClick={() => navigate('/manager/menu')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all min-w-0 ${
              activeTab === 'menu' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <BookOpen className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[9px] min-[375px]:text-[10px] truncate w-full text-center leading-none px-0.5">Menu</span>
          </button>
        )}

        {/* Tables (Manager only) */}
        {!isStaff && (
          <button
            onClick={() => navigate('/manager/tables')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all min-w-0 ${
              activeTab === 'tables' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <TableProperties className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[9px] min-[375px]:text-[10px] truncate w-full text-center leading-none px-0.5">Tables</span>
          </button>
        )}

        {/* Settings (Manager only) */}
        {!isStaff && (
          <button
            onClick={() => navigate('/manager/settings')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all min-w-0 ${
              activeTab === 'settings' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <Settings className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[9px] min-[375px]:text-[10px] truncate w-full text-center leading-none px-0.5">Settings</span>
          </button>
        )}

        {/* Analytics (Manager only) */}
        {!isStaff && (
          <button
            onClick={() => navigate('/manager/analytics')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all min-w-0 ${
              activeTab === 'analytics' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <BarChart3 className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[9px] min-[375px]:text-[10px] truncate w-full text-center leading-none px-0.5">Analytics</span>
          </button>
        )}

        {/* Profile */}
        <button
          onClick={() => navigate('/manager/profile')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all min-w-0 ${
            activeTab === 'profile' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <User className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[9px] min-[375px]:text-[10px] truncate w-full text-center leading-none px-0.5">Profile</span>
        </button>
      </nav>
    </div>
  );
};

export default ManagerLayout;
