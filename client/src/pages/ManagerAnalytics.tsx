import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../lib/api';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Receipt,
  Download,
  Calendar,
  ArrowUpDown,
  BarChart2,
  HelpCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type RangeType = 'today' | 'last7' | 'last30' | 'custom';

export const ManagerAnalytics: React.FC = () => {
  const { user } = useAuth();
  const activeRestaurantId = user?.restaurants?.[0];

  // Range and filter states
  const [rangeType, setRangeType] = useState<RangeType>('today');
  const [customStart, setCustomStart] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [customEnd, setCustomEnd] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Sorting state for table turnover
  const [sortField, setSortField] = useState<'displayName' | 'orderCount' | 'revenue' | 'aov'>('revenue');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Sorting state for top selling menu items
  const [topItemsSort, setTopItemsSort] = useState<'quantity' | 'revenue'>('quantity');

  // Compute timezone-safe query boundaries
  const getQueryBounds = () => {
    const now = new Date();
    const start = new Date();
    const end = new Date();

    // End of today (local time)
    end.setHours(23, 59, 59, 999);

    if (rangeType === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (rangeType === 'last7') {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (rangeType === 'last30') {
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    } else if (rangeType === 'custom' && customStart && customEnd) {
      const customS = new Date(customStart);
      customS.setHours(0, 0, 0, 0);
      const customE = new Date(customEnd);
      customE.setHours(23, 59, 59, 999);
      return {
        startDate: customS.toISOString(),
        endDate: customE.toISOString(),
      };
    } else {
      start.setHours(0, 0, 0, 0);
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  };

  const { startDate, endDate } = getQueryBounds();

  // Fetch Analytics data
  const { data: response, isLoading, isError } = useQuery({
    queryKey: ['restaurantAnalytics', activeRestaurantId, rangeType, startDate, endDate],
    queryFn: async () => {
      const res = await apiClient.get(
        `/restaurants/${activeRestaurantId}/analytics?startDate=${startDate}&endDate=${endDate}`
      );
      return res.data;
    },
    enabled: !!activeRestaurantId && (rangeType !== 'custom' || (!!customStart && !!customEnd)),
  });

  const analyticsData = response?.data;

  // Format currency helpers
  const formatAmount = (amt: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amt / 100);
  };

  const formatAmountShort = (amt: number) => {
    const floatVal = amt / 100;
    if (floatVal >= 100000) {
      return `₹${(floatVal / 100000).toFixed(1)}L`;
    }
    if (floatVal >= 1000) {
      return `₹${(floatVal / 100).toFixed(1)}k`;
    }
    return `₹${floatVal.toFixed(0)}`;
  };

  // CSV Export trigger
  const handleExportCsv = () => {
    if (!analyticsData?.ordersList?.length) return;
    const headers = ['Order Number', 'Table', 'Timestamp', 'Status', 'Item Count', 'Total (INR)'];
    const rows = analyticsData.ordersList.map((order: any) => [
      order.orderNumber,
      `"${order.tableName.replace(/"/g, '""')}"`,
      new Date(order.createdAt).toLocaleString(),
      order.status,
      order.itemCount,
      (order.total / 100).toFixed(2),
    ]);
    const csvContent = [headers.join(','), ...rows.map((e: any) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `analytics-orders-${rangeType}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Metric trend widget renderer
  const renderTrend = (value: number) => {
    if (value === 0) {
      return (
        <span className="inline-flex items-center text-[10px] font-bold font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full mt-1 border border-slate-100">
          0% vs prior
        </span>
      );
    }
    const isUp = value > 0;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold font-mono px-2 py-0.5 rounded-full mt-1 border transition-all ${
          isUp
            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
            : 'bg-red-50 border-red-100 text-red-700'
        }`}
      >
        {isUp ? (
          <TrendingUp className="w-3 h-3 text-emerald-600" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-600" />
        )}
        <span>
          {isUp ? '+' : ''}
          {value}% vs prior
        </span>
      </span>
    );
  };

  if (!activeRestaurantId) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <h2 className="font-display text-2xl font-bold text-slate-800">No Restaurant Assigned</h2>
        <p className="text-slate-500 text-sm max-w-sm mt-1">
          You are currently not associated as a manager with any restaurant.
        </p>
      </div>
    );
  }

  // Pre-process sorting for tables
  const sortedTables = [...(analyticsData?.tables || [])].sort((a: any, b: any) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const handleTableSort = (field: 'displayName' | 'orderCount' | 'revenue' | 'aov') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Pre-process sorting for top selling items
  const sortedTopItems = [...(analyticsData?.charts?.topSelling || [])]
    .sort((a: any, b: any) => b[topItemsSort] - a[topItemsSort])
    .slice(0, 10);

  // Status breakdown pie colors
  const STATUS_COLORS: Record<string, string> = {
    PENDING: '#F59E0B',   // Amber
    ACCEPTED: '#10B981',  // Emerald
    PREPARING: '#6366F1', // Indigo
    READY: '#8B5CF6',     // Purple
    SERVED: '#3B82F6',    // Blue
    CANCELLED: '#EF4444', // Red
  };

  const chartThemeColors = {
    primary: '#111827',
    accent: '#F59E0B',
    grid: '#F1F5F9',
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 font-sans space-y-8 select-none">
      {/* Page Header and Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
        <div>
          <h1 className="font-display tracking-tight text-4xl font-normal text-slate-900">
            Performance Analytics
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">Real-time revenue metrics, menu breakdowns, and floor analytics</p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0 w-full md:w-auto">
          {/* Range Quick Switches */}
          <div className="flex border border-slate-200 rounded-xl bg-slate-50 p-1">
            {(['today', 'last7', 'last30', 'custom'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setRangeType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap capitalize ${
                  rangeType === type
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {type === 'last7' ? '7 Days' : type === 'last30' ? '30 Days' : type}
              </button>
            ))}
          </div>

          {/* CSV Export Button */}
          <button
            onClick={handleExportCsv}
            disabled={isLoading || !analyticsData?.ordersList?.length}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-xl text-xs font-bold text-slate-700 transition shadow-sm shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Custom range date-picker banner */}
      {rangeType === 'custom' && (
        <div className="p-4 bg-white border border-slate-150 rounded-2xl flex flex-wrap gap-4 items-center shadow-sm animate-fade-in">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>Select Custom Range</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500 font-mono"
            />
            <span className="text-slate-400 text-xs font-bold">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
        </div>
      )}

      {/* Summary Row */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 bg-slate-50 border border-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : isError || !analyticsData ? (
        <div className="min-h-[20vh] bg-white rounded-3xl border border-slate-100 p-8 text-center flex flex-col items-center justify-center space-y-2">
          <HelpCircle className="w-8 h-8 text-red-500 animate-pulse" />
          <h4 className="font-bold text-slate-800">Error Loading Analytics</h4>
          <p className="text-xs text-slate-400">Failed to fetch aggregate performance statistics.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Revenue */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Gross Revenue</span>
              <div className="h-8 w-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold font-mono tracking-tight text-slate-900 leading-none">
                {formatAmount(analyticsData.summary.revenue.current)}
              </h2>
              {renderTrend(analyticsData.summary.revenue.change)}
            </div>
          </div>

          {/* Orders count */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Order Volume</span>
              <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-700">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold font-mono tracking-tight text-slate-900 leading-none">
                {analyticsData.summary.orderCount.current}
              </h2>
              {renderTrend(analyticsData.summary.orderCount.change)}
            </div>
          </div>

          {/* Average Order Value (AOV) */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Avg Order Value (AOV)</span>
              <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-700">
                <BarChart2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold font-mono tracking-tight text-slate-900 leading-none">
                {formatAmount(analyticsData.summary.aov.current)}
              </h2>
              {renderTrend(analyticsData.summary.aov.change)}
            </div>
          </div>

          {/* Average Fulfillment Time */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Avg Fulfillment Time</span>
              <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-700">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold font-mono tracking-tight text-slate-900 leading-none">
                {analyticsData.summary.fulfillmentTime.current.toFixed(1)}m
              </h2>
              {renderTrend(analyticsData.summary.fulfillmentTime.change)}
            </div>
          </div>
        </div>
      )}

      {/* Main Charts Block */}
      {analyticsData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Revenue & Volume Time-series */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-900">Revenue & Ticket Volume Trend</h3>
                <p className="text-[10px] text-slate-400">Showing historical order trends for non-cancelled orders</p>
              </div>
            </div>

            {analyticsData.charts.timeline.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
                No orders in this range yet
              </div>
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analyticsData.charts.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartThemeColors.accent} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={chartThemeColors.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartThemeColors.grid} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      style={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', fill: '#94A3B8' }}
                    />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={formatAmountShort}
                      style={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', fill: '#94A3B8' }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      style={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', fill: '#94A3B8' }}
                    />
                    <Tooltip
                      contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', fontSize: '11px', fontFamily: 'Plus Jakarta Sans' }}
                      formatter={(value: any, name: any) => {
                        if (name === 'revenue') return [formatAmount(value), 'Revenue'];
                        return [value, 'Tickets Placed'];
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      stroke={chartThemeColors.accent}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                      strokeWidth={2}
                      name="revenue"
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="orderCount"
                      fill="#1E293B"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={30}
                      name="orderCount"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Current Order Health breakdown */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Order Status Breakdown</h3>
              <p className="text-[10px] text-slate-400">Total volume count split by system workflow state</p>
            </div>

            {analyticsData.charts.statusBreakdown.every((item: any) => item.count === 0) ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
                No active status records
              </div>
            ) : (
              <div className="w-full h-64 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData.charts.statusBreakdown.filter((item: any) => item.count > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="count"
                    >
                      {analyticsData.charts.statusBreakdown
                        .filter((item: any) => item.count > 0)
                        .map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || '#CBD5E1'} />
                        ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', fontSize: '11px' }}
                      formatter={(value: any, _name: any, props: any) => [value, props.payload.status]}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Legend details */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold font-mono text-slate-800 leading-none">
                    {analyticsData.charts.statusBreakdown.reduce((sum: number, x: any) => sum + x.count, 0)}
                  </span>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold mt-1">Total orders</span>
                </div>
              </div>
            )}

            {/* Micro List Indicators */}
            <div className="grid grid-cols-3 gap-2 border-t border-slate-50 pt-4">
              {analyticsData.charts.statusBreakdown.map((item: any) => (
                <div key={item.status} className="flex flex-col items-start p-1.5 rounded-xl hover:bg-slate-50 transition">
                  <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS[item.status] }} />
                    {item.status}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-850 pl-2.5 mt-0.5">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Second Section: Top-selling menu items and Table Turnover */}
      {analyticsData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Top Selling Menu Items Chart */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-slate-900">Top-Selling Menu Items</h3>
                <p className="text-[10px] text-slate-400">Identify top performance items</p>
              </div>

              {/* Toggle Quantity vs Revenue */}
              <div className="flex border border-slate-200 rounded-lg bg-slate-50 p-0.5">
                <button
                  onClick={() => setTopItemsSort('quantity')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                    topItemsSort === 'quantity'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  By Quantity
                </button>
                <button
                  onClick={() => setTopItemsSort('revenue')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                    topItemsSort === 'revenue'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  By Revenue
                </button>
              </div>
            </div>

            {sortedTopItems.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
                No items sold yet
              </div>
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sortedTopItems} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartThemeColors.grid} />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      style={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace' }}
                      tickFormatter={(val) => (topItemsSort === 'revenue' ? `₹${val / 100}` : val)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      style={{ fontSize: '10px', fontWeight: 'bold', fill: '#475569' }}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', fontSize: '11px' }}
                      formatter={(value: any) => [topItemsSort === 'revenue' ? formatAmount(value) : `${value} sold`, topItemsSort === 'revenue' ? 'Revenue' : 'Quantity']}
                    />
                    <Bar
                      dataKey={topItemsSort}
                      fill={chartThemeColors.accent}
                      radius={[0, 4, 4, 0]}
                      maxBarSize={15}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Table Turnover list */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Table Turnover Performance</h3>
              <p className="text-[10px] text-slate-400">Overview of floor utilization metrics and total generated revenue per table</p>
            </div>

            <div className="flex-1 overflow-x-auto min-h-[300px]">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[9px] font-bold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">
                      <button
                        onClick={() => handleTableSort('displayName')}
                        className="flex items-center gap-1 hover:text-slate-900 transition font-bold"
                      >
                        <span>Table Name</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4">
                      <button
                        onClick={() => handleTableSort('orderCount')}
                        className="flex items-center gap-1 hover:text-slate-900 transition font-bold"
                      >
                        <span>Tickets Placed</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4">
                      <button
                        onClick={() => handleTableSort('revenue')}
                        className="flex items-center gap-1 hover:text-slate-900 transition font-bold"
                      >
                        <span>Total Revenue</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4">
                      <button
                        onClick={() => handleTableSort('aov')}
                        className="flex items-center gap-1 hover:text-slate-900 transition font-bold"
                      >
                        <span>Average Ticket (AOV)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedTables.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-slate-400 text-xs">
                        No table turnover records for this range
                      </td>
                    </tr>
                  ) : (
                    sortedTables.map((row: any) => (
                      <tr key={row.tableId} className="hover:bg-slate-50/50 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {row.displayName}
                          <span className="text-[10px] text-slate-400 font-mono block font-normal">Num: {row.tableNumber}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">{row.orderCount}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{formatAmount(row.revenue)}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">{formatAmount(row.aov)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerAnalytics;
