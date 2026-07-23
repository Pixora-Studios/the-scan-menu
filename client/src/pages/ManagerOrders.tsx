import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  Utensils,
  XCircle,
  ArrowRight,
  FileText,
  Loader,
  AlertCircle,
  X,
  HelpCircle,
} from 'lucide-react';
import apiClient from '../lib/api';

interface OrderItem {
  nameSnapshot: string;
  unitPriceSnapshot: number;
  quantity: number;
  selectedAddOns: { name: string; priceDelta: number }[];
  specialInstructions?: string;
  prepTimeMinutesSnapshot?: number;
  itemStatus?: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';
}

interface Order {
  _id: string;
  restaurantId: string;
  tableId: { displayName: string; tableNumber: string } | any;
  sessionId?: string;
  roundNumber?: number;
  isMerged?: boolean;
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
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mobile sub-status tab switcher state
  const [mobileStatusTab, setMobileStatusTab] = useState<'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED'>('PENDING');

  // Page for served history pagination
  const [servedPage, setServedPage] = useState(1);
  const [servedOrders, setServedOrders] = useState<Order[]>([]);
  const [hasMoreServed, setHasMoreServed] = useState(true);

  // Modal / detail states
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  // Live Timer references
  const [now, setNow] = useState<Date>(new Date());

  const activeRestaurantId = user?.restaurants?.[0];
  const isStaff = user?.role === 'STAFF';

  // 1. Fetch Active Orders (not served or cancelled)
  const { data: activeOrdersResponse, isLoading: isLoadingActive } = useQuery({
    queryKey: ['activeOrdersQueue', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/orders/active`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  const activeOrders = activeOrdersResponse?.success ? activeOrdersResponse.data : [];

  const updateItemStatusMutation = useMutation({
    mutationFn: async ({ orderId, itemIndex, nextItemStatus }: { orderId: string; itemIndex: number; nextItemStatus: string }) => {
      const res = await apiClient.patch(
        `/restaurants/${activeRestaurantId}/orders/${orderId}/items/${itemIndex}/status`,
        { itemStatus: nextItemStatus }
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast('Item status updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['activeOrdersQueue', activeRestaurantId] });
      queryClient.invalidateQueries({ queryKey: ['servedOrdersHistory', activeRestaurantId] });
      setSelectedOrder((prev) => {
        if (prev && prev._id === data.data._id) {
          return data.data;
        }
        return prev;
      });
    },
    onError: (err: any) => {
      toast(err.response?.data?.error?.message || 'Failed to update item status', 'error');
    },
  });

  const getNextItemStatus = (currentStatus?: string) => {
    switch (currentStatus) {
      case 'PENDING': return 'PREPARING';
      case 'PREPARING': return 'READY';
      case 'READY': return 'SERVED';
      default: return null;
    }
  };

  // 2. Fetch Served Orders (for SERVED column / tab, with page limits and scoping)
  const { data: servedOrdersData, isFetching: isFetchingServed } = useQuery({
    queryKey: ['servedOrdersHistory', activeRestaurantId, servedPage],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/orders?status=SERVED&page=${servedPage}&limit=15`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

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

  // Setup live clock timer
  useEffect(() => {
    // Dynamic timer tick interval: 10s if single detail order is open, 30s otherwise
    const intervalTime = selectedOrder ? 10000 : 30000;
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalTime);

    return () => clearInterval(timer);
  }, [selectedOrder]);

  // Mutations
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

      // Invalidate queries so that latest is fetched
      queryClient.invalidateQueries({ queryKey: ['activeOrdersQueue', activeRestaurantId] });
      queryClient.invalidateQueries({ queryKey: ['servedOrdersHistory', activeRestaurantId] });

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
      queryClient.invalidateQueries({ queryKey: ['activeOrdersQueue', activeRestaurantId] });
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

  // Get orders by status, grouped/sorted visually by table name to cluster them
  const getOrdersByStatus = (st: string) => {
    let list = [];
    if (st === 'SERVED') {
      list = getTodayServedOrders();
    } else {
      list = activeOrders.filter((o: Order) => o.status === st);
    }
    return [...list].sort((a, b) => {
      const nameA = (a.tableId?.displayName || a.tableId?.tableNumber || '').toString();
      const nameB = (b.tableId?.displayName || b.tableId?.tableNumber || '').toString();
      return nameA.localeCompare(nameB);
    });
  };

  if (!activeRestaurantId) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center font-sans">
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

  return (
    <div className="h-full flex flex-col overflow-hidden select-none">

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
                <FileText className="w-5 h-5" strokeWidth={1.75} />
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
              {getOrdersByStatus(mobileStatusTab).map((order: Order) => (
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
        <div className="hidden md:grid xl:flex xl:h-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:flex-row p-6 gap-4 overflow-y-auto xl:overflow-y-hidden xl:overflow-x-auto select-none custom-scrollbar">
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
              <div key={status} className="flex-1 min-w-[200px] xl:max-w-[320px] bg-slate-50/50 border border-slate-150 rounded-3xl flex flex-col overflow-hidden h-[400px] xl:h-full">

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
                          {list.map((order: Order) => (
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

                            {(() => {
                              const itemsWithOriginalIndex = order.items.map((item, idx) => ({ ...item, originalIndex: idx }));
                              const sortedItems = [...itemsWithOriginalIndex].sort((a, b) => (a.prepTimeMinutesSnapshot || 10) - (b.prepTimeMinutesSnapshot || 10));
                              return (
                                <div className="mt-2.5 space-y-2" onClick={(e) => e.stopPropagation()}>
                                  {sortedItems.map((item) => {
                                    const nextStatus = getNextItemStatus(item.itemStatus);
                                    const isServed = item.itemStatus === 'SERVED';
                                    return (
                                      <div key={item.originalIndex} className="flex items-center justify-between gap-1 text-[11px]">
                                        <label className="flex items-center gap-1.5 cursor-pointer min-w-0 flex-1">
                                          <input
                                            type="checkbox"
                                            checked={isServed}
                                            disabled={isServed || updateItemStatusMutation.isPending}
                                            onChange={() => {
                                              if (nextStatus) {
                                                updateItemStatusMutation.mutate({
                                                  orderId: order._id,
                                                  itemIndex: item.originalIndex,
                                                  nextItemStatus: nextStatus,
                                                });
                                              }
                                            }}
                                            className="w-3.5 h-3.5 rounded border-slate-300 accent-amber-500 cursor-pointer shrink-0"
                                          />
                                          <span className={`truncate text-xs font-semibold leading-none ${isServed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                            {item.nameSnapshot} <strong className="text-slate-400 font-mono text-[10px]">x{item.quantity}</strong>
                                          </span>
                                        </label>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {item.prepTimeMinutesSnapshot && item.prepTimeMinutesSnapshot <= 10 && (
                                            <span className="text-[8px] bg-amber-50 border border-amber-100 text-amber-700 px-1 py-0.2 rounded font-extrabold font-sans tracking-wide uppercase shrink-0">
                                              Quick
                                            </span>
                                          )}
                                          <span className="text-[9px] text-slate-400 font-bold font-mono shrink-0">
                                            {item.itemStatus || 'PENDING'}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
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
                    <span className="font-mono text-base font-extrabold text-slate-900">
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
                    {(() => {
                      const itemsWithOriginalIndex = selectedOrder.items.map((item, idx) => ({ ...item, originalIndex: idx }));
                      const sortedItems = [...itemsWithOriginalIndex].sort((a, b) => (a.prepTimeMinutesSnapshot || 10) - (b.prepTimeMinutesSnapshot || 10));
                      return sortedItems.map((item) => {
                        const nextStatus = getNextItemStatus(item.itemStatus);
                        const isServed = item.itemStatus === 'SERVED';
                        return (
                          <div key={item.originalIndex} className="py-3 first:pt-0 last:pb-0 text-xs flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-3">
                              <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isServed}
                                  disabled={isServed || updateItemStatusMutation.isPending}
                                  onChange={() => {
                                    if (nextStatus) {
                                      updateItemStatusMutation.mutate({
                                        orderId: selectedOrder._id,
                                        itemIndex: item.originalIndex,
                                        nextItemStatus: nextStatus,
                                      });
                                    }
                                  }}
                                  className="w-4.5 h-4.5 rounded border-slate-300 accent-amber-500 cursor-pointer shrink-0 mt-0.5"
                                />
                                <div className="min-w-0 flex-1">
                                  <span className={`text-sm font-extrabold leading-tight ${isServed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                    {item.nameSnapshot} <span className="font-mono text-slate-400 font-bold text-xs">x{item.quantity}</span>
                                  </span>
                                  {item.prepTimeMinutesSnapshot && item.prepTimeMinutesSnapshot <= 10 && (
                                    <span className="inline-block ml-2 text-[8px] bg-amber-50 border border-amber-100 text-amber-700 px-1 py-0.2 rounded font-extrabold font-sans tracking-wide uppercase">
                                      Quick
                                    </span>
                                  )}
                                </div>
                              </label>
                              <div className="flex flex-col items-end shrink-0">
                                <span className="font-mono text-slate-700 font-extrabold">
                                  {formatAmount(item.unitPriceSnapshot * item.quantity)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold font-mono">
                                  {item.itemStatus || 'PENDING'}
                                </span>
                              </div>
                            </div>

                            {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                              <div className="text-[10px] text-slate-400 font-sans italic pl-7">
                                + {item.selectedAddOns.map((x) => `${x.name} (${formatAmount(x.priceDelta)})`).join(', ')}
                              </div>
                            )}

                            {/* Special Instructions (Prominent for kitchen staff) */}
                            {item.specialInstructions && (
                              <div className="flex gap-1.5 items-start text-[11px] bg-amber-50 border border-amber-100 text-amber-800 p-2.5 rounded-xl italic font-sans leading-relaxed ml-7">
                                <FileText className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" strokeWidth={1.75} />
                                <span>"{item.specialInstructions}"</span>
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
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
              <div className="p-5 md:p-6 bg-slate-50/50 border-t border-slate-150 flex flex-col gap-3 shrink-0">
                <div className="flex flex-col md:flex-row gap-3">
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

                {selectedOrder.sessionId && (
                  <button
                    onClick={async () => {
                      try {
                        await apiClient.post(`/restaurants/${activeRestaurantId}/table-sessions/${selectedOrder.sessionId}/close`);
                        toast('Table settled and session closed successfully!', 'success');
                        setSelectedOrder(null);
                        queryClient.invalidateQueries({ queryKey: ['activeOrdersQueue', activeRestaurantId] });
                      } catch (err: any) {
                        toast(err.response?.data?.error?.message || 'Failed to settle table', 'error');
                      }
                    }}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-2xl transition shadow-md active:scale-[0.98]"
                  >
                    Close Table / Settle Bill
                  </button>
                )}
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
