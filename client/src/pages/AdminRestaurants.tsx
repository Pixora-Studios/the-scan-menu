import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { adminService, Restaurant } from '../services/restaurant.service';
import {
  Plus,
  Edit2,
  ShieldAlert,
  CheckCircle,
  Shield,
  UserPlus,
  X,
  Loader,
  TrendingUp,
  LayoutGrid,
  Store,
  Layers,
  LogOut,
} from 'lucide-react';

const restaurantSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').or(z.literal('')),
  address: z.string().optional(),
  googleReviewUrl: z.string().optional(),
  subscription: z.object({
    status: z.enum(['ACTIVE', 'EXPIRED', 'TRIAL']),
    planType: z.enum(['STARTER', 'PREMIUM', 'ENTERPRISE']),
    expiresAt: z.string(),
  }).optional(),
});

const managerSchema = z.object({
  email: z.string().trim().email('Invalid email format'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type RestaurantFormValues = z.infer<typeof restaurantSchema>;
type ManagerFormValues = z.infer<typeof managerSchema>;

export const AdminRestaurants: React.FC = () => {
  const { logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRest, setEditingRest] = useState<Restaurant | null>(null);
  const [assigningRestId, setAssigningRestId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [subscriptionFilter, setSubscriptionFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'TRIAL'>('ALL');

  // Fetch stats
  const { data: statsResponse, isLoading: isLoadingStats } = useQuery({
    queryKey: ['adminStats'],
    queryFn: adminService.getPlatformStats,
  });

  // Fetch restaurants
  const { data: restResponse, isLoading: isLoadingRests } = useQuery({
    queryKey: ['adminRestaurants'],
    queryFn: () => adminService.listRestaurants(1, 100),
  });

  const restaurantsRaw = restResponse?.data?.restaurants || [];

  // Filtered restaurants
  const restaurants = restaurantsRaw.filter((rest: any) => {
    const matchesSearch = rest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (rest.slug && rest.slug.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (rest.email && rest.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' ||
                          (statusFilter === 'ACTIVE' && rest.isActive) ||
                          (statusFilter === 'SUSPENDED' && !rest.isActive);

    const matchesSub = subscriptionFilter === 'ALL' ||
                        (rest.subscription && rest.subscription.status === subscriptionFilter);

    return matchesSearch && matchesStatus && matchesSub;
  });

  const stats = statsResponse?.data || {
    totalRestaurants: 0,
    activeRestaurants: 0,
    suspendedRestaurants: 0,
    totalOrders: 0,
    activityFeed: [],
  };

  // Create restaurant
  const createMutation = useMutation({
    mutationFn: adminService.createRestaurant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRestaurants'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      setIsCreateOpen(false);
      restForm.reset();
      toast('Restaurant tenant successfully registered on the platform!', 'success');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error creating restaurant');
    },
  });

  // Edit restaurant
  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Restaurant> }) =>
      adminService.editRestaurant(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRestaurants'] });
      setEditingRest(null);
      restForm.reset();
      toast('Restaurant details successfully saved!', 'success');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error updating restaurant');
    },
  });

  // Suspend
  const suspendMutation = useMutation({
    mutationFn: adminService.suspendRestaurant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRestaurants'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      toast('Restaurant suspended immediately. Custom menu disabled.', 'info');
    },
  });

  // Activate
  const activateMutation = useMutation({
    mutationFn: adminService.activateRestaurant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRestaurants'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      toast('Restaurant activated. Live checkouts resumed.', 'success');
    },
  });

  // Create & Assign Manager
  const managerMutation = useMutation({
    mutationFn: ({ restaurantId, data }: { restaurantId: string; data: ManagerFormValues }) =>
      adminService.assignManager(restaurantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRestaurants'] });
      setAssigningRestId(null);
      managerForm.reset();
      toast('Platform manager credentials created and assigned successfully!', 'success');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error creating/assigning manager');
    },
  });

  const restForm = useForm<RestaurantFormValues>({
    resolver: zodResolver(restaurantSchema),
  });

  const managerForm = useForm<ManagerFormValues>({
    resolver: zodResolver(managerSchema),
  });

  const onRestSubmit = (values: RestaurantFormValues) => {
    setErrorMsg(null);
    const cleanedValues = {
      ...values,
      email: values.email === '' ? undefined : values.email,
    };
    if (editingRest) {
      editMutation.mutate({ id: editingRest._id, data: cleanedValues });
    } else {
      createMutation.mutate(cleanedValues);
    }
  };

  const onManagerSubmit = (values: ManagerFormValues) => {
    setErrorMsg(null);
    if (assigningRestId) {
      managerMutation.mutate({ restaurantId: assigningRestId, data: values });
    }
  };

  const handleEditClick = (rest: any) => {
    setEditingRest(rest);
    restForm.reset({
      name: rest.name,
      slug: rest.slug,
      description: rest.description || '',
      phone: rest.phone || '',
      email: rest.email || '',
      address: rest.address || '',
      googleReviewUrl: rest.googleReviewUrl || '',
      subscription: rest.subscription ? {
        status: rest.subscription.status,
        planType: rest.subscription.planType,
        expiresAt: rest.subscription.expiresAt ? new Date(rest.subscription.expiresAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      } : {
        status: 'TRIAL',
        planType: 'STARTER',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
    });
    setIsCreateOpen(true);
  };

  if (isLoadingStats || isLoadingRests) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="w-8 h-8 animate-spin text-amber-500" strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] font-sans flex flex-col">
      {/* Top Header Control */}
      <header className="bg-white border-b border-slate-150 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-amber-500" strokeWidth={1.75} />
          <h1 className="font-display tracking-tight text-3xl font-semibold text-slate-900 leading-none">
            Pixora SuperAdmin
          </h1>
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-red-600 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-red-50 transition"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.75} />
          <span>Platform Log Out</span>
        </button>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-8 space-y-8 overflow-y-auto">

        {/* 1. Statistics Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-xs font-extrabold uppercase tracking-wider">Total Tenants</span>
              <Store className="w-4.5 h-4.5 text-slate-400" strokeWidth={1.75} />
            </div>
            <h3 className="text-2xl font-black font-mono text-slate-900 mt-2">{stats.totalRestaurants}</h3>
          </div>

          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center text-green-600">
              <span className="text-xs font-extrabold uppercase tracking-wider">Active</span>
              <CheckCircle className="w-4.5 h-4.5" strokeWidth={1.75} />
            </div>
            <h3 className="text-2xl font-black font-mono text-slate-900 mt-2">{stats.activeRestaurants}</h3>
          </div>

          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center text-rose-500">
              <span className="text-xs font-extrabold uppercase tracking-wider">Suspended</span>
              <ShieldAlert className="w-4.5 h-4.5" strokeWidth={1.75} />
            </div>
            <h3 className="text-2xl font-black font-mono text-slate-900 mt-2">{stats.suspendedRestaurants}</h3>
          </div>

          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center text-indigo-500">
              <span className="text-xs font-extrabold uppercase tracking-wider">Platform Orders</span>
              <TrendingUp className="w-4.5 h-4.5" strokeWidth={1.75} />
            </div>
            <h3 className="text-2xl font-black font-mono text-slate-900 mt-2">{stats.totalOrders}</h3>
          </div>
        </div>

        {/* 2. Middle Row: activity feed + action header */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Restaurant list panel (2/3 width) */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white border border-slate-150 p-5 rounded-2xl shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">Registered Restaurant Tenants</h2>
                  <p className="text-[11px] text-slate-500">Add, configure, suspend, or assign managers inline.</p>
                </div>
                <button
                  onClick={() => {
                    setEditingRest(null);
                    restForm.reset({
                      name: '',
                      slug: '',
                      description: '',
                      phone: '',
                      email: '',
                      address: '',
                      googleReviewUrl: '',
                      subscription: {
                        status: 'TRIAL',
                        planType: 'STARTER',
                        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                      },
                    });
                    setIsCreateOpen(true);
                  }}
                  className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm border border-slate-950 shrink-0 self-start"
                >
                  <Plus className="w-4 h-4" strokeWidth={1.75} />
                  <span>Register Tenant</span>
                </button>
              </div>

              {/* Advanced search and filter panel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">Search Name / Slug</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search cafes, bistros..."
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">Platform Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e: any) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-amber-500 bg-white"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">Active Only</option>
                    <option value="SUSPENDED">Suspended Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">Subscription Plan</label>
                  <select
                    value={subscriptionFilter}
                    onChange={(e: any) => setSubscriptionFilter(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-amber-500 bg-white"
                  >
                    <option value="ALL">All Subscriptions</option>
                    <option value="ACTIVE">Active Subscriptions</option>
                    <option value="TRIAL">Trial Plans</option>
                    <option value="EXPIRED">Expired Subscriptions</option>
                  </select>
                </div>
              </div>
            </div>

            {restaurants.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-150 text-center text-slate-400">
                No restaurants matching filters found on this platform.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {restaurants.map((rest: Restaurant | any) => (
                  <div
                    key={rest._id}
                    className="bg-white rounded-3xl border border-slate-150 p-5 shadow-sm flex flex-col justify-between hover:shadow transition"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-sm text-slate-950 leading-tight">{rest.name}</h3>
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            rest.isActive
                              ? 'bg-green-50 text-green-700 border border-green-100'
                              : 'bg-red-50 text-red-700 border border-red-100'
                          }`}
                        >
                          {rest.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono">Slug: {rest.slug}</p>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-2 leading-relaxed">
                        {rest.description || 'No description provided.'}
                      </p>

                      {/* Subscription Badges */}
                      {rest.subscription && (
                        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-extrabold font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${
                            rest.subscription.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : rest.subscription.status === 'TRIAL'
                              ? 'bg-amber-50 text-amber-700 border-amber-100'
                              : 'bg-red-50 text-red-700 border-red-100'
                          }`}>
                            {rest.subscription.planType} • {rest.subscription.status}
                          </span>
                          <span className="text-[9px] font-medium text-slate-400 font-mono shrink-0">
                            Exp: {new Date(rest.subscription.expiresAt).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-3 mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => handleEditClick(rest)}
                          className="flex items-center gap-1 hover:text-slate-900 transition p-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => setAssigningRestId(rest._id)}
                          className="flex items-center gap-1 text-amber-600 hover:text-amber-800 transition p-1"
                        >
                          <UserPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Add Manager</span>
                        </button>
                      </div>

                      {rest.isActive ? (
                        <button
                          onClick={() => suspendMutation.mutate(rest._id)}
                          className="flex items-center gap-1 text-red-500 hover:text-red-700 transition p-1"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Suspend</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => activateMutation.mutate(rest._id)}
                          className="flex items-center gap-1 text-green-600 hover:text-green-800 transition p-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Activate</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Feed (1/3 width) */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
                <span>Live Activity Feed</span>
              </h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Real-time platform events log.</p>
            </div>

            {stats.activityFeed.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400 leading-normal">
                No recent platform activity logged.
              </div>
            ) : (
              <div className="space-y-4 max-h-[30rem] overflow-y-auto pr-1">
                {stats.activityFeed.map((act: any, idx: number) => (
                  <div key={idx} className="flex gap-2.5 text-xs">
                    <div className="shrink-0 mt-0.5">
                      <span className={`h-2 w-2 rounded-full block ${act.type === 'RESTAURANT_CREATED' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    </div>
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="text-slate-700 leading-relaxed font-sans">{act.message}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </main>

      {/* Create / Edit Restaurant Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-2xl font-bold">
                {editingRest ? 'Edit Restaurant' : 'New Restaurant'}
              </h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 animate-none"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                {errorMsg}
              </div>
            )}

            <form onSubmit={restForm.handleSubmit(onRestSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="The Pizza Place"
                  {...restForm.register('name')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
                {restForm.formState.errors.name && (
                  <p className="text-xs text-red-500 mt-1">
                    {restForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Custom Slug (Optional)
                </label>
                <input
                  type="text"
                  placeholder="pizza-place"
                  {...restForm.register('slug')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                <textarea
                  placeholder="Authentic woodfired pizza..."
                  {...restForm.register('description')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 h-20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+91 9999999999"
                    {...restForm.register('phone')}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                  <input
                    type="text"
                    placeholder="contact@pizzaplace.com"
                    {...restForm.register('email')}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                  />
                  {restForm.formState.errors.email && (
                    <p className="text-xs text-red-500 mt-1">
                      {restForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Address</label>
                <input
                  type="text"
                  placeholder="123 Food Street"
                  {...restForm.register('address')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Google Review URL
                </label>
                <input
                  type="text"
                  placeholder="https://g.page/r/..."
                  {...restForm.register('googleReviewUrl')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Subscription settings (Only visible/editable for Super Admins) */}
              <div className="bg-slate-50 p-4 border border-slate-150 rounded-2xl space-y-3">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Subscription Plan Settings</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">Status</label>
                    <select
                      {...restForm.register('subscription.status')}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="TRIAL">TRIAL</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">Plan Type</label>
                    <select
                      {...restForm.register('subscription.planType')}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                    >
                      <option value="STARTER">STARTER</option>
                      <option value="PREMIUM">PREMIUM</option>
                      <option value="ENTERPRISE">ENTERPRISE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">Expires At</label>
                    <input
                      type="date"
                      {...restForm.register('subscription.expiresAt')}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || editMutation.isPending}
                  className="w-1/2 py-2.5 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  {(createMutation.isPending || editMutation.isPending) && <Loader className="w-4 h-4 animate-spin" />}
                  <span>{editingRest ? 'Save Changes' : 'Register Tenant'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Manager Modal */}
      {assigningRestId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2 text-amber-500">
                <LayoutGrid className="w-5 h-5" strokeWidth={1.75} />
                <h2 className="font-display text-2xl font-bold">Create Restaurant Manager</h2>
              </div>
              <button
                onClick={() => setAssigningRestId(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                {errorMsg}
              </div>
            )}

            <form onSubmit={managerForm.handleSubmit(onManagerSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="John Doe"
                  {...managerForm.register('name')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
                {managerForm.formState.errors.name && (
                  <p className="text-xs text-red-500 mt-1">
                    {managerForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="manager@pizzaplace.com"
                  {...managerForm.register('email')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
                {managerForm.formState.errors.email && (
                  <p className="text-xs text-red-500 mt-1">
                    {managerForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  {...managerForm.register('password')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
                {managerForm.formState.errors.password && (
                  <p className="text-xs text-red-500 mt-1">
                    {managerForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setAssigningRestId(null)}
                  className="w-1/2 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={managerMutation.isPending}
                  className="w-1/2 py-2.5 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  {managerMutation.isPending && <Loader className="w-4 h-4 animate-spin" />}
                  <span>Create & Assign</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminRestaurants;
