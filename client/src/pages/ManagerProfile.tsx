import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import {
  LogOut,
  Shield,
  Mail,
  MapPin,
  Phone,
  Loader,
} from 'lucide-react';
import apiClient from '../lib/api';

export const ManagerProfile: React.FC = () => {
  const { user, logout } = useAuth();
  const activeRestaurantId = user?.restaurants?.[0];

  // Fetch Restaurant Info for Profile
  const { data: restaurantData, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['restaurantProfileInfo', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
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
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-24 flex justify-center items-start font-sans">
      {isLoadingProfile ? (
        <div className="flex justify-center items-center py-12">
          <Loader className="w-8 h-8 animate-spin text-amber-500" strokeWidth={1.75} />
        </div>
      ) : (
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-150 shadow-sm overflow-hidden flex flex-col">
          {/* Top header decoration */}
          <div className="bg-slate-950 p-6 text-white text-center flex flex-col items-center">
            <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center text-amber-500 font-extrabold mb-3 text-2xl border border-white/10 shadow-inner">
              {user?.name?.charAt(0).toUpperCase()}
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
      )}
    </div>
  );
};

export default ManagerProfile;
