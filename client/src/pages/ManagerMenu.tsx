import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { apiClient } from '../lib/api';
import { ImageUploader } from '../components/ImageUploader';
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Loader,
  FolderOpen,
  Flame,
  Leaf,
  GripVertical,
} from 'lucide-react';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
});

const menuItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Price must be positive'),
  imageUrl: z.string().optional(),
  isVegetarian: z.boolean().default(false),
  isSpicy: z.boolean().default(false),
  prepTimeMinutes: z.coerce.number().int().positive().optional(),
  addOns: z
    .array(
      z.object({
        name: z.string().min(1, 'Add-on name is required'),
        priceDelta: z.coerce.number().nonnegative('Price delta must be non-negative'),
      })
    )
    .default([]),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

// Sortable Wrapper component for categories/items
interface SortableItemProps {
  id: string;
  children: (props: { dragHandleProps: any }) => React.ReactNode;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...attributes, ...listeners } })}
    </div>
  );
};

export const ManagerMenu: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any | null>(null);
  const [isItemOpen, setIsItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bulk availability states
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const activeRestaurantId = user?.restaurants?.[0];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Fetch Categories
  const { data: catResponse, isLoading: isLoadingCats } = useQuery({
    queryKey: ['categories', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}/categories`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  const categories = useMemo(() => catResponse?.data || [], [catResponse]);

  // Automatically select the first category if none is selected
  React.useEffect(() => {
    if (categories.length > 0 && !selectedCatId) {
      setSelectedCatId(categories[0]._id);
    }
  }, [categories, selectedCatId]);

  // Fetch Menu Items scoped inside selectedCategory
  const { data: itemsResponse, isLoading: isLoadingItems } = useQuery({
    queryKey: ['menuItems', activeRestaurantId, selectedCatId],
    queryFn: async () => {
      const res = await apiClient.get(
        `/restaurants/${activeRestaurantId}/menu-items?categoryId=${selectedCatId}`
      );
      return res.data;
    },
    enabled: !!activeRestaurantId && !!selectedCatId,
  });

  const menuItems = itemsResponse?.data || [];

  // ==========================================
  // MUTATIONS (Categories)
  // ==========================================
  const createCatMutation = useMutation({
    mutationFn: (data: CategoryFormValues) =>
      apiClient.post(`/restaurants/${activeRestaurantId}/categories`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', activeRestaurantId] });
      setIsCatOpen(false);
      catForm.reset();
      toast('Category created successfully.', 'success');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error creating category');
    },
  });

  const editCatMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CategoryFormValues }) =>
      apiClient.patch(`/restaurants/${activeRestaurantId}/categories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', activeRestaurantId] });
      setIsCatOpen(false);
      setEditingCat(null);
      catForm.reset();
      toast('Category updated successfully.', 'success');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error editing category');
    },
  });

  const deleteCatMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/restaurants/${activeRestaurantId}/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', activeRestaurantId] });
      setSelectedCatId(null);
      toast('Category deleted successfully.', 'success');
    },
    onError: (err: any) => {
      toast(err.response?.data?.error?.message || 'Error deleting category', 'error');
    },
  });

  const reorderCatsMutation = useMutation({
    mutationFn: (categoryIds: string[]) =>
      apiClient.patch(`/restaurants/${activeRestaurantId}/categories-reorder`, { categoryIds }),
    onMutate: async (categoryIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['categories', activeRestaurantId] });
      const previous = queryClient.getQueryData(['categories', activeRestaurantId]);

      // Optimistic update of categories sortOrder inside local cache
      queryClient.setQueryData(['categories', activeRestaurantId], (old: any) => {
        if (!old) return old;
        const sorted = [...old.data].sort((a, b) => {
          return categoryIds.indexOf(a._id) - categoryIds.indexOf(b._id);
        });
        return { ...old, data: sorted };
      });

      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', activeRestaurantId] });
    },
  });

  const handleDragEndCategories = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex((c: any) => c._id === active.id);
      const newIndex = categories.findIndex((c: any) => c._id === over.id);
      const reordered = arrayMove(categories, oldIndex, newIndex);
      reorderCatsMutation.mutate(reordered.map((c: any) => c._id));
    }
  };

  // ==========================================
  // MUTATIONS (Menu Items)
  // ==========================================
  const createItemMutation = useMutation({
    mutationFn: (data: any) =>
      apiClient.post(`/restaurants/${activeRestaurantId}/menu-items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', activeRestaurantId, selectedCatId] });
      setIsItemOpen(false);
      itemForm.reset();
      toast('Menu item created successfully.', 'success');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error creating menu item');
    },
  });

  const editItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.patch(`/restaurants/${activeRestaurantId}/menu-items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', activeRestaurantId, selectedCatId] });
      setIsItemOpen(false);
      setEditingItem(null);
      itemForm.reset();
      toast('Menu item updated successfully.', 'success');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error editing menu item');
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/restaurants/${activeRestaurantId}/menu-items/${id}`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', activeRestaurantId, selectedCatId] });
      if (res.data?.data?.archived) {
        toast('Menu item has order history; successfully soft-archived and made unavailable.', 'info');
      } else {
        toast('Menu item successfully deleted.', 'success');
      }
    },
  });

  const reorderItemsMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      apiClient.patch(`/restaurants/${activeRestaurantId}/menu-items-reorder`, {
        itemIds,
        categoryId: selectedCatId,
      }),
    onMutate: async (itemIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['menuItems', activeRestaurantId, selectedCatId] });
      const previous = queryClient.getQueryData(['menuItems', activeRestaurantId, selectedCatId]);

      // Optimistic sorting inside local cache
      queryClient.setQueryData(['menuItems', activeRestaurantId, selectedCatId], (old: any) => {
        if (!old) return old;
        const sorted = [...old.data].sort((a, b) => {
          return itemIds.indexOf(a._id) - itemIds.indexOf(b._id);
        });
        return { ...old, data: sorted };
      });

      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', activeRestaurantId, selectedCatId] });
    },
  });

  const handleDragEndItems = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = menuItems.findIndex((i: any) => i._id === active.id);
      const newIndex = menuItems.findIndex((i: any) => i._id === over.id);
      const reordered = arrayMove(menuItems, oldIndex, newIndex);
      reorderItemsMutation.mutate(reordered.map((i: any) => i._id));
    }
  };

  // Optimistic Toggle for availability
  const toggleAvailableMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/restaurants/${activeRestaurantId}/menu-items/${id}/availability`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['menuItems', activeRestaurantId, selectedCatId] });
      const previousItems = queryClient.getQueryData(['menuItems', activeRestaurantId, selectedCatId]);

      // Optimistically flip the isAvailable state
      queryClient.setQueryData(
        ['menuItems', activeRestaurantId, selectedCatId],
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((item: any) =>
              item._id === id ? { ...item, isAvailable: !item.isAvailable } : item
            ),
          };
        }
      );

      return { previousItems };
    },
    onError: (_err, _id, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(
          ['menuItems', activeRestaurantId, selectedCatId],
          context.previousItems
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', activeRestaurantId, selectedCatId] });
    },
  });

  // Bulk availability update
  const bulkAvailableMutation = useMutation({
    mutationFn: ({ ids, isAvailable }: { ids: string[]; isAvailable: boolean }) =>
      apiClient.patch(`/restaurants/${activeRestaurantId}/menu-items-bulk-availability`, {
        itemIds: ids,
        isAvailable,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems', activeRestaurantId, selectedCatId] });
      setSelectedItemIds([]);
      setBulkMode(false);
    },
  });

  // Category and item forms
  const catForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
  });

  const itemForm = useForm<any>({
    resolver: zodResolver(menuItemSchema),
    defaultValues: { addOns: [], isVegetarian: false, isSpicy: false },
  });

  const { fields: addOnFields, append: appendAddOn, remove: removeAddOn } = useFieldArray({
    control: itemForm.control,
    name: 'addOns',
  });

  const onCatSubmit = (values: CategoryFormValues) => {
    setErrorMsg(null);
    if (editingCat) {
      editCatMutation.mutate({ id: editingCat._id, data: values });
    } else {
      createCatMutation.mutate(values);
    }
  };

  const onItemSubmit = (values: any) => {
    setErrorMsg(null);
    // Convert price and add-on prices to positive integer paise (multiply by 100)
    const priceInPaise = Math.round(values.price * 100);
    const addOnsInPaise = values.addOns?.map((addon: any) => ({
      name: addon.name.trim(),
      priceDelta: Math.round(addon.priceDelta * 100),
    }));

    const payload = {
      ...values,
      categoryId: selectedCatId,
      price: priceInPaise,
      addOns: addOnsInPaise,
    };

    if (editingItem) {
      editItemMutation.mutate({ id: editingItem._id, data: payload });
    } else {
      createItemMutation.mutate(payload);
    }
  };

  const handleEditCatClick = (cat: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCat(cat);
    catForm.reset({
      name: cat.name,
      description: cat.description || '',
      imageUrl: cat.imageUrl || '',
    });
    setIsCatOpen(true);
  };

  const handleEditItemClick = (item: any) => {
    setEditingItem(item);
    itemForm.reset({
      name: item.name,
      description: item.description || '',
      price: item.price / 100, // convert back to floats for UI
      imageUrl: item.imageUrl || '',
      isVegetarian: item.isVegetarian,
      isSpicy: item.isSpicy,
      prepTimeMinutes: item.prepTimeMinutes || '',
      addOns: item.addOns?.map((addon: any) => ({
        name: addon.name,
        priceDelta: addon.priceDelta / 100,
      })) || [],
    });
    setIsItemOpen(true);
  };

  const toggleBulkSelectItem = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

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
    <div className="max-w-6xl mx-auto px-4 py-8 font-sans">
      <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-5">
        <div>
          <h1 className="font-display tracking-tight text-4xl font-bold text-slate-900">
            Restaurant Menu Builder
          </h1>
          <p className="text-slate-500 text-sm">Organize dynamic categories and detailed menu items</p>
        </div>
      </div>

      {/* Main Responsive Grid Layout (Split-Panel / Drill-Down on Mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Left Side: Categories Panel */}
        <div className="md:col-span-1 space-y-4">
          <div className="flex justify-between items-center bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
              <span>Categories</span>
            </h2>
            <button
              onClick={() => {
                setEditingCat(null);
                catForm.reset({ name: '', description: '', imageUrl: '' });
                setIsCatOpen(true);
              }}
              className="p-1.5 bg-primary text-white hover:bg-slate-800 rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>

          {isLoadingCats ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCategories}>
              <SortableContext items={categories.map((c: any) => c._id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {categories.map((cat: any) => (
                    <SortableItem key={cat._id} id={cat._id}>
                      {({ dragHandleProps }) => (
                        <div
                          onClick={() => setSelectedCatId(cat._id)}
                          className={`group relative p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            selectedCatId === cat._id
                              ? 'border-amber-400 bg-amber-50/20 text-slate-900 font-semibold'
                              : 'border-slate-100 bg-white hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span {...dragHandleProps} className="cursor-grab text-slate-300 hover:text-slate-600 p-0.5">
                              <GripVertical className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </span>
                            <span className="truncate">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleEditCatClick(cat, e)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition"
                            >
                              <Edit2 className="w-3 h-3" strokeWidth={1.75} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    'Are you sure you want to delete this category? Non-empty categories will be blocked.'
                                  )
                                ) {
                                  deleteCatMutation.mutate(cat._id);
                                }
                              }}
                              className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition"
                            >
                              <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                            </button>
                          </div>
                        </div>
                      )}
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Right Side: Menu Items Panel */}
        <div className="md:col-span-3 space-y-6 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-50 pb-4 flex-wrap gap-4">
            <div>
              <h2 className="font-display tracking-tight text-3xl font-semibold text-slate-900">
                {categories.find((c: any) => c._id === selectedCatId)?.name || 'Select a Category'}
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                {menuItems.length} items configured in this category
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Bulk Mode Actions */}
              {menuItems.length > 0 && (
                <button
                  onClick={() => {
                    setBulkMode(!bulkMode);
                    setSelectedItemIds([]);
                  }}
                  className={`text-xs px-3.5 py-2 rounded-xl border font-semibold transition ${
                    bulkMode
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {bulkMode ? 'Cancel Bulk Selection' : 'Bulk Select'}
                </button>
              )}

              <button
                disabled={!selectedCatId}
                onClick={() => {
                  setEditingItem(null);
                  itemForm.reset({
                    name: '',
                    description: '',
                    price: 0,
                    imageUrl: '',
                    isVegetarian: false,
                    isSpicy: false,
                    prepTimeMinutes: undefined,
                    addOns: [],
                  });
                  setIsItemOpen(true);
                }}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                <span>Add Item</span>
              </button>
            </div>
          </div>

          {/* Bulk Select Control Bar */}
          {bulkMode && selectedItemIds.length > 0 && (
            <div className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between animate-fade-in text-xs">
              <span>{selectedItemIds.length} items selected</span>
              <div className="flex gap-2">
                <button
                  onClick={() => bulkAvailableMutation.mutate({ ids: selectedItemIds, isAvailable: true })}
                  className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 transition font-semibold"
                >
                  Make Available
                </button>
                <button
                  onClick={() => bulkAvailableMutation.mutate({ ids: selectedItemIds, isAvailable: false })}
                  className="px-3 py-1 bg-red-600 rounded hover:bg-red-700 transition font-semibold"
                >
                  Make Unavailable
                </button>
              </div>
            </div>
          )}

          {isLoadingItems ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 4].map((n) => (
                <div key={n} className="h-28 bg-slate-50 border border-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : menuItems.length === 0 ? (
            <div className="text-center py-20 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-3">
              <FolderOpen className="w-10 h-10 text-slate-300 mx-auto animate-pulse" strokeWidth={1.75} />
              <div className="space-y-1">
                <h4 className="font-bold text-slate-700">Category is Empty</h4>
                <p className="text-xs text-slate-400">Click "Add Item" above to add the first menu item.</p>
              </div>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndItems}>
              <SortableContext items={menuItems.map((i: any) => i._id)} strategy={verticalListSortingStrategy}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {menuItems.map((item: any) => (
                    <SortableItem key={item._id} id={item._id}>
                      {({ dragHandleProps }) => (
                        <div
                          onClick={() => bulkMode && toggleBulkSelectItem(item._id)}
                          className={`relative border rounded-2xl p-4 flex gap-4 transition-all ${
                            bulkMode && selectedItemIds.includes(item._id)
                              ? 'border-amber-400 bg-amber-50/10 shadow-inner'
                              : 'border-slate-100 bg-white hover:shadow-sm'
                          } ${!item.isAvailable ? 'opacity-85' : ''}`}
                        >
                          {/* Select indicator */}
                          {bulkMode && (
                            <div className="absolute top-3 left-3 z-10">
                              <input
                                type="checkbox"
                                checked={selectedItemIds.includes(item._id)}
                                onChange={() => {}}
                                className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500/20"
                              />
                            </div>
                          )}

                          <div className="flex flex-col justify-center select-none shrink-0" {...dragHandleProps}>
                            <GripVertical className="w-4 h-4 text-slate-300 hover:text-slate-600 cursor-grab" strokeWidth={1.75} />
                          </div>

                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-20 h-20 object-cover rounded-xl shrink-0"
                            />
                          )}

                          <div className="flex flex-col justify-between flex-1">
                            <div>
                              <div className="flex justify-between items-start">
                                <h4 className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                  <span>{item.name}</span>
                                  {item.isVegetarian && <Leaf className="w-3.5 h-3.5 text-green-500 shrink-0" strokeWidth={1.75} />}
                                  {item.isSpicy && <Flame className="w-3.5 h-3.5 text-red-500 shrink-0" strokeWidth={1.75} />}
                                </h4>
                                <span className="font-mono font-bold text-slate-800 text-sm">
                                  {(item.price / 100).toFixed(2)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 line-clamp-2 mt-1 pr-6">
                                {item.description || 'No description provided.'}
                              </p>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-50 pt-2.5 mt-2">
                              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                {/* Inline availability toggle */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleAvailableMutation.mutate(item._id);
                                  }}
                                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                    item.isAvailable
                                      ? 'bg-green-50 text-green-700 hover:bg-green-100/50'
                                      : 'bg-red-50 text-red-700 hover:bg-red-100/50'
                                  }`}
                                >
                                  {item.isAvailable ? 'Available' : 'Unavailable'}
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditItemClick(item);
                                  }}
                                  className="p-1 hover:bg-slate-50 rounded text-slate-400 hover:text-slate-700 transition"
                                >
                                  <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Are you sure you want to delete this menu item?')) {
                                      deleteItemMutation.mutate(item._id);
                                    }
                                  }}
                                  className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Category Modal */}
      {isCatOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-2xl font-bold">
                {editingCat ? 'Edit Category' : 'New Category'}
              </h2>
              <button onClick={() => setIsCatOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                {errorMsg}
              </div>
            )}

            <form onSubmit={catForm.handleSubmit(onCatSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Category Name</label>
                <input
                  type="text"
                  placeholder="Desserts"
                  {...catForm.register('name')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
                {catForm.formState.errors.name?.message && (
                  <p className="text-xs text-red-500 mt-1">{String(catForm.formState.errors.name.message)}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                <textarea
                  placeholder="Sweet treats & baked delights..."
                  {...catForm.register('description')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 h-20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Category Image</label>
                <ImageUploader
                  restaurantId={activeRestaurantId!}
                  value={catForm.watch('imageUrl')}
                  onChange={(url: string) => catForm.setValue('imageUrl', url)}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCatOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition"
                >
                  {editingCat ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Menu Item Modal */}
      {isItemOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-2xl font-bold">
                {editingItem ? 'Edit Menu Item' : 'New Menu Item'}
              </h2>
              <button onClick={() => setIsItemOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                {errorMsg}
              </div>
            )}

            <form onSubmit={itemForm.handleSubmit(onItemSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Item Name</label>
                  <input
                    type="text"
                    placeholder="Paneer Tikka Pizza"
                    {...itemForm.register('name')}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                  />
                  {itemForm.formState.errors.name && (
                    <p className="text-xs text-red-500 mt-1">
                      {String(itemForm.formState.errors.name?.message || '')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Price (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="349.00"
                    {...itemForm.register('price')}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                  />
                  {itemForm.formState.errors.price && (
                    <p className="text-xs text-red-500 mt-1">
                      {String(itemForm.formState.errors.price?.message || '')}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                <textarea
                  placeholder="Spiced cottage cheese chunks..."
                  {...itemForm.register('description')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 h-20"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2 py-2">
                  <input type="checkbox" id="veg" {...itemForm.register('isVegetarian')} className="rounded text-amber-500" />
                  <label htmlFor="veg" className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Leaf className="w-3.5 h-3.5 text-green-500" strokeWidth={1.75} />
                    <span>Vegetarian</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 py-2">
                  <input type="checkbox" id="spicy" {...itemForm.register('isSpicy')} className="rounded text-amber-500" />
                  <label htmlFor="spicy" className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-red-500" strokeWidth={1.75} />
                    <span>Spicy</span>
                  </label>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">Prep Time (Mins)</label>
                  <input
                    type="number"
                    placeholder="15"
                    {...itemForm.register('prepTimeMinutes')}
                    className="w-full px-3.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Item Image</label>
                <ImageUploader
                  restaurantId={activeRestaurantId!}
                  value={itemForm.watch('imageUrl')}
                  onChange={(url: string) => itemForm.setValue('imageUrl', url)}
                />
              </div>

              {/* Repeater Add-On Sections */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                  <span className="text-xs font-bold text-slate-700">Add-On Customizations</span>
                  <button
                    type="button"
                    onClick={() => appendAddOn({ name: '', priceDelta: 0 })}
                    className="text-[11px] font-bold text-amber-600 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" strokeWidth={1.75} />
                    <span>Add Add-On Row</span>
                  </button>
                </div>

                {addOnFields.map((field, index) => (
                  <div key={field.id} className="flex gap-3 items-center">
                    <input
                      type="text"
                      placeholder="Extra Cheese"
                      {...itemForm.register(`addOns.${index}.name` as const)}
                      className="w-1/2 px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="60.00"
                      {...itemForm.register(`addOns.${index}.priceDelta` as const)}
                      className="w-1/3 px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeAddOn(index)}
                      className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsItemOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition"
                >
                  {editingItem ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default ManagerMenu;
