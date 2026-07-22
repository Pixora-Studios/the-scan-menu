import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  CheckCircle2,
  BellRing,
  Loader,
} from 'lucide-react';
import apiClient from '../lib/api';

interface WaiterCall {
  _id: string;
  restaurantId: string;
  tableId: { displayName: string; tableNumber: string } | any;
  tableNumberSnapshot: string;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';
  createdAt: string;
}

export const ManagerWaiterCalls: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const activeRestaurantId = user?.restaurants?.[0];

  // Fetch Waiter Calls
  const { data: waiterCallsData, isLoading: isLoadingWaiterCalls } = useQuery({
    queryKey: ['waiterCallsQueue', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/waiter-calls?limit=50`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  const activeWaiterCalls = React.useMemo(() => {
    if (!waiterCallsData?.success) return [];
    return waiterCallsData.data.waiterCalls.filter(
      (c: WaiterCall) => c.status === 'PENDING' || c.status === 'ACKNOWLEDGED'
    );
  }, [waiterCallsData]);

  const ackWaiterCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const res = await apiClient.patch(
        `/restaurants/${activeRestaurantId}/waiter-calls/${callId}/acknowledge`
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast(`Acknowledged Table ${data.data.tableNumberSnapshot} waiter call`, 'success');
      queryClient.invalidateQueries({ queryKey: ['waiterCallsQueue', activeRestaurantId] });
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
      queryClient.invalidateQueries({ queryKey: ['waiterCallsQueue', activeRestaurantId] });
    },
    onError: (err: any) => {
      toast(err.response?.data?.error?.message || 'Error resolving waiter call', 'error');
    },
  });

  if (!activeRestaurantId) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <Loader className="w-12 h-12 text-amber-500 mb-4 animate-pulse" />
        <h2 className="font-display text-2xl font-bold text-slate-800">No Restaurant Assigned</h2>
        <p className="text-slate-500 text-sm max-w-sm mt-1">
          You are currently not associated as a manager with any restaurant. Please contact a Super Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-24 flex flex-col font-sans">
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
            {activeWaiterCalls.map((call: WaiterCall) => {
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
                        <h4 className="text-sm font-extrabold text-slate-900">
                          Table {call.tableNumberSnapshot}
                        </h4>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
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
    </div>
  );
};

export default ManagerWaiterCalls;
