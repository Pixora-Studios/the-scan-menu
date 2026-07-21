import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react';
import apiClient from '../lib/api';

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
  createdAt: string;
}

export const ManagerOrders: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('');

  const activeRestaurantId = user?.restaurants?.[0];
  const isStaff = user?.role === 'STAFF';

  // State to hold and manage orders locally for real-time transitions
  const [localOrders, setLocalOrders] = useState<Order[]>([]);

  // State to hold active waiter calls
  const [activeWaiterCalls, setActiveWaiterCalls] = useState<WaiterCall[]>([]);

  // Browser alerts & notification settings
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // 1. Hook up live Socket.IO connection
  const token = localStorage.getItem('accessToken');
  const { socket, status: connectionStatus } = useSocket(token);

  // Fetch active queue
  const { data: activeData, dataUpdatedAt: activeUpdatedAt } = useQuery({
    queryKey: ['activeOrders', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/orders/active`);
      return res.data;
    },
    enabled: !!activeRestaurantId && activeTab === 'active',
  });

  // Fetch paginated history
  const { data: historyData, dataUpdatedAt: historyUpdatedAt } = useQuery({
    queryKey: ['historyOrders', activeRestaurantId, historyPage, historyStatusFilter],
    queryFn: async () => {
      const statusParam = historyStatusFilter ? `&status=${historyStatusFilter}` : '';
      const res = await apiClient.get(
        `/restaurants/${activeRestaurantId}/orders?page=${historyPage}&limit=10${statusParam}`
      );
      return res.data;
    },
    enabled: !!activeRestaurantId && activeTab === 'history',
  });

  // Fetch live waiter calls on load
  const { data: waiterCallsData } = useQuery({
    queryKey: ['waiterCalls', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/waiter-calls?limit=50`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  // Sync React Query data to local state
  useEffect(() => {
    if (activeTab === 'active' && activeData?.success) {
      setLocalOrders(activeData.data);
    }
  }, [activeData, activeTab, activeUpdatedAt]);

  useEffect(() => {
    if (activeTab === 'history' && historyData?.success) {
      setLocalOrders(historyData.data.orders);
    }
  }, [historyData, activeTab, historyUpdatedAt]);

  useEffect(() => {
    if (waiterCallsData?.success) {
      // Show only active waiter calls (PENDING or ACKNOWLEDGED)
      const openCalls = waiterCallsData.data.waiterCalls.filter(
        (c: WaiterCall) => c.status === 'PENDING' || c.status === 'ACKNOWLEDGED'
      );
      setActiveWaiterCalls(openCalls);
    }
  }, [waiterCallsData]);

  // Synthesis-based sound notification chime
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

      const now = ctx.currentTime;
      playNote(523.25, now, 0.4); // C5
      playNote(659.25, now + 0.15, 0.5); // E5
    } catch (err) {
      console.error('Synthesized sound play failed:', err);
    }
  }, [soundEnabled]);

  // Sync notification permissions on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setAlertsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Request browser notification permission
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

  // Register live Socket events
  useEffect(() => {
    if (!socket || !activeRestaurantId) return;

    // Join authenticated restaurant room
    socket.emit('join_restaurant', { restaurantId: activeRestaurantId });

    // Handle order created
    socket.on('order:created', (newOrder: Order) => {
      if (activeTab === 'active') {
        toast(`New Ticket: Order #${newOrder.orderNumber}`, 'success');
        playChime();
        setLocalOrders((prev) => {
          if (prev.some((o) => o._id === newOrder._id)) return prev;
          return [newOrder, ...prev];
        });
      }
    });

    // Handle live order status updates
    socket.on('order:status_updated', (data: { orderId: string; status: string }) => {
      setLocalOrders((prev) => {
        const matching = prev.find((o) => o._id === data.orderId);
        if (!matching) return prev;

        if (activeTab === 'active' && (data.status === 'SERVED' || data.status === 'CANCELLED')) {
          return prev.filter((o) => o._id !== data.orderId);
        }

        return prev.map((o) => {
          if (o._id === data.orderId) {
            return { ...o, status: data.status as any };
          }
          return o;
        });
      });
    });

    // Handle waiter call created
    socket.on('waiter_call:created', (newCall: WaiterCall) => {
      toast(`Table ${newCall.tableNumberSnapshot} called for a waiter!`, 'info');
      playChime();

      // Trigger desktop notification
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

    // Handle waiter call status updates/resolutions
    socket.on('waiter_call:resolved', (data: { callId: string; status: string }) => {
      if (data.status === 'RESOLVED' || data.status === 'CANCELLED') {
        setActiveWaiterCalls((prev) => prev.filter((c) => c._id !== data.callId));
      } else {
        // Update inline status (like ACKNOWLEDGED)
        setActiveWaiterCalls((prev) =>
          prev.map((c) => {
            if (c._id === data.callId) {
              return { ...c, status: data.status as any };
            }
            return c;
          })
        );
      }
    });

    return () => {
      socket.off('order:created');
      socket.off('order:status_updated');
      socket.off('waiter_call:created');
      socket.off('waiter_call:resolved');
    };
  }, [socket, activeRestaurantId, activeTab, toast, soundEnabled, playChime]);

  // Acknowledge waiter call mutation
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

  // Resolve waiter call mutation
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

  // Update order status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, nextStatus }: { orderId: string; nextStatus: string }) => {
      const res = await apiClient.patch(
        `/restaurants/${activeRestaurantId}/orders/${orderId}/status`,
        { status: nextStatus }
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast(`Order #${data.data.orderNumber} status updated to ${data.data.status}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['activeOrders', activeRestaurantId] });
      queryClient.invalidateQueries({ queryKey: ['historyOrders', activeRestaurantId] });
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error?.message || 'Failed to update order status';
      toast(errMsg, 'error');
    },
  });

  // Cancel order mutation
  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiClient.post(
        `/restaurants/${activeRestaurantId}/orders/${orderId}/cancel`
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast(`Order #${data.data.orderNumber} successfully cancelled`, 'info');
      queryClient.invalidateQueries({ queryKey: ['activeOrders', activeRestaurantId] });
      queryClient.invalidateQueries({ queryKey: ['historyOrders', activeRestaurantId] });
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error?.message || 'Failed to cancel order';
      toast(errMsg, 'error');
    },
  });

  const formatAmount = (amt: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'INR',
    }).format(amt / 100);
  };

  const getNextOrderStatus = (currentStatus: string): string | null => {
    switch (currentStatus) {
      case 'PENDING':
        return 'ACCEPTED';
      case 'ACCEPTED':
        return 'PREPARING';
      case 'PREPARING':
        return 'READY';
      case 'READY':
        return 'SERVED';
      default:
        return null;
    }
  };

  const statusIcons: Record<string, React.ReactNode> = {
    PENDING: <Clock className="w-4 h-4 text-amber-500" />,
    ACCEPTED: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    PREPARING: <ChefHat className="w-4 h-4 text-indigo-500" />,
    READY: <Utensils className="w-4 h-4 text-purple-500" />,
    SERVED: <CheckCircle2 className="w-4 h-4 text-blue-500" />,
    CANCELLED: <XCircle className="w-4 h-4 text-red-500" />,
  };

  const statusBadges: Record<string, string> = {
    PENDING: 'bg-amber-50 border-amber-100 text-amber-800',
    ACCEPTED: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    PREPARING: 'bg-indigo-50 border-indigo-100 text-indigo-800',
    READY: 'bg-purple-50 border-purple-100 text-purple-800',
    SERVED: 'bg-blue-50 border-blue-100 text-blue-800',
    CANCELLED: 'bg-red-50 border-red-100 text-red-800',
  };

  const pagination = activeTab === 'history' ? historyData?.data?.pagination : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 font-sans space-y-8">
      {/* Top operational controls & Live indicators */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display tracking-tight text-4xl font-normal text-slate-900">
              Kitchen Board
            </h1>
            <ConnectionIndicator status={connectionStatus as ConnectionStatus} />
          </div>
          <p className="text-slate-500 text-xs mt-0.5">Real-time incoming tickets and floor assistance dashboard</p>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              soundEnabled
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-100 border-slate-200 text-slate-400'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundEnabled ? 'Chime On' : 'Chime Off'}</span>
          </button>

          {/* Desktop Push Alerts toggle */}
          <button
            onClick={handleToggleAlerts}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              alertsEnabled
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <BellRing className="w-4 h-4" />
            <span>{alertsEnabled ? 'Push Alerts On' : 'Enable Push Alerts'}</span>
          </button>

          {/* Active / History toggles */}
          <div className="flex border border-slate-200 rounded-xl bg-slate-50 p-1">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'active'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Active Queue ({activeTab === 'active' ? localOrders.length : '...'})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              History
            </button>
          </div>
        </div>
      </div>

      {/* ==========================================
          WAITER CALLS LIVE NOTIFICATION BANNER SECTION
          ========================================== */}
      <AnimatePresence>
        {activeWaiterCalls.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            <h3 className="text-xs font-extrabold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
              <BellRing className="w-4 h-4 text-amber-500 animate-bounce" />
              Floor Assistance Required ({activeWaiterCalls.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeWaiterCalls.map((call) => {
                const isPending = call.status === 'PENDING';
                return (
                  <motion.div
                    key={call._id}
                    layout
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className={`p-4 rounded-2xl border flex items-center justify-between gap-4 shadow-sm ${
                      isPending ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-90'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white p-2.5 rounded-xl shadow-inner shrink-0 text-amber-600">
                        <BellRing className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-950">
                          Table {call.tableNumberSnapshot}
                        </h4>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {isPending ? 'Waiting...' : 'Staff Acknowledged'}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {isPending ? (
                        <button
                          onClick={() => ackWaiterCallMutation.mutate(call._id)}
                          className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-xl transition shadow-sm"
                        >
                          Acknowledge
                        </button>
                      ) : (
                        <button
                          onClick={() => resolveWaiterCallMutation.mutate(call._id)}
                          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] rounded-xl transition shadow-sm"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==========================================
          ORDERS LIST BOARD
          ========================================== */}
      <div className="space-y-6">
        {/* History status filter */}
        {activeTab === 'history' && (
          <div className="flex gap-2 items-center overflow-x-auto pb-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide shrink-0 mr-2">Filter status:</span>
            {['', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setHistoryStatusFilter(st);
                  setHistoryPage(1);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap tracking-wide border transition-all ${
                  historyStatusFilter === st
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {st || 'All Orders'}
              </button>
            ))}
          </div>
        )}

        {localOrders.length === 0 ? (
          <div className="min-h-[40vh] bg-white rounded-3xl border border-slate-100 p-8 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
            <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
              <Receipt className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="font-display text-2xl font-normal text-slate-800">No Tickets Found</h3>
              <p className="text-slate-500 text-xs max-w-xs mx-auto mt-1 leading-relaxed">
                {activeTab === 'active'
                  ? 'There are currently no active tickets waiting to be prepared in the kitchen.'
                  : 'No historical order records match your chosen status filter.'}
              </p>
            </div>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {localOrders.map((order) => {
                const nextStatus = getNextOrderStatus(order.status);
                return (
                  <motion.div
                    key={order._id}
                    layout
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition"
                  >
                    {/* Card Header */}
                    <div className="p-5 border-b border-slate-50 flex items-start justify-between bg-slate-50/50">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            Order #{order.orderNumber}
                          </span>
                          <span className="text-[10px] bg-slate-200 text-slate-600 rounded px-1.5 py-0.5 font-bold uppercase font-mono tracking-wider">
                            {order.source}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 font-mono">
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 border rounded-full text-xs font-semibold tracking-wide ${
                          statusBadges[order.status]
                        }`}
                      >
                        {statusIcons[order.status]}
                        {order.status}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 flex-1 space-y-4">
                      {/* Table Info */}
                      <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100/50 font-bold text-slate-700">
                        📍 {order.tableId?.displayName || `Table ID: ${order.tableId}`}
                      </div>

                      {/* Items */}
                      <div className="space-y-3 divide-y divide-slate-50">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="pt-2.5 first:pt-0 text-xs">
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>
                                {item.nameSnapshot} <span className="font-mono text-slate-400">x{item.quantity}</span>
                              </span>
                              <span className="font-mono">{formatAmount(item.unitPriceSnapshot * item.quantity)}</span>
                            </div>
                            {item.selectedAddOns.length > 0 && (
                              <p className="text-[10px] text-slate-400 italic mt-0.5">
                                + {item.selectedAddOns.map((x) => x.name).join(', ')}
                              </p>
                            )}
                            {item.specialInstructions && (
                              <div className="flex gap-1 items-start mt-1 text-[10px] bg-amber-50/40 text-amber-700 px-2 py-1 rounded-lg border border-amber-100/30 italic">
                                <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>"{item.specialInstructions}"</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Customer order Note */}
                      {order.customerNote && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                          <span className="font-bold text-slate-600 block mb-1">Customer Note:</span>
                          <p className="text-slate-600 leading-relaxed italic">"{order.customerNote}"</p>
                        </div>
                      )}

                      {/* Totals */}
                      <div className="border-t border-slate-50 pt-3 flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-semibold">Grand Total</span>
                        <span className="text-sm font-black text-slate-900 font-mono">
                          {formatAmount(order.total)}
                        </span>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="p-5 bg-slate-50/50 border-t border-slate-50 flex gap-3">
                      {/* Cancel button */}
                      {!isStaff && (order.status === 'PENDING' || order.status === 'ACCEPTED') && (
                        <button
                          onClick={() => {
                            if (confirm(`Cancel Order #${order.orderNumber}?`)) {
                              cancelMutation.mutate(order._id);
                            }
                          }}
                          className="flex-1 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-xl transition animate-none"
                        >
                          Cancel Order
                        </button>
                      )}

                      {/* Forward transition action button */}
                      {nextStatus ? (
                        <button
                          onClick={() =>
                            updateStatusMutation.mutate({ orderId: order._id, nextStatus })
                          }
                          className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 shadow-sm animate-none"
                        >
                          <span>Mark {nextStatus}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="flex-1 py-2.5 bg-slate-100 text-slate-400 text-xs font-bold rounded-xl text-center select-none">
                          Complete
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Pagination indicators for history */}
      {activeTab === 'history' && pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-8">
          <button
            disabled={historyPage === 1}
            onClick={() => setHistoryPage((p) => p - 1)}
            className="px-3.5 py-1.5 border border-slate-200 text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-slate-50 transition"
          >
            Prev
          </button>
          <span className="text-xs font-bold text-slate-600 font-mono">
            Page {historyPage} of {pagination.totalPages}
          </span>
          <button
            disabled={historyPage === pagination.totalPages}
            onClick={() => setHistoryPage((p) => p + 1)}
            className="px-3.5 py-1.5 border border-slate-200 text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-slate-50 transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default ManagerOrders;
