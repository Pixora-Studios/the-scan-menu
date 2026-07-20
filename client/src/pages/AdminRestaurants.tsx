import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { adminService, Restaurant } from '../services/restaurant.service';
import { Plus, Edit2, ShieldAlert, CheckCircle, Shield, UserPlus, X, Loader } from 'lucide-react';

const restaurantSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').or(z.literal('')),
  address: z.string().optional(),
  googleReviewUrl: z.string().optional(),
});

const managerSchema = z.object({
  email: z.string().trim().email('Invalid email format'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type RestaurantFormValues = z.infer<typeof restaurantSchema>;
type ManagerFormValues = z.infer<typeof managerSchema>;

export const AdminRestaurants: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRest, setEditingRest] = useState<Restaurant | null>(null);
  const [assigningRestId, setAssigningRestId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch restaurants
  const { data, isLoading } = useQuery({
    queryKey: ['adminRestaurants'],
    queryFn: () => adminService.listRestaurants(1, 100),
  });

  const restaurants = data?.data?.restaurants || [];

  // Create restaurant
  const createMutation = useMutation({
    mutationFn: adminService.createRestaurant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRestaurants'] });
      setIsCreateOpen(false);
      restForm.reset();
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
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error updating restaurant');
    },
  });

  // Suspend
  const suspendMutation = useMutation({
    mutationFn: adminService.suspendRestaurant,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminRestaurants'] }),
  });

  // Activate
  const activateMutation = useMutation({
    mutationFn: adminService.activateRestaurant,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminRestaurants'] }),
  });

  // Create & Assign Manager
  const managerMutation = useMutation({
    mutationFn: ({ restaurantId, data }: { restaurantId: string; data: ManagerFormValues }) =>
      adminService.assignManager(restaurantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRestaurants'] });
      setAssigningRestId(null);
      managerForm.reset();
      alert('Manager created and assigned successfully.');
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

  const handleEditClick = (rest: Restaurant) => {
    setEditingRest(rest);
    restForm.reset({
      name: rest.name,
      slug: rest.slug,
      description: rest.description || '',
      phone: rest.phone || '',
      email: rest.email || '',
      address: rest.address || '',
      googleReviewUrl: rest.googleReviewUrl || '',
    });
    setIsCreateOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-display tracking-tight text-4xl font-bold text-slate-900">
            Manage Restaurants
          </h1>
          <p className="text-slate-500 text-sm">Super Admin platform control center</p>
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
            });
            setIsCreateOpen(true);
          }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-800 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add Restaurant</span>
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {restaurants.map((rest: Restaurant) => (
          <div
            key={rest._id}
            className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-lg text-slate-900">{rest.name}</h3>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    rest.isActive
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {rest.isActive ? 'Active' : 'Suspended'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mb-2">Slug: {rest.slug}</p>
              <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                {rest.description || 'No description provided.'}
              </p>
            </div>

            <div className="border-t border-slate-50 pt-4 mt-auto flex flex-wrap gap-2">
              <button
                onClick={() => handleEditClick(rest)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-slate-50 transition"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>

              <button
                onClick={() => setAssigningRestId(rest._id)}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Manager</span>
              </button>

              {rest.isActive ? (
                <button
                  onClick={() => suspendMutation.mutate(rest._id)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg hover:bg-red-50 transition ml-auto"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Suspend</span>
                </button>
              ) : (
                <button
                  onClick={() => activateMutation.mutate(rest._id)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-green-600 hover:text-green-800 px-3 py-1.5 rounded-lg hover:bg-green-50 transition ml-auto"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Activate</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-2xl font-bold">
                {editingRest ? 'Edit Restaurant' : 'New Restaurant'}
              </h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
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

              <div className="grid grid-cols-2 gap-4">
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
                  className="w-1/2 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition"
                >
                  {editingRest ? 'Save Changes' : 'Create'}
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
                <Shield className="w-5 h-5" />
                <h2 className="font-display text-2xl font-bold">Create Restaurant Manager</h2>
              </div>
              <button
                onClick={() => setAssigningRestId(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
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
                  className="w-1/2 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition"
                >
                  Create & Assign
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
