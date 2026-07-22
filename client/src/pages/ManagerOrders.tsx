import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useSocket, ConnectionStatus } from '../hooks/useSocket';
import ConnectionIndicator from '../components/ConnectionIndicator';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  Utensils,
  XCircle,
  ArrowRight,
  Receipt,
  FileText,
  BellRing,
  Volume2,
  VolumeX,
  User,
  LogOut,
  MapPin,
  Phone,
  Mail,
  Loader,
  AlertCircle,
  Bell,
  X,
  Shield,
  HelpCircle,
  BookOpen,
  TableProperties,
  Settings,
} from 'lucide-react';
import { BarChart3 } from 'lucide-react';
import apiClient from '../lib/api';
import { ManagerMenu } from './ManagerMenu';
import { ManagerTables } from './ManagerTables';
import { ManagerSettings } from './ManagerSettings';
import { ManagerAnalytics } from './ManagerAnalytics';

interface OrderItem {
  nameSnapshot: string;
  unitPriceSnapshot: number;
  quantity: number;
  selectedAddOns: { name: string; priceDelta: number }[];
  specialInstructions?: string;
}

interface Order {
  _id: string;
  restaurantId: string;
  tableId: { displayName: string; tableNumber: string } | any;
  orderNumber: number;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  customerNote?: string;
  status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  source: string;
  createdAt: string;
}

interface WaiterCall {
  _id: string;
  restaurantId: string;
  tableId: { displayName: string; tableNumber: string } | any;
  tableNumberSnapshot: string;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';
  requestType: 'CALL_WAITER' | 'REQUEST_BILL' | 'WATER' | 'TISSUE' | 'OTHER';
  createdAt: string;
}

const waiterCallTypeDetails: Record<string, { label: string; bg: string; text: string }> = {
  CALL_WAITER: { label: 'Call Waiter', bg: 'bg-indigo-50 border-indigo-100', text: 'text-indigo-700' },
  REQUEST_BILL: { label: 'Request Bill', bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700' },
  WATER: { label: 'Bring Water', bg: 'bg-blue-50 border-blue-100', text: 'text-blue-700' },
  TISSUE: { label: 'Need Tissue', bg: 'bg-amber-50 border-amber-100', text: 'text-amber-700' },
  OTHER: { label: 'Other Help', bg: 'bg-purple-50 border-purple-100', text: 'text-purple-700' },
};

// Helper to calculate elapsed time friendly text
const getElapsedTimeLabel = (createdAt: string, now: Date) => {
  const diffMs = now.getTime() - new Date(createdAt).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 1) {
    return 'Just now';
  }
  if (diffMin < 60) {
    return `${diffMin} min ago`;
  }
  const diffHrs = Math.floor(diffMin / 60);
  const remainingMins = diffMin % 60;
  return `${diffHrs}h ${remainingMins}m ago`;
};

export const ManagerOrders: React.FC = () => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mobile sub-status tab switcher state
  const [mobileStatusTab, setMobileStatusTab] = useState<'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED'>('PENDING');

  // Page for served history pagination
  const [servedPage, setServedPage] = useState(1);
  const [servedOrders, setServedOrders] = useState<Order[]>([]);
  const [hasMoreServed, setHasMoreServed] = useState(true);

  // Active / History tracking
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [activeWaiterCalls, setActiveWaiterCalls] = useState<WaiterCall[]>([]);

  // Sound/notification toggles
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(false);

  // Modal / detail states
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  // Live Timer references
  const [now, setNow] = useState<Date>(new Date());

  const activeRestaurantId = user?.restaurants?.[0];
  const isStaff = user?.role === 'STAFF';

  // Deep linking tabs using Search Parameters
  const [searchParams, setSearchParams] = useSearchParams();
  const rawActiveTab = searchParams.get('tab') || 'orders';

  // State-level role protection helper
  const getSanitizedTab = (tab: string): 'orders' | 'waiter-calls' | 'menu' | 'tables' | 'settings' | 'analytics' | 'profile' => {
    const validTabs = ['orders', 'waiter-calls', 'menu', 'tables', 'settings', 'analytics', 'profile'];
    const resolvedTab = validTabs.includes(tab) ? tab : 'orders';
    if (isStaff && ['menu', 'tables', 'settings', 'analytics'].includes(resolvedTab)) {
      return 'orders';
    }
    return resolvedTab as any;
  };

  const activeTab = getSanitizedTab(rawActiveTab);

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  // Fetch Live socket status
  const token = localStorage.getItem('accessToken');
  const { socket, status: connectionStatus } = useSocket(token);

  // 1. Fetch Active Orders (not served or cancelled)
  const { data: activeOrdersData, isLoading: isLoadingActive } = useQuery({
    queryKey: ['activeOrdersQueue', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/orders/active`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  // 2. Fetch Served Orders (for SERVED column / tab, with page limits and scoping)
  const { data: servedOrdersData, isFetching: isFetchingServed } = useQuery({
    queryKey: ['servedOrdersHistory', activeRestaurantId, servedPage],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/orders?status=SERVED&page=${servedPage}&limit=15`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  // 3. Fetch Waiter Calls
  const { data: waiterCallsData, isLoading: isLoadingWaiterCalls } = useQuery({
    queryKey: ['waiterCallsQueue', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/waiter-calls?limit=50`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  // 4. Fetch Restaurant Info for Profile
  const { data: restaurantData } = useQuery({
    queryKey: ['restaurantProfileInfo', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  // Sync active orders
  useEffect(() => {
    if (activeOrdersData?.success) {
      setActiveOrders(activeOrdersData.data);
    }
  }, [activeOrdersData]);

  // Sync served orders with pagination (accumulating list)
  useEffect(() => {
    if (servedOrdersData?.success) {
      const fetched = servedOrdersData.data.orders || [];
      const pagination = servedOrdersData.data.pagination;

      if (servedPage === 1) {
        setServedOrders(fetched);
      } else {
        setServedOrders((prev) => {
          // avoid duplicates
          const existingIds = new Set(prev.map((o) => o._id));
          const filtered = fetched.filter((o: Order) => !existingIds.has(o._id));
          return [...prev, ...filtered];
        });
      }

      setHasMoreServed(pagination ? servedPage < pagination.totalPages : false);
    }
  }, [servedOrdersData, servedPage]);

  // Sync waiter calls (filtering active ones)
  useEffect(() => {
    if (waiterCallsData?.success) {
      const openCalls = waiterCallsData.data.waiterCalls.filter(
        (c: WaiterCall) => c.status === 'PENDING' || c.status === 'ACKNOWLEDGED'
      );
      setActiveWaiterCalls(openCalls);
    }
  }, [waiterCallsData]);

  // Setup live clock timer
  useEffect(() => {
    // Dynamic timer tick interval: 10s if single detail order is open, 30s otherwise
    const intervalTime = selectedOrder ? 10000 : 30000;
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalTime);

    return () => clearInterval(timer);
  }, [selectedOrder]);

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

  // Register live Socket.IO events
  useEffect(() => {
    if (!socket || !activeRestaurantId) return;

    socket.emit('join_restaurant', { restaurantId: activeRestaurantId });

    socket.on('order:created', (newOrder: Order) => {
      toast(`New Ticket: Order #${newOrder.orderNumber}`, 'success');
      playChime();

      // Trigger desktop notification
      if (Notification.permission === 'granted') {
        new Notification(`New Order #${newOrder.orderNumber}`, {
          body: `Table ${newOrder.tableId?.displayName || 'QR'} placed a new order.`,
          icon: '/favicon.ico',
        });
      }

      // Add to active orders if not already there
      setActiveOrders((prev) => {
        if (prev.some((o) => o._id === newOrder._id)) return prev;
        return [newOrder, ...prev];
      });
    });

    socket.on('order:status_updated', (data: { orderId: string; status: string }) => {
      // Update in active orders list
      setActiveOrders((prev) => {
        const matching = prev.find((o) => o._id === data.orderId);
        if (!matching) return prev;

        if (data.status === 'SERVED' || data.status === 'CANCELLED') {
          // If transitioned to served/cancelled, remove from active orders
          return prev.filter((o) => o._id !== data.orderId);
        }

        return prev.map((o) => {
          if (o._id === data.orderId) {
            return { ...o, status: data.status as any };
          }
          return o;
        });
      });

      // Update in served orders list
      if (data.status === 'SERVED') {
        // Trigger a served orders reload
        queryClient.invalidateQueries({ queryKey: ['servedOrdersHistory', activeRestaurantId] });
      }

      // Update selected order modal detail if open
      setSelectedOrder((prev) => {
        if (prev && prev._id === data.orderId) {
          return { ...prev, status: data.status as any };
        }
        return prev;
      });
    });

    socket.on('waiter_call:created', (newCall: WaiterCall) => {
      toast(`Table ${newCall.tableNumberSnapshot} calls for waiter!`, 'info');
      playChime();

      if (Notification.permission === 'granted') {
        new Notification(`Table ${newCall.tableNumberSnapshot} calls for a waiter!`, {
          body: 'A customer requires floor service assistance.',
          icon: '/favicon.ico',
        });
      }

      setActiveWaiterCalls((prev) => {
        if (prev.some((c) => c._id === newCall._id)) return prev;
        return [newCall, ...prev];
      });
    });

    socket.on('waiter_call:resolved', (data: { callId: string; status: string }) => {
      if (data.status === 'RESOLVED' || data.status === 'CANCELLED') {
        setActiveWaiterCalls((prev) => prev.filter((c) => c._id !== data.callId));
      } else {
        setActiveWaiterCalls((prev) =>
          prev.map((c) => (c._id === data.callId ? { ...c, status: data.status as any } : c))
        );
      }
    });

    return () => {
      socket.off('order:created');
      socket.off('order:status_updated');
      socket.off('waiter_call:created');
      socket.off('waiter_call:resolved');
    };
  }, [socket, activeRestaurantId, toast, playChime, queryClient]);

  // Mutations
  const ackWaiterCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const res = await apiClient.patch(
        `/restaurants/${activeRestaurantId}/waiter-calls/${callId}/acknowledge`
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast(`Acknowledged Table ${data.data.tableNumberSnapshot} waiter call`, 'success');
      setActiveWaiterCalls((prev) =>
        prev.map((c) => (c._id === data.data._id ? { ...c, status: 'ACKNOWLEDGED' } : c))
      );
    },
    onError: (err: any) => {
      toast(err.response?.data?.error?.message || 'Error acknowledging waiter call', 'error');
    },
  });

  const resolveWaiterCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const res = await apiClient.patch(
        `/restaurants/${activeRestaurantId}/waiter-calls/${callId}/resolve`
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast(`Resolved Table ${data.data.tableNumberSnapshot} waiter call`, 'success');
      setActiveWaiterCalls((prev) => prev.filter((c) => c._id !== data.data._id));
    },
    onError: (err: any) => {
      toast(err.response?.data?.error?.message || 'Error resolving waiter call', 'error');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, nextStatus }: { orderId: string; nextStatus: string }) => {
      const res = await apiClient.patch(
        `/restaurants/${activeRestaurantId}/orders/${orderId}/status`,
        { status: nextStatus }
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast(`Order #${data.data.orderNumber} updated to ${data.data.status}`, 'success');

      // Update state in active/served lists
      setActiveOrders((prev) => {
        if (data.data.status === 'SERVED' || data.data.status === 'CANCELLED') {
          return prev.filter((o) => o._id !== data.data._id);
        }
        return prev.map((o) => (o._id === data.data._id ? data.data : o));
      });

      if (data.data.status === 'SERVED') {
        // reload served orders list
        queryClient.invalidateQueries({ queryKey: ['servedOrdersHistory', activeRestaurantId] });
      }

      // Update detail view modal
      setSelectedOrder((prev) => {
        if (prev && prev._id === data.data._id) {
          return data.data;
        }
        return prev;
      });
    },
    onError: (err: any) => {
      toast(err.response?.data?.error?.message || 'Failed to update order status', 'error');
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiClient.post(
        `/restaurants/${activeRestaurantId}/orders/${orderId}/cancel`
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast(`Order #${data.data.orderNumber} successfully cancelled`, 'info');
      setActiveOrders((prev) => prev.filter((o) => o._id !== data.data._id));
      setOrderToCancel(null);
      setSelectedOrder(null);
    },
    onError: (err: any) => {
      toast(err.response?.data?.error?.message || 'Failed to cancel order', 'error');
    },
  });

  const formatAmount = (amt: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'INR',
    }).format(amt / 100);
  };

  const getNextOrderStatusAndLabel = (currentStatus: string): { status: string; label: string } | null => {
    switch (currentStatus) {
      case 'PENDING':
        return { status: 'ACCEPTED', label: 'Accept Order' };
      case 'ACCEPTED':
        return { status: 'PREPARING', label: 'Start Preparing' };
      case 'PREPARING':
        return { status: 'READY', label: 'Mark as Ready' };
      case 'READY':
        return { status: 'SERVED', label: 'Mark as Served' };
      default:
        return null;
    }
  };

  const statusIcons: Record<string, React.ReactNode> = {
    PENDING: <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" strokeWidth={1.75} />,
    ACCEPTED: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.75} />,
    PREPARING: <ChefHat className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.75} />,
    READY: <Utensils className="w-3.5 h-3.5 text-purple-500" strokeWidth={1.75} />,
    SERVED: <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" strokeWidth={1.75} />,
    CANCELLED: <XCircle className="w-3.5 h-3.5 text-red-500" strokeWidth={1.75} />,
  };

  const statusBadges: Record<string, string> = {
    PENDING: 'bg-amber-50 border-amber-100 text-amber-800',
    ACCEPTED: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    PREPARING: 'bg-indigo-50 border-indigo-100 text-indigo-800',
    READY: 'bg-purple-50 border-purple-100 text-purple-800',
    SERVED: 'bg-blue-50 border-blue-100 text-blue-800',
    CANCELLED: 'bg-red-50 border-red-100 text-red-800',
  };

  // Scoped "today" served list filter (returns only Served orders created today)
  const getTodayServedOrders = () => {
    const todayStr = new Date().toDateString();
    return servedOrders.filter((o) => new Date(o.createdAt).toDateString() === todayStr);
  };

  // Get orders by status
  const getOrdersByStatus = (st: string) => {
    if (st === 'SERVED') {
      return getTodayServedOrders();
    }
    return activeOrders.filter((o) => o.status === st);
  };

  if (!activeRestaurantId) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="h-14 w-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mb-4">
          <AlertCircle className="w-8 h-8" strokeWidth={1.75} />
        </div>
        <h2 className="font-display text-2xl font-bold text-slate-800">No Restaurant Assigned</h2>
        <p className="text-slate-500 text-xs max-w-sm mt-1 leading-relaxed">
          You are currently not associated as a manager or staff member with any restaurant. Please contact a Super Admin.
        </p>
      </div>
    );
  }

  // Common Header component
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
            onClick={() => setActiveTab('orders')}
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
            {activeOrders.length > 0 && (
              <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold font-mono ${
                activeTab === 'orders' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-700'
              }`}>
                {activeOrders.length}
              </span>
            )}
          </button>

          {/* Waiter Calls tab */}
          <button
            onClick={() => setActiveTab('waiter-calls')}
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
            {activeWaiterCalls.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] rounded-full font-bold font-mono bg-amber-500 text-slate-950 animate-pulse">
                {activeWaiterCalls.length}
              </span>
            )}
          </button>

          {/* Menu tab (Manager/Super Admin only) */}
          {!isStaff && (
            <button
              onClick={() => setActiveTab('menu')}
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
              onClick={() => setActiveTab('tables')}
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
              onClick={() => setActiveTab('settings')}
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
              onClick={() => setActiveTab('analytics')}
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
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'profile'
                ? 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4" strokeWidth={1.75} />
            <span>Profile</span>
          </button>

          {/* Super Admin Console */}
          {user?.role === 'SUPER_ADMIN' && (
            <Link
              to="/admin/restaurants"
              className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all"
            >
              <Shield className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
              <span>SuperAdmin Console</span>
            </Link>
          )}

          {/* Coming Soon Seam Dividers */}
          <div className="border-t border-slate-150 my-3 pt-3">
            <p className="text-[9px] text-slate-400 font-extrabold font-mono uppercase tracking-widest px-4 mb-2">Coming Soon (v2)</p>

            <div className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-bold text-slate-400 cursor-not-allowed select-none opacity-60">
              <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>POS Integrations</span>
            </div>

            <div className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-bold text-slate-400 cursor-not-allowed select-none opacity-60">
              <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Inventory Logs</span>
            </div>

            <div className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-bold text-slate-400 cursor-not-allowed select-none opacity-60">
              <ChefHat className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Kitchen Display (KDS)</span>
            </div>

            <div className="flex items-center gap-3 w-full px-4 py-2.5 text-xs font-bold text-slate-400 cursor-not-allowed select-none opacity-60">
              <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Reservations</span>
            </div>
          </div>
        </nav>

        {/* User Footnote */}
        <div className="p-4 border-t border-slate-150 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 font-bold shrink-0 text-sm">
              {user?.name.charAt(0).toUpperCase()}
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
          <AnimatePresence mode="wait">

            {/* ==================== ORDERS VIEW ==================== */}
            {activeTab === 'orders' && (
              <motion.div
                key="orders-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="h-full flex flex-col"
              >
                {/* 1. Mobile Status Tab Switcher Bar */}
                <div className="md:hidden flex items-center gap-1.5 overflow-x-auto px-4 py-3 bg-white border-b border-slate-150 shrink-0 scrollbar-none">
                  {(['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] as const).map((status) => {
                    const ordersCount = getOrdersByStatus(status).length;
                    const displayNames = {
                      PENDING: 'New',
                      ACCEPTED: 'Accepted',
                      PREPARING: 'Preparing',
                      READY: 'Ready',
                      SERVED: 'Served (Today)',
                    };
                    const isActive = mobileStatusTab === status;
                    return (
                      <button
                        key={status}
                        onClick={() => setMobileStatusTab(status)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all duration-150 shrink-0 ${
                          isActive
                            ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span>{displayNames[status]}</span>
                        <span className={`px-1.5 py-0.5 text-[9px] rounded-full font-bold font-mono ${
                          isActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {ordersCount}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 2. Scrollable Orders Kanban Grid */}
                <div className="flex-1 overflow-hidden">

                  {/* MOBILE LIST VIEW */}
                  <div className="md:hidden h-full overflow-y-auto p-4 pb-24">
                    {isLoadingActive ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader className="w-6 h-6 animate-spin text-amber-500" strokeWidth={1.75} />
                      </div>
                    ) : getOrdersByStatus(mobileStatusTab).length === 0 ? (
                      <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-slate-150">
                        <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 mb-3">
                          <Receipt className="w-5 h-5" strokeWidth={1.75} />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">No {mobileStatusTab === 'PENDING' ? 'New' : mobileStatusTab.toLowerCase()} orders</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs">
                          {mobileStatusTab === 'PENDING'
                            ? 'No incoming kitchen tickets right now.'
                            : `There are no orders currently marked as ${mobileStatusTab.toLowerCase()}.`}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {getOrdersByStatus(mobileStatusTab).map((order) => (
                          <div
                            key={order._id}
                            onClick={() => setSelectedOrder(order)}
                            className="bg-white rounded-2xl border border-slate-150 p-4 shadow-sm active:scale-[0.98] transition-all cursor-pointer flex justify-between items-center"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-900">
                                  #{order.orderNumber}
                                </span>
                                <span className="text-xs font-bold text-slate-700">
                                  📍 Table {order.tableId?.displayName || order.tableId?.tableNumber || order.tableId}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 font-mono mt-1">
                                {order.items.length} item{order.items.length > 1 ? 's' : ''} • {formatAmount(order.total)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 font-bold font-mono">
                                {getElapsedTimeLabel(order.createdAt, now)}
                              </span>
                              <ArrowRight className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                            </div>
                          </div>
                        ))}

                        {/* Mobile Served History Load More */}
                        {mobileStatusTab === 'SERVED' && hasMoreServed && (
                          <button
                            onClick={() => setServedPage((p) => p + 1)}
                            disabled={isFetchingServed}
                            className="w-full py-3 bg-white border border-slate-150 rounded-xl text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 hover:bg-slate-50 active:bg-slate-100 transition"
                          >
                            {isFetchingServed ? (
                              <Loader className="w-4 h-4 animate-spin text-slate-400" strokeWidth={1.75} />
                            ) : (
                              <span>Load Older Served Orders</span>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* TABLET / DESKTOP FULL MULTI-COLUMN KANBAN */}
                  <div className="hidden md:flex h-full p-6 gap-4 overflow-x-auto overflow-y-hidden select-none">
                    {(['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] as const).map((status) => {
                      const list = getOrdersByStatus(status);
                      const displayNames = {
                        PENDING: 'New Tickets',
                        ACCEPTED: 'Accepted',
                        PREPARING: 'Preparing',
                        READY: 'Ready for Pickup',
                        SERVED: 'Served Today',
                      };
                      return (
                        <div key={status} className="flex-1 min-w-[240px] max-w-[320px] bg-slate-50/50 border border-slate-150 rounded-3xl flex flex-col overflow-hidden h-full">

                          {/* Column Header */}
                          <div className="p-4 border-b border-slate-150 flex items-center justify-between bg-white shrink-0">
                            <div>
                              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-widest">
                                {displayNames[status]}
                              </h3>
                              <p className="text-[10px] text-slate-500 font-medium font-sans mt-0.5">
                                {list.length} active order{list.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold font-mono text-slate-700">
                              {list.length}
                            </span>
                          </div>

                          {/* Column list */}
                          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-none">
                            {isLoadingActive ? (
                              <div className="flex justify-center items-center py-6">
                                <Loader className="w-5 h-5 animate-spin text-amber-500" strokeWidth={1.75} />
                              </div>
                            ) : list.length === 0 ? (
                              <div className="p-4 border border-dashed border-slate-200 bg-white/50 rounded-2xl text-center py-8">
                                <p className="text-[11px] text-slate-400">Queue is empty</p>
                              </div>
                            ) : (
                              <AnimatePresence initial={false}>
                                {list.map((order) => (
                                  <motion.div
                                    key={order._id}
                                    layoutId={`order-card-${order._id}`}
                                    onClick={() => setSelectedOrder(order)}
                                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -15 }}
                                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                    className="bg-white border border-slate-150 hover:border-slate-300 rounded-2xl p-4 shadow-sm hover:shadow cursor-pointer transition flex flex-col justify-between h-auto gap-3 shrink-0"
                                  >
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-xs font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-900 leading-none">
                                          #{order.orderNumber}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400 font-mono">
                                          {getElapsedTimeLabel(order.createdAt, now)}
                                        </span>
                                      </div>

                                      <h4 className="text-xs font-extrabold text-slate-800 tracking-tight mt-1 truncate">
                                        📍 Table {order.tableId?.displayName || order.tableId?.tableNumber || order.tableId}
                                      </h4>

                                      <p className="text-[10px] text-slate-500 line-clamp-2 mt-1 font-sans">
                                        {order.items.map((item) => `${item.nameSnapshot} (x${item.quantity})`).join(', ')}
                                      </p>
                                    </div>

                                    <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between text-[11px] font-semibold text-slate-700 font-mono mt-auto shrink-0">
                                      <span className="text-slate-400 font-sans text-[10px]">Total</span>
                                      <span>{formatAmount(order.total)}</span>
                                    </div>
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                            )}

                            {/* Column Served History Load More */}
                            {status === 'SERVED' && hasMoreServed && (
                              <button
                                onClick={() => setServedPage((p) => p + 1)}
                                disabled={isFetchingServed}
                                className="w-full py-2.5 border border-dashed border-slate-200 bg-white/35 hover:bg-white/80 rounded-xl text-[11px] font-bold text-slate-500 flex items-center justify-center gap-1.5 transition"
                              >
                                {isFetchingServed ? (
                                  <Loader className="w-3.5 h-3.5 animate-spin text-slate-400" strokeWidth={1.75} />
                                ) : (
                                  <span>Load More History</span>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              </motion.div>
            )}

            {/* ==================== WAITER CALLS VIEW ==================== */}
            {activeTab === 'waiter-calls' && (
              <motion.div
                key="waiter-calls-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="h-full overflow-y-auto p-4 md:p-6 pb-24 flex flex-col"
              >
                <div className="mb-6">
                  <h3 className="font-display text-3xl font-semibold text-slate-900">
                    Floor Service Assistance
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live call buttons triggered server-side from active customer tables.
                  </p>
                </div>

                {isLoadingWaiterCalls ? (
                  <div className="flex-1 flex justify-center items-center py-12">
                    <Loader className="w-8 h-8 animate-spin text-amber-500" strokeWidth={1.75} />
                  </div>
                ) : activeWaiterCalls.length === 0 ? (
                  <div className="flex-1 max-w-lg mx-auto w-full bg-white rounded-3xl border border-slate-150 p-8 text-center flex flex-col items-center justify-center space-y-4 shadow-sm my-auto">
                    <div className="h-14 w-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
                      <CheckCircle2 className="w-7 h-7" strokeWidth={1.75} />
                    </div>
                    <div>
                      <h3 className="font-display text-2xl font-normal text-slate-800">No active calls right now</h3>
                      <p className="text-slate-500 text-xs max-w-xs mx-auto mt-1 leading-relaxed">
                        All floor tables are fully satisfied. New waiter help alerts will blink here instantly when called.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence mode="popLayout">
                      {activeWaiterCalls.map((call) => {
                        const isPending = call.status === 'PENDING';
                        return (
                          <motion.div
                            key={call._id}
                            layout
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className={`p-5 rounded-2xl border flex flex-col justify-between gap-4 shadow-sm transition-all duration-200 ${
                              isPending
                                ? 'bg-amber-50/70 border-amber-200 hover:border-amber-300'
                                : 'bg-slate-50 border-slate-200 opacity-90'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl shrink-0 ${
                                  isPending ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-slate-200 text-slate-500'
                                }`}>
                                  <BellRing className="w-5 h-5" strokeWidth={1.75} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h4 className="text-sm font-extrabold text-slate-900">
                                      Table {call.tableNumberSnapshot}
                                    </h4>
                                    {call.requestType && (
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                        waiterCallTypeDetails[call.requestType]?.bg || 'bg-slate-100 border-slate-200'
                                      } ${
                                        waiterCallTypeDetails[call.requestType]?.text || 'text-slate-700'
                                      }`}>
                                        {waiterCallTypeDetails[call.requestType]?.label || call.requestType}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-mono mt-1">
                                    Requested: {new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>

                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold font-mono tracking-wider uppercase ${
                                isPending ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {call.status}
                              </span>
                            </div>

                            <div className="flex gap-2 shrink-0">
                              {isPending ? (
                                <button
                                  onClick={() => ackWaiterCallMutation.mutate(call._id)}
                                  disabled={ackWaiterCallMutation.isPending}
                                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl transition shadow-sm active:scale-[0.98]"
                                >
                                  Acknowledge Help
                                </button>
                              ) : (
                                <button
                                  onClick={() => resolveWaiterCallMutation.mutate(call._id)}
                                  disabled={resolveWaiterCallMutation.isPending}
                                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl transition shadow-sm active:scale-[0.98]"
                                >
                                  Resolve Assistance
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}

            {/* ==================== MENU VIEW ==================== */}
            {activeTab === 'menu' && !isStaff && (
              <motion.div
                key="menu-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="h-full overflow-y-auto"
              >
                <ManagerMenu />
              </motion.div>
            )}

            {/* ==================== TABLES VIEW ==================== */}
            {activeTab === 'tables' && !isStaff && (
              <motion.div
                key="tables-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="h-full overflow-y-auto"
              >
                <ManagerTables />
              </motion.div>
            )}

            {/* ==================== SETTINGS VIEW ==================== */}
            {activeTab === 'settings' && !isStaff && (
              <motion.div
                key="settings-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="h-full overflow-y-auto"
              >
                <ManagerSettings />
              </motion.div>
            )}

            {/* ==================== ANALYTICS VIEW ==================== */}
            {activeTab === 'analytics' && !isStaff && (
              <motion.div
                key="analytics-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="h-full overflow-hidden"
              >
                <ManagerAnalytics />
              </motion.div>
            )}

            {/* ==================== PROFILE VIEW ==================== */}
            {activeTab === 'profile' && (
              <motion.div
                key="profile-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="h-full overflow-y-auto p-4 md:p-6 pb-24 flex justify-center items-start"
              >
                <div className="max-w-md w-full bg-white rounded-3xl border border-slate-150 shadow-sm overflow-hidden flex flex-col">

                  {/* Top header decoration */}
                  <div className="bg-slate-950 p-6 text-white text-center flex flex-col items-center">
                    <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center text-amber-500 font-extrabold mb-3 text-2xl border border-white/10 shadow-inner">
                      {user?.name.charAt(0).toUpperCase()}
                    </div>
                    <h2 className="font-display tracking-tight text-3xl font-normal">
                      {user?.name}
                    </h2>
                    <span className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 bg-white/10 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono">
                      <Shield className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.75} />
                      {user?.role}
                    </span>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* User account details */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
                        My Account Details
                      </h4>

                      <div className="space-y-2.5">
                        <div className="flex items-center gap-3 text-xs font-semibold text-slate-700 py-1.5 border-b border-slate-100">
                          <Mail className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                          <span className="font-mono">{user?.email}</span>
                        </div>
                      </div>
                    </div>

                    {/* Restaurant Profile details */}
                    {restaurantData?.success && (
                      <div className="space-y-4 border-t border-slate-100 pt-5">
                        <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
                          Active Restaurant Profile
                        </h4>

                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-150 space-y-3">
                          <h3 className="font-bold text-sm text-slate-900">
                            {restaurantData.data.name}
                          </h3>
                          {restaurantData.data.description && (
                            <p className="text-xs text-slate-500 leading-normal font-sans">
                              {restaurantData.data.description}
                            </p>
                          )}

                          <div className="space-y-2.5 pt-2 text-[11px] font-medium text-slate-600">
                            {restaurantData.data.address && (
                              <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" strokeWidth={1.75} />
                                <span>{restaurantData.data.address}</span>
                              </div>
                            )}
                            {restaurantData.data.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.75} />
                                <span className="font-mono">{restaurantData.data.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Logout Button */}
                    <button
                      onClick={logout}
                      className="w-full mt-4 py-3.5 bg-red-50 hover:bg-red-100 border border-red-100 rounded-2xl text-red-600 hover:text-red-700 text-xs font-bold transition flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <LogOut className="w-4 h-4" strokeWidth={1.75} />
                      <span>Log Out from Session</span>
                    </button>
                  </div>

                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* ----------------- BOTTOM BAR (MOBILE ONLY) ----------------- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-150 flex items-center justify-around px-4 pb-safe z-40 shadow-lg">

        {/* Orders */}
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full relative transition-all ${
            activeTab === 'orders' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <Receipt className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] leading-none">Orders</span>
          {activeOrders.length > 0 && (
            <span className="absolute top-2 right-1/4 px-1.5 py-0.5 text-[8px] bg-amber-500 text-slate-950 rounded-full font-bold font-mono border border-white">
              {activeOrders.length}
            </span>
          )}
        </button>

        {/* Waiter Calls */}
        <button
          onClick={() => setActiveTab('waiter-calls')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full relative transition-all ${
            activeTab === 'waiter-calls' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <Bell className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] leading-none">Waiter Calls</span>
          {activeWaiterCalls.length > 0 && (
            <span className="absolute top-2 right-1/4 px-1.5 py-0.5 text-[8px] bg-amber-500 text-slate-950 rounded-full font-bold font-mono border border-white animate-pulse">
              {activeWaiterCalls.length}
            </span>
          )}
        </button>

        {/* Menu (Manager only) */}
        {!isStaff && (
          <button
            onClick={() => setActiveTab('menu')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${
              activeTab === 'menu' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <BookOpen className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[9px] leading-none">Menu</span>
          </button>
        )}

        {/* Tables (Manager only) */}
        {!isStaff && (
          <button
            onClick={() => setActiveTab('tables')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${
              activeTab === 'tables' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <TableProperties className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[9px] leading-none">Tables</span>
          </button>
        )}

        {/* Settings (Manager only) */}
        {!isStaff && (
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${
              activeTab === 'settings' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <Settings className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[9px] leading-none">Settings</span>
          </button>
        )}

        {/* Analytics (Manager only) */}
        {!isStaff && (
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${
              activeTab === 'analytics' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            <BarChart3 className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[9px] leading-none">Analytics</span>
          </button>
        )}

        {/* Profile */}
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${
            activeTab === 'profile' ? 'text-slate-950 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <User className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] leading-none">Profile</span>
        </button>
      </nav>

      {/* ==========================================
          ORDER DETAIL MODAL / DRAWER
          ========================================== */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 z-50 overflow-hidden select-none">

            {/* Modal Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="absolute inset-0 cursor-pointer"
            />

            {/* Modal Body Container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative bg-white rounded-t-[2.5rem] md:rounded-3xl w-full max-w-lg md:max-w-md max-h-[85vh] md:max-h-[90vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden z-10"
            >

              {/* Top drag handle indicator for mobile styling */}
              <div className="md:hidden h-1.5 w-12 bg-slate-250 rounded-full mx-auto my-3 shrink-0" />

              {/* Modal Header */}
              <div className="px-5 md:px-6 pb-4 border-b border-slate-150 flex items-start justify-between bg-slate-50/50 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-extrabold text-slate-950">
                      Order #{selectedOrder.orderNumber}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold font-mono tracking-wider ${
                      statusBadges[selectedOrder.status]
                    }`}>
                      {statusIcons[selectedOrder.status]}
                      <span>{selectedOrder.status}</span>
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Received: {new Date(selectedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • {getElapsedTimeLabel(selectedOrder.createdAt, now)}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition shrink-0"
                >
                  <X className="w-5 h-5" strokeWidth={1.75} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 space-y-5">
                {/* Location indicator */}
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3 flex items-center gap-2.5 font-bold text-xs text-slate-700">
                  <span className="text-base leading-none">📍</span>
                  <span>Table {selectedOrder.tableId?.displayName || selectedOrder.tableId?.tableNumber || selectedOrder.tableId}</span>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Ticket Items ({selectedOrder.items.length})
                  </h4>

                  <div className="divide-y divide-slate-100">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="py-3 first:pt-0 last:pb-0 text-xs">
                        <div className="flex justify-between font-extrabold text-slate-900 items-start">
                          <span className="flex-1 min-w-0 pr-2 leading-relaxed">
                            {item.nameSnapshot} <span className="font-mono text-slate-400 font-bold text-[10px]">x{item.quantity}</span>
                          </span>
                          <span className="font-mono text-slate-700 shrink-0 font-extrabold">
                            {formatAmount(item.unitPriceSnapshot * item.quantity)}
                          </span>
                        </div>

                        {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                          <div className="text-[10px] text-slate-400 font-sans italic mt-1 pl-2">
                            + {item.selectedAddOns.map((x) => `${x.name} (${formatAmount(x.priceDelta)})`).join(', ')}
                          </div>
                        )}

                        {/* Special Instructions (Prominent for kitchen staff) */}
                        {item.specialInstructions && (
                          <div className="flex gap-1.5 items-start mt-2 text-[11px] bg-amber-50 border border-amber-100 text-amber-800 p-2.5 rounded-xl italic font-sans leading-relaxed">
                            <FileText className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" strokeWidth={1.75} />
                            <span>"{item.specialInstructions}"</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Customer global order Note */}
                {selectedOrder.customerNote && (
                  <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-2xl text-xs space-y-1">
                    <span className="font-extrabold text-slate-500 block text-[10px] uppercase tracking-wider">
                      Customer Note
                    </span>
                    <p className="text-slate-600 leading-relaxed italic font-sans">
                      "{selectedOrder.customerNote}"
                    </p>
                  </div>
                )}

                {/* Totals computation */}
                <div className="border-t border-slate-150 pt-3.5 space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium font-sans">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatAmount(selectedOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium font-sans">
                    <span>Tax & Service Charge</span>
                    <span className="font-mono">{formatAmount(selectedOrder.tax)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-900 pt-1.5 border-t border-dashed border-slate-150">
                    <span className="font-sans text-xs">Total Bill Amount</span>
                    <span className="text-base font-black font-mono">
                      {formatAmount(selectedOrder.total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="p-5 md:p-6 bg-slate-50/50 border-t border-slate-150 flex flex-col md:flex-row gap-3 shrink-0">

                {/* Cancel Ticket (role check: MANAGERS / SUPER_ADMIN) */}
                {!isStaff && (selectedOrder.status === 'PENDING' || selectedOrder.status === 'ACCEPTED' || selectedOrder.status === 'PREPARING' || selectedOrder.status === 'READY') && (
                  <button
                    onClick={() => setOrderToCancel(selectedOrder)}
                    className="flex-1 py-3.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-extrabold rounded-2xl transition active:scale-[0.98]"
                  >
                    Cancel Order
                  </button>
                )}

                {/* Forward Progress Button */}
                {(() => {
                  const nextAction = getNextOrderStatusAndLabel(selectedOrder.status);
                  if (nextAction) {
                    return (
                      <button
                        onClick={() =>
                          updateStatusMutation.mutate({
                            orderId: selectedOrder._id,
                            nextStatus: nextAction.status,
                          })
                        }
                        disabled={updateStatusMutation.isPending}
                        className="flex-1 py-3.5 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-extrabold rounded-2xl transition flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98]"
                      >
                        <span>{nextAction.label}</span>
                        <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    );
                  }
                  return (
                    <div className="flex-1 py-3.5 bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold rounded-2xl text-center select-none">
                      Successfully Served Ticket
                    </div>
                  );
                })()}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          CONFIRM ORDER CANCELLATION MODAL
          ========================================== */}
      <AnimatePresence>
        {orderToCancel && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100"
            >
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <HelpCircle className="w-6 h-6 shrink-0" strokeWidth={1.75} />
                <h3 className="font-bold text-lg leading-none">Cancel Kitchen Order?</h3>
              </div>

              <p className="text-slate-600 text-xs leading-relaxed mb-6 font-sans">
                Are you sure you want to cancel <strong>Order #{orderToCancel.orderNumber}</strong>? This action cannot be undone and will immediately notify the customer table.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOrderToCancel(null)}
                  className="w-1/2 py-3 border border-slate-200 text-slate-600 text-xs font-extrabold rounded-xl hover:bg-slate-50 transition active:scale-[0.98]"
                >
                  No, Keep It
                </button>
                <button
                  type="button"
                  onClick={() => cancelOrderMutation.mutate(orderToCancel._id)}
                  disabled={cancelOrderMutation.isPending}
                  className="w-1/2 py-3 bg-red-600 text-white text-xs font-extrabold rounded-xl hover:bg-red-700 transition active:scale-[0.98]"
                >
                  Yes, Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default ManagerOrders;
