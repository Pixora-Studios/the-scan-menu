/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  Utensils,
  XCircle,
  ArrowLeft,
  Loader,
  AlertTriangle,
  Receipt,
} from 'lucide-react';
import { publicService } from '../services/restaurant.service';
import apiClient from '../lib/api';

// ==========================================
// ISOLATED STATUS POLLING HOOK
// ==========================================
export const useOrderStatusPolling = (orderId: string) => {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!orderId) return;

    const fetchStatus = async () => {
      try {
        const res = await apiClient.get(`/public/orders/${orderId}/status`);
        if (res.data.success) {
          setStatus(res.data.data.status);
        }
      } catch (err) {
        console.error('Error polling order status:', err);
        setError(true);
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 5 seconds (to be replaced with Socket.io in Phase 6)
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [orderId]);

  return { status, error };
};

// ==========================================
// MAIN COMPONENT
// ==========================================
export const PublicOrderConfirmation: React.FC = () => {
  const { restaurantSlug, tableToken, orderId } = useParams<{
    restaurantSlug: string;
    tableToken: string;
    orderId: string;
  }>();
  const navigate = useNavigate();

  // 1. Fetch table and restaurant (for logo, theme variables, currency)
  const { data: tableData, isLoading: isTableLoading } = useQuery({
    queryKey: ['publicTable', restaurantSlug, tableToken],
    queryFn: () => publicService.resolveTable(restaurantSlug!, tableToken!),
    enabled: !!restaurantSlug && !!tableToken,
    retry: false,
  });

  // 2. Poll order status cheaply
  const { status, error: isPollError } = useOrderStatusPolling(orderId!);

  // 3. Fetch order details (items snapshot, subtotals)
  const { data: orderData, isLoading: isOrderLoading } = useQuery({
    queryKey: ['publicOrderDetails', orderId],
    queryFn: async () => {
      const res = await apiClient.get(`/public/orders/${orderId}`);
      return res.data;
    },
    enabled: !!orderId,
    retry: false,
  });

  const [animationCompleted, setAnimationCompleted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationCompleted(true);
    }, 1200); // Wait for checkmark drawing animation (~600ms) + buffer to complete
    return () => clearTimeout(timer);
  }, []);

  if (isTableLoading || isOrderLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const isError = !tableData?.success || !orderData?.success || isPollError;
  if (isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 font-sans">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center space-y-6">
          <div className="h-16 w-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mx-auto">
            <AlertTriangle className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-3xl font-normal text-slate-900">Order Error</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              We couldn't retrieve your order details or the status. Please request assistance from our dining staff.
            </p>
          </div>
          <button
            onClick={() => navigate(`/r/${restaurantSlug}/t/${tableToken}`)}
            className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  const { restaurant, table } = tableData.data;
  const order = orderData.data;
  const currentStatus = status || order.status;

  const cssVariables = {
    '--theme-primary': restaurant.theme.primaryColor || '#111827',
    '--theme-secondary': restaurant.theme.secondaryColor || '#FFFFFF',
    '--theme-accent': restaurant.theme.accentColor || '#F59E0B',
  } as React.CSSProperties;

  const formatAmount = (amt: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: restaurant.currency || 'INR',
    }).format(amt / 100);
  };

  // Status-specific mapping
  const statusDetails: Record<string, { title: string; desc: string; icon: React.ReactNode; color: string }> = {
    PENDING: {
      title: 'Order Placed',
      desc: 'Waiting for the kitchen to accept your order.',
      icon: <Clock className="w-6 h-6 text-amber-500" strokeWidth={1.75} />,
      color: 'bg-amber-50 border-amber-100 text-amber-800',
    },
    ACCEPTED: {
      title: 'Order Accepted',
      desc: 'Our staff has accepted your order and is queuing it.',
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" strokeWidth={1.75} />,
      color: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    },
    PREPARING: {
      title: 'Preparing',
      desc: 'Our chefs are handcrafting your food right now!',
      icon: <ChefHat className="w-6 h-6 text-indigo-500" strokeWidth={1.75} />,
      color: 'bg-indigo-50 border-indigo-100 text-indigo-800',
    },
    READY: {
      title: 'Ready for Pickup',
      desc: 'Your order is hot, ready, and heading to your table!',
      icon: <Utensils className="w-6 h-6 text-purple-500" strokeWidth={1.75} />,
      color: 'bg-purple-50 border-purple-100 text-purple-800',
    },
    SERVED: {
      title: 'Served',
      desc: 'Enjoy your meal! Let us know if you need anything else.',
      icon: <CheckCircle2 className="w-6 h-6 text-blue-500" strokeWidth={1.75} />,
      color: 'bg-blue-50 border-blue-100 text-blue-800',
    },
    CANCELLED: {
      title: 'Cancelled',
      desc: 'This order was cancelled. Please speak to staff for details.',
      icon: <XCircle className="w-6 h-6 text-red-500" strokeWidth={1.75} />,
      color: 'bg-red-50 border-red-100 text-red-800',
    },
  };

  const currentStatusInfo = statusDetails[currentStatus] || {
    title: 'Processing',
    desc: 'Checking order status...',
    icon: <Clock className="w-6 h-6 text-slate-500" strokeWidth={1.75} />,
    color: 'bg-slate-50 border-slate-100 text-slate-800',
  };

  return (
    <div style={cssVariables} className="min-h-screen bg-slate-50 font-sans antialiased pb-12">
      {/* Back button */}
      <div className="max-w-md mx-auto p-4 flex items-center justify-between">
        <button
          onClick={() => navigate(`/r/${restaurantSlug}/t/${tableToken}`)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-white shadow-sm border border-slate-150 py-1.5 px-3 rounded-full transition-colors"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Back to Menu
        </button>
        <span className="text-xs font-mono font-bold text-slate-400">Order #{order.orderNumber}</span>
      </div>

      <main className="max-w-md mx-auto px-4 space-y-6">
        {/* Animated Checkmark and Confirmation Card */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm text-center flex flex-col items-center py-10 space-y-6">
          <div className="relative">
            {/* Draw Path SVG Checkmark Animation */}
            <svg
              className="w-20 h-20 text-emerald-500"
              viewBox="0 0 52 52"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
            >
              <circle cx="26" cy="26" r="23" className="stroke-emerald-100" />
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                d="M14 27l8 8 16-16"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="space-y-1">
            <h1 className="font-display tracking-tight text-3xl font-normal text-slate-900">
              Order Confirmed!
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              We received your order at {table.displayName}
            </p>
          </div>
        </div>

        {/* Polled Status Display (fades in) */}
        <AnimatePresence>
          {animationCompleted && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={`p-4 rounded-2xl border flex items-start gap-4 shadow-sm ${currentStatusInfo.color}`}
            >
              <div className="bg-white p-2 rounded-xl shadow-sm shrink-0">
                {currentStatusInfo.icon}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold leading-tight">{currentStatusInfo.title}</h3>
                <p className="text-xs opacity-90 leading-relaxed">{currentStatusInfo.desc}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Order Details list */}
        <AnimatePresence>
          {animationCompleted && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Receipt className="w-5 h-5 text-slate-400" strokeWidth={1.75} />
                <h4 className="text-sm font-bold text-slate-900">Receipt Summary</h4>
              </div>

              {/* Items */}
              <div className="divide-y divide-slate-50 space-y-3">
                {order.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-2 first:pt-0">
                    <div>
                      <h5 className="text-xs font-bold text-slate-900">
                        {item.nameSnapshot} <span className="font-mono text-slate-400">x{item.quantity}</span>
                      </h5>
                      {item.selectedAddOns.length > 0 && (
                        <p className="text-[10px] text-slate-400">
                          + {item.selectedAddOns.map((x: any) => x.name).join(', ')}
                        </p>
                      )}
                      {item.specialInstructions && (
                        <p className="text-[10px] text-amber-600 bg-amber-50/50 rounded px-1.5 py-0.5 inline-block mt-1 italic font-medium">
                          Note: "{item.specialInstructions}"
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-bold font-mono text-slate-900">
                      {formatAmount(item.unitPriceSnapshot * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Math totals */}
              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500 font-medium">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatAmount(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500 font-medium">
                  <span>VAT / Taxes ({restaurant.taxRatePercent}%)</span>
                  <span className="font-mono">{formatAmount(order.tax)}</span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold text-sm border-t border-slate-50 pt-2">
                  <span>Grand Total</span>
                  <span className="font-mono">{formatAmount(order.total)}</span>
                </div>
              </div>

              {order.customerNote && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs">
                  <span className="font-bold text-slate-600 block mb-1">Customer Note:</span>
                  <p className="text-slate-500 leading-relaxed italic">"{order.customerNote}"</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default PublicOrderConfirmation;
