import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { publicService } from '../services/restaurant.service';
import { Loader, AlertTriangle, HelpCircle } from 'lucide-react';

export const PublicTable: React.FC = () => {
  const { restaurantSlug, tableToken } = useParams<{ restaurantSlug: string; tableToken: string }>();

  const { data, error, isLoading } = useQuery({
    queryKey: ['publicTable', restaurantSlug, tableToken],
    queryFn: () => publicService.resolveTable(restaurantSlug!, tableToken!),
    enabled: !!restaurantSlug && !!tableToken,
    retry: false, // Don't retry if not found
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  // Handle errors or missing table resolution
  const isError = !!error || !data?.success;

  if (isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 font-sans">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center space-y-6">
          <div className="h-16 w-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mx-auto">
            <AlertTriangle className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-3xl font-normal text-slate-900">Unavailable</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              This restaurant or table isn't available right now. Please verify your QR code scan or request assistance from staff.
            </p>
          </div>
          <div className="border-t border-slate-50 pt-4 text-xs text-slate-400">
            Error Code: <span className="font-mono">TABLE_NOT_FOUND</span>
          </div>
        </div>
      </div>
    );
  }

  const { restaurant, table } = data.data;
  const { theme } = restaurant;

  // Custom CSS variable branding
  const cssVariables = {
    '--theme-primary': theme.primaryColor || '#111827',
    '--theme-secondary': theme.secondaryColor || '#FFFFFF',
    '--theme-accent': theme.accentColor || '#F59E0B',
  } as React.CSSProperties;

  return (
    <div style={cssVariables} className="min-h-screen bg-slate-50 font-sans antialiased">
      {/* Brand Header */}
      <header className="relative w-full overflow-hidden bg-[var(--theme-primary)] text-[var(--theme-secondary)] py-12 px-6 shadow-sm">
        {restaurant.coverImageUrl && (
          <div
            className="absolute inset-0 opacity-20 bg-cover bg-center"
            style={{ backgroundImage: `url(${restaurant.coverImageUrl})` }}
          />
        )}
        <div className="relative max-w-xl mx-auto flex flex-col items-center text-center space-y-4">
          {restaurant.logoUrl ? (
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              className="w-20 h-24 object-contain rounded-2xl shadow border border-[var(--theme-secondary)]/10"
            />
          ) : (
            <div className="w-16 h-16 bg-[var(--theme-accent)] text-[var(--theme-primary)] font-display text-3xl rounded-2xl flex items-center justify-center font-bold">
              {restaurant.name.charAt(0)}
            </div>
          )}
          <div className="space-y-1">
            <h1 className="font-display tracking-tight text-4xl font-normal">
              {restaurant.name}
            </h1>
            {restaurant.description && (
              <p className="text-xs opacity-80 max-w-xs">{restaurant.description}</p>
            )}
          </div>
        </div>
      </header>

      {/* Page Content / Dynamic Table Banner */}
      <main className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 bg-amber-50 rounded-xl flex items-center justify-center text-[var(--theme-accent)]">
            <HelpCircle className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{table.displayName}</h2>
            <p className="text-xs text-slate-500 font-mono">Table Code: {table.tableNumber}</p>
          </div>
        </div>

        {/* Operational Placeholder for future ordering menu phases */}
        <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm text-center py-16 space-y-4">
          <Loader className="w-10 h-10 text-[var(--theme-accent)] mx-auto animate-pulse" strokeWidth={1.75} />
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">Operations Menu Coming Soon</h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              Our digital dining menu and secure self-service order placements (Phases 3-4) are currently being set up. Please speak to our staff members for order service.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
export default PublicTable;
