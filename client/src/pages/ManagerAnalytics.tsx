import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  ShoppingBag,
  Download,
  Calendar,
  Loader,
  AlertCircle,
  Award,
  Users,
} from 'lucide-react';
import apiClient from '../lib/api';

// Helper to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount / 100);
};

// Helper to format average fulfillment time
const formatMinutes = (mins: number) => {
  if (mins === 0) return '0 min';
  return `${mins.toFixed(1)}m`;
};

// Date interval calculation helpers
const getRangeDates = (rangeType: string, customStart?: string, customEnd?: string) => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (rangeType === '7d') {
    start.setDate(start.getDate() - 6);
  } else if (rangeType === '30d') {
    start.setDate(start.getDate() - 29);
  } else if (rangeType === 'custom' && customStart && customEnd) {
    const s = new Date(customStart);
    s.setHours(0, 0, 0, 0);
    const e = new Date(customEnd);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }

  return { start, end };
};

export const ManagerAnalytics: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const activeRestaurantId = user?.restaurants?.[0];

  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Top Sellers Chart Toggles
  const [topSellersToggle, setTopSellersToggle] = useState<'quantity' | 'revenue'>('quantity');

  // Table Turnover Sort State
  const [tableSortColumn, setTableSortColumn] = useState<'tableNumber' | 'orderCount' | 'revenue' | 'averageOrderValue'>('revenue');
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('desc');

  // Compute start/end dates
  const { start, end } = useMemo(() => {
    return getRangeDates(dateRange, customStart, customEnd);
  }, [dateRange, customStart, customEnd]);

  // Fetch Analytics data
  const { data: analyticsResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['analyticsData', activeRestaurantId, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const res = await apiClient.get(
        `/restaurants/${activeRestaurantId}/analytics?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
      );
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  const analytics = analyticsResponse?.data;

  // CSV Exporter
  const handleExportCsv = () => {
    if (!analytics?.rawOrdersForCsv || analytics.rawOrdersForCsv.length === 0) {
      toast('No order details available in this date range to export.', 'error');
      return;
    }

    const headers = ['Order Number', 'Table Display Name', 'Timestamp', 'Status', 'Items Count', 'Total Amount (Paise)', 'Total Amount (INR)'];
    const rows = analytics.rawOrdersForCsv.map((o: any) => [
      o.orderNumber,
      `"${o.tableName}"`,
      new Date(o.createdAt).toLocaleString(),
      o.status,
      o.itemCount,
      o.total,
      (o.total / 100).toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `pixora-analytics-${start.toISOString().split('T')[0]}-to-${end.toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Analytics order spreadsheet exported successfully!', 'success');
  };

  // Compare trends helper
  const renderTrend = (current: number, prior: number, isTime = false) => {
    if (prior === 0) {
      return (
        <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-0.5">
          New Period
        </span>
      );
    }

    const diff = current - prior;
    const percent = Math.round((diff / prior) * 100);

    // If time metric, downward is good (faster), upward is bad. Otherwise upward is good.
    const isGood = isTime ? diff < 0 : diff > 0;

    if (diff === 0) {
      return (
        <span className="text-[10px] text-slate-400 font-semibold">
          Flat (0% vs prior)
        </span>
      );
    }

    return (
      <span className={`text-[10px] font-bold flex items-center gap-0.5 ${isGood ? 'text-emerald-600' : 'text-rose-500'}`}>
        {isGood ? <TrendingUp className="w-3 h-3" strokeWidth={2} /> : <TrendingDown className="w-3 h-3" strokeWidth={2} />}
        <span>
          {Math.abs(percent)}% vs prior
        </span>
      </span>
    );
  };

  // Sort Table Turnover list
  const sortedTables = useMemo(() => {
    if (!analytics?.tablesTurnover) return [];
    const list = [...analytics.tablesTurnover];

    list.sort((a: any, b: any) => {
      const valA = a[tableSortColumn];
      const valB = b[tableSortColumn];

      // Handle tableNumber strings properly (e.g. natural numeric sort)
      if (tableSortColumn === 'tableNumber') {
        const numA = parseInt(valA) || 0;
        const numB = parseInt(valB) || 0;
        return tableSortDirection === 'asc' ? numA - numB : numB - numA;
      }

      return tableSortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }, [analytics?.tablesTurnover, tableSortColumn, tableSortDirection]);

  const handleTableSort = (col: typeof tableSortColumn) => {
    if (tableSortColumn === col) {
      setTableSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setTableSortColumn(col);
      setTableSortDirection('desc');
    }
  };

  // Pure SVG Line/Area Chart Renderer (Revenue over time)
  const renderRevenueLineChart = () => {
    const data = analytics?.charts?.timeSeries || [];
    if (data.length === 0) {
      return (
        <div className="h-44 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-xs text-slate-400">
          No revenue timeline records inside this range.
        </div>
      );
    }

    const width = 600;
    const height = 180;
    const paddingX = 40;
    const paddingY = 25;

    const maxVal = Math.max(...data.map((d: any) => d.revenue), 1000); // at least 10 INR

    const points = data.map((d: any, i: number) => {
      const x = paddingX + (i / (data.length - 1 || 1)) * (width - paddingX * 2);
      const y = height - paddingY - (d.revenue / maxVal) * (height - paddingY * 2);
      return { x, y, label: d.label, val: d.revenue };
    });

    const pathD = points.reduce((acc: string, p: any, i: number) => {
      return acc + `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }, '');

    // Area fill path
    const areaD = pathD
      ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(height - paddingY).toFixed(1)} L ${points[0].x.toFixed(1)} ${(height - paddingY).toFixed(1)} Z`
      : '';

    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={paddingX} y1={(height / 2).toFixed(1)} x2={width - paddingX} y2={(height / 2).toFixed(1)} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#e2e8f0" strokeWidth="1.5" />

          {/* Area Fill */}
          {areaD && <path d={areaD} fill="url(#areaGrad)" />}

          {/* Glowing Line */}
          {pathD && <path d={pathD} fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

          {/* Data Points */}
          {points.map((p: any, i: number) => (
            <g key={i} className="group cursor-pointer">
              <circle cx={p.x} cy={p.y} r="3" fill="#ffffff" stroke="#F59E0B" strokeWidth="2.2" className="transition-all group-hover:r-5 group-hover:fill-amber-500" />
              <title>{`${p.label}: ${formatCurrency(p.val)}`}</title>
            </g>
          ))}

          {/* Labels */}
          {points.length > 0 && (
            <>
              {/* Start Label */}
              <text x={points[0].x} y={height - 8} textAnchor="start" className="text-[9px] fill-slate-400 font-mono font-bold">
                {points[0].label}
              </text>
              {/* Mid Label (if more than 2 elements) */}
              {points.length > 2 && (
                <text x={points[Math.floor(points.length / 2)].x} y={height - 8} textAnchor="middle" className="text-[9px] fill-slate-400 font-mono font-bold">
                  {points[Math.floor(points.length / 2)].label}
                </text>
              )}
              {/* End Label */}
              <text x={points[points.length - 1].x} y={height - 8} textAnchor="end" className="text-[9px] fill-slate-400 font-mono font-bold">
                {points[points.length - 1].label}
              </text>
            </>
          )}
        </svg>
      </div>
    );
  };

  // Pure SVG Bar Chart (Order volume over time)
  const renderOrdersBarChart = () => {
    const data = analytics?.charts?.timeSeries || [];
    if (data.length === 0) {
      return (
        <div className="h-44 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-xs text-slate-400">
          No order timeline records inside this range.
        </div>
      );
    }

    const width = 600;
    const height = 180;
    const paddingX = 40;
    const paddingY = 25;

    const maxVal = Math.max(...data.map((d: any) => d.orders), 5); // at least 5 orders

    const chartWidth = width - paddingX * 2;
    const barWidth = Math.max(4, Math.min(24, (chartWidth / data.length) * 0.45));
    const step = chartWidth / (data.length - 1 || 1);

    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#e2e8f0" strokeWidth="1.5" />

          {/* Bar Rects */}
          {data.map((d: any, i: number) => {
            const x = paddingX + i * step - barWidth / 2;
            const barHeight = (d.orders / maxVal) * (height - paddingY * 2);
            const y = height - paddingY - barHeight;

            return (
              <g key={i} className="group cursor-pointer">
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(2, barHeight)}
                  fill="#0B0B0F"
                  rx="3"
                  ry="3"
                  className="transition-colors hover:fill-amber-500"
                />
                <title>{`${d.label}: ${d.orders} orders`}</title>
              </g>
            );
          })}

          {/* Labels */}
          {data.length > 0 && (
            <>
              {/* Start */}
              <text x={paddingX} y={height - 8} textAnchor="start" className="text-[9px] fill-slate-400 font-mono font-bold">
                {data[0].label}
              </text>
              {/* Mid */}
              {data.length > 2 && (
                <text x={width / 2} y={height - 8} textAnchor="middle" className="text-[9px] fill-slate-400 font-mono font-bold">
                  {data[Math.floor(data.length / 2)].label}
                </text>
              )}
              {/* End */}
              <text x={width - paddingX} y={height - 8} textAnchor="end" className="text-[9px] fill-slate-400 font-mono font-bold">
                {data[data.length - 1].label}
              </text>
            </>
          )}
        </svg>
      </div>
    );
  };

  if (!activeRestaurantId) {
    return (
      <div className="min-h-[60vh] bg-white rounded-3xl border border-slate-150 p-8 text-center flex flex-col items-center justify-center space-y-4 shadow-sm font-sans">
        <AlertCircle className="w-12 h-12 text-rose-500" strokeWidth={1.75} />
        <div>
          <h3 className="font-display text-2xl font-normal text-slate-800">No Restaurant Connected</h3>
          <p className="text-slate-500 text-xs mt-1">Please assign this manager role to a valid restaurant tenant.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 space-y-6 font-sans">

      {/* 1. Header Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-150 pb-5 shrink-0">
        <div>
          <h3 className="font-display text-3xl font-semibold text-slate-900 leading-none">
            Business Analytics & Insights
          </h3>
          <p className="text-xs text-slate-500 mt-1.5">
            Summarize sales volume, menu preferences, table turnovers, and service metrics.
          </p>
        </div>

        {/* Date Filters Row */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Selection pills */}
          <div className="flex border border-slate-200 rounded-xl bg-white p-1 shadow-sm shrink-0">
            {([
              { key: 'today', label: 'Today' },
              { key: '7d', label: '7 Days' },
              { key: '30d', label: '30 Days' },
              { key: 'custom', label: 'Custom' },
            ] as const).map((r) => (
              <button
                key={r.key}
                onClick={() => setDateRange(r.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  dateRange === r.key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* CSV Export Button */}
          <button
            onClick={handleExportCsv}
            disabled={isLoading || isError}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm border border-slate-900 disabled:bg-slate-300"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={2} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Custom Date Range Pickers (Rendered if 'custom' is active) */}
      {dateRange === 'custom' && (
        <div className="bg-white border border-slate-150 p-4 rounded-2xl flex flex-wrap gap-4 items-center shadow-sm max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono">From</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono">To</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            onClick={() => refetch()}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shrink-0"
          >
            Apply Range
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader className="w-8 h-8 animate-spin text-amber-500" strokeWidth={1.75} />
        </div>
      ) : isError ? (
        <div className="p-6 text-center bg-red-50 border border-red-100 rounded-2xl max-w-lg mx-auto text-red-600 text-xs font-semibold flex items-center gap-2 justify-center">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span>Error loading aggregated analytics. Please review database connection and try again.</span>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ==================== 3. SUMMARY METRICS ROW ==================== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Revenue card */}
            <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Revenue</span>
                <div className="h-8 w-8 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
                  <DollarSign className="w-4 h-4" strokeWidth={1.75} />
                </div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black font-mono tracking-tight text-slate-900">
                  {formatCurrency(analytics.summary.current.revenue)}
                </h3>
                <div className="mt-1">
                  {renderTrend(analytics.summary.current.revenue, analytics.summary.prior.revenue)}
                </div>
              </div>
            </div>

            {/* Order counts */}
            <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Orders</span>
                <div className="h-8 w-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600">
                  <ShoppingBag className="w-4 h-4" strokeWidth={1.75} />
                </div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black font-mono tracking-tight text-slate-900">
                  {analytics.summary.current.orderCount}
                </h3>
                <div className="mt-1">
                  {renderTrend(analytics.summary.current.orderCount, analytics.summary.prior.orderCount)}
                </div>
              </div>
            </div>

            {/* AOV */}
            <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Average Bill</span>
                <div className="h-8 w-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600">
                  <Calendar className="w-4 h-4" strokeWidth={1.75} />
                </div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black font-mono tracking-tight text-slate-900">
                  {formatCurrency(analytics.summary.current.averageOrderValue)}
                </h3>
                <div className="mt-1">
                  {renderTrend(analytics.summary.current.averageOrderValue, analytics.summary.prior.averageOrderValue)}
                </div>
              </div>
            </div>

            {/* Avg Fulfillment */}
            <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Avg Prep Time</span>
                <div className="h-8 w-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600">
                  <Clock className="w-4 h-4" strokeWidth={1.75} />
                </div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black font-mono tracking-tight text-slate-900">
                  {formatMinutes(analytics.summary.current.avgFulfillmentTimeMinutes)}
                </h3>
                <div className="mt-1">
                  {renderTrend(analytics.summary.current.avgFulfillmentTimeMinutes, analytics.summary.prior.avgFulfillmentTimeMinutes, true)}
                </div>
              </div>
            </div>

          </div>

          {/* ==================== 4. TIMELINE CHARTS ==================== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Revenue over time line/area chart */}
            <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm space-y-4">
              <div>
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Revenue Timeline</h4>
                <p className="text-[10px] text-slate-400">Total transaction amount bucketed chronologically in Paíse/Rupees.</p>
              </div>
              {renderRevenueLineChart()}
            </div>

            {/* Order count over time bar chart */}
            <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm space-y-4">
              <div>
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Order Volume</h4>
                <p className="text-[10px] text-slate-400">Total checkouts completed in this range.</p>
              </div>
              {renderOrdersBarChart()}
            </div>

          </div>

          {/* ==================== 5. TOP SELLERS & STATUS BREAKDOWN ==================== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Top sellers (2/3 width) */}
            <div className="lg:col-span-2 bg-white border border-slate-150 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3 flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
                    <span>Top-Selling Menu Items</span>
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Top preference preferences based on guest checkouts.</p>
                </div>

                {/* Sort Toggle */}
                <div className="flex border border-slate-200 rounded-xl bg-slate-50 p-0.5 text-[10px]">
                  <button
                    onClick={() => setTopSellersToggle('quantity')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      topSellersToggle === 'quantity' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    By Qty Sold
                  </button>
                  <button
                    onClick={() => setTopSellersToggle('revenue')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      topSellersToggle === 'revenue' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    By Sales Revenue
                  </button>
                </div>
              </div>

              {analytics.charts.topSellingItems.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-xs text-slate-400 text-center">
                  No orders completed inside this date range to aggregate menu item preferences.
                </div>
              ) : (
                <div className="space-y-3.5 max-h-72 overflow-y-auto pr-1">
                  {analytics.charts.topSellingItems.map((item: any, idx: number) => {
                    const maxQty = Math.max(...analytics.charts.topSellingItems.map((i: any) => i.quantity), 1);
                    const maxRev = Math.max(...analytics.charts.topSellingItems.map((i: any) => i.revenue), 1);

                    const percentage = topSellersToggle === 'quantity'
                      ? (item.quantity / maxQty) * 100
                      : (item.revenue / maxRev) * 100;

                    return (
                      <div key={idx} className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center text-slate-700 font-semibold">
                          <span className="truncate pr-4 font-sans font-bold">{idx + 1}. {item.name}</span>
                          <span className="font-mono font-bold shrink-0">
                            {topSellersToggle === 'quantity'
                              ? `${item.quantity} sold`
                              : formatCurrency(item.revenue)}
                          </span>
                        </div>
                        {/* Horizontal scaled progress bar */}
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${percentage}%` }}
                            className="bg-amber-500 h-full rounded-full transition-all duration-350"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Status counts distribution (1/3 width) */}
            <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Status Distribution</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Quick operational check of current active orders queue.</p>
              </div>

              <div className="space-y-2.5 flex-1 flex flex-col justify-center py-4">
                {Object.entries(analytics.charts.orderStatusDistribution).map(([status, count]) => {
                  const statusColors: Record<string, string> = {
                    PENDING: 'bg-amber-500',
                    ACCEPTED: 'bg-emerald-500',
                    PREPARING: 'bg-indigo-500',
                    READY: 'bg-purple-500',
                    SERVED: 'bg-blue-500',
                    CANCELLED: 'bg-red-500',
                  };
                  return (
                    <div key={status} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${statusColors[status] || 'bg-slate-300'}`} />
                        <span className="font-semibold text-slate-600 font-mono text-[11px]">{status}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">{count as number}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* ==================== 6. TABLE TURNOVER INSIGHT ==================== */}
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm space-y-4">
            <div>
              <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
                <span>Table Turnover Insights</span>
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Identify your highest generating dining table spots over this range.</p>
            </div>

            {sortedTables.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400">
                No active dining tables recorded inside this range.
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-150 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th
                        onClick={() => handleTableSort('tableNumber')}
                        className="pb-3.5 cursor-pointer hover:text-slate-800 transition"
                      >
                        Table {tableSortColumn === 'tableNumber' ? (tableSortDirection === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th
                        onClick={() => handleTableSort('orderCount')}
                        className="pb-3.5 cursor-pointer hover:text-slate-800 transition text-right"
                      >
                        Order Count {tableSortColumn === 'orderCount' ? (tableSortDirection === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th
                        onClick={() => handleTableSort('revenue')}
                        className="pb-3.5 cursor-pointer hover:text-slate-800 transition text-right"
                      >
                        Total Revenue {tableSortColumn === 'revenue' ? (tableSortDirection === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th
                        onClick={() => handleTableSort('averageOrderValue')}
                        className="pb-3.5 cursor-pointer hover:text-slate-800 transition text-right"
                      >
                        Average Order Value {tableSortColumn === 'averageOrderValue' ? (tableSortDirection === 'asc' ? '▲' : '▼') : ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {sortedTables.map((t: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3.5 font-bold text-slate-900">{t.displayName}</td>
                        <td className="py-3.5 font-mono text-right">{t.orderCount}</td>
                        <td className="py-3.5 font-mono text-right font-bold text-slate-900">{formatCurrency(t.revenue)}</td>
                        <td className="py-3.5 font-mono text-right">{formatCurrency(t.averageOrderValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};

export default ManagerAnalytics;
