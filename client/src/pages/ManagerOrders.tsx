import React, { useState, useEffect } from 'react';
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
  Loader,
  ArrowRight,
  Receipt,
  FileText,
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

export const ManagerOrders: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('');

  const activeRestaurantId = user?.restaurants?.[0];
  const isStaff = user?.role === 'STAFF';

  // State to hold and manage orders locally so we can animate real-time insertions/updates smoothly
  const [localOrders, setLocalOrders] = useState<Order[]>([]);

  // 1. Hook up live Socket.IO connection
  const token = localStorage.getItem('accessToken');
  const { socket, status: connectionStatus } = useSocket(token);

  // Fetch active queue
  const { data: activeData, isLoading: isLoadingActive, dataUpdatedAt: activeUpdatedAt } = useQuery({
    queryKey: ['activeOrders', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/orders/active`);
      return res.data;
    },
    enabled: !!activeRestaurantId && activeTab === 'active',
  });

  // Fetch paginated history
  const { data: historyData, isLoading: isLoadingHistory, dataUpdatedAt: historyUpdatedAt } = useQuery({
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

  // Sync React Query data to local state when REST fetches complete
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

  // Connect socket and register live events
  useEffect(() => {
    if (!socket || !activeRestaurantId) return;

    // Join authenticated restaurant room
    socket.emit('join_restaurant', { restaurantId: activeRestaurantId });

    // Handle order created (Prepend order summary)
    socket.on('order:created', (newOrder: Order) => {
      if (activeTab === 'active') {
        toast(`New Ticket Placed: Order #${newOrder.orderNumber}`, 'success');
        setLocalOrders((prev) => {
          // Prevent duplicates
          if (prev.some((o) => o._id === newOrder._id)) return prev;
          return [newOrder, ...prev];
        });
      }
    });

    // Handle live status updates (runs for both timeline and histories)
    socket.on('order:status_updated', (data: { orderId: string; status: string }) => {
      setLocalOrders((prev) => {
        const matching = prev.find((o) => o._id === data.orderId);
        if (!matching) return prev;

        // If we're on the live active tab, and status transitions out of active state (served/cancelled)
        // Let's filter it out of the list so it animates out!
        if (activeTab === 'active' && (data.status === 'SERVED' || data.status === 'CANCELLED')) {
          return prev.filter((o) => o._id !== data.orderId);
        }

        // Otherwise, update status inline
        return prev.map((o) => {
          if (o._id === data.orderId) {
            return {
              ...o,
              status: data.status as any,
            };
          }
          return o;
        });
      });
    });

    return () => {
      socket.off('order:created');
      socket.off('order:status_updated');
    };
  }, [socket, activeRestaurantId, activeTab, toast]);

  // Update status mutation
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

  if (!activeRestaurantId) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 font-sans">
        <Loader className="w-12 h-12 text-amber-500 mb-4 animate-pulse" />
        <h2 className="font-display text-2xl font-normal text-slate-800">No Restaurant Assigned</h2>
        <p className="text-slate-500 text-sm max-w-sm mt-1 leading-relaxed">
          You are currently not associated with any restaurant as managers or staff. Please contact a Super Admin.
        </p>
      </div>
    );
  }

  const formatAmount = (amt: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'INR',
    }).format(amt / 100);
  };

  const getNextStatus = (currentStatus: string): string | null => {
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
  const isLoading = activeTab === 'active' ? isLoadingActive : isLoadingHistory;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display tracking-tight text-4xl font-normal text-slate-900">
              Order Board
            </h1>
            <ConnectionIndicator status={connectionStatus as ConnectionStatus} />
          </div>
          <p className="text-slate-500 text-sm mt-0.5">Manage live ticket queues, cooking phases, and order statuses</p>
        </div>

        {/* Tab triggers */}
        <div className="flex border border-slate-200 rounded-xl bg-slate-50 p-1 shrink-0">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'active'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Live Active Queue ({activeTab === 'active' ? localOrders.length : '...'})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Order History
          </button>
        </div>
      </div>

      {/* History status filter */}
      {activeTab === 'history' && (
        <div className="flex gap-2 items-center mb-6 overflow-x-auto pb-1.5">
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

      {isLoading && localOrders.length === 0 ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : localOrders.length === 0 ? (
        <div className="min-h-[40vh] bg-white rounded-3xl border border-slate-100 p-8 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
          <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
            <Receipt className="w-7 h-7" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="font-display text-2xl font-normal text-slate-800">No Orders Found</h3>
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
              const nextStatus = getNextStatus(order.status);
              return (
                <motion.div
                  key={order._id}
                  layout
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} // premium exit/entrance matching design system
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
