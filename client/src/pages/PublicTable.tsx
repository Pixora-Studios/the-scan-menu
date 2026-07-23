import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search as SearchIcon,
  Loader,
  AlertTriangle,
  Flame,
  Leaf,
  Plus,
  Minus,
  Trash2,
  X,
  Sparkles,
  ChevronRight,
  BellRing,
  CheckCircle2,
  Compass,
  Star,
  MessageSquare,
  Phone,
  Lock,
  MapPin,
  Clock,
  CreditCard,
} from 'lucide-react';
import { publicService, PublicCategory, MenuItem, AddOn } from '../services/restaurant.service';
import { useCartStore } from '../store/useCartStore';
import { useToast } from '../hooks/useToast';
import apiClient from '../lib/api';

// ==========================================
// HELPERS
// ==========================================

const formatPrice = (amountInPaise: number, currency: string) => {
  const amount = amountInPaise / 100;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 0,
  }).format(amount);
};

// ==========================================
// SUBCOMPONENTS
// ==========================================

interface MenuBadgeProps {
  variant: 'veg' | 'spicy';
}

const MenuBadge: React.FC<MenuBadgeProps> = ({ variant }) => {
  if (variant === 'veg') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">
        <Leaf className="w-2.5 h-2.5" strokeWidth={2} />
        Veg
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-red-50 text-red-700 border border-red-100">
      <Flame className="w-2.5 h-2.5" strokeWidth={2} />
      Spicy
    </span>
  );
};

const MenuSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    <div className="flex gap-2 overflow-x-hidden py-2">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="h-9 w-24 bg-slate-200 rounded-full shrink-0" />
      ))}
    </div>
    {[1, 2].map((cat) => (
      <div key={cat} className="space-y-4">
        <div className="h-7 bg-slate-200 rounded-lg w-1/3" />
        <div className="grid grid-cols-1 gap-4">
          {[1, 2].map((n) => (
            <div key={n} className="flex gap-4 p-4 bg-white rounded-2xl border border-slate-100">
              <div className="w-20 h-20 bg-slate-200 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-slate-200 rounded w-1/2" />
                <div className="h-3 bg-slate-200 rounded w-3/4" />
                <div className="h-4 bg-slate-200 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// ==========================================
// MAIN COMPONENT
// ==========================================

export const PublicTable: React.FC = () => {
  const { restaurantSlug, tableToken } = useParams<{ restaurantSlug: string; tableToken: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Zustand Cart Store
  const { items: cartItems, setTable, addItem, updateQuantity, clearCart } = useCartStore();

  // Primary Bottom Tab: 'landing' | 'menu' | 'waiter' | 'reviews'
  const [activeTab, setActiveTab] = useState<'landing' | 'menu' | 'waiter' | 'reviews'>('landing');

  const [recentOrderIds, setRecentOrderIds] = useState<string[]>([]);

  useEffect(() => {
    if (restaurantSlug && tableToken) {
      const key = `pixora_orders_${restaurantSlug}_${tableToken}`;
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      setRecentOrderIds(stored);
    }
  }, [restaurantSlug, tableToken]);

  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [priceSort, setPriceSort] = useState<'default' | 'low-high' | 'high-low'>('default');
  const showAvailableOnly = true;

  // Category Scrolling State
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  // Waiter request types and confirm states
  const [selectedRequestType, setSelectedRequestType] = useState<'CALL_WAITER' | 'REQUEST_BILL' | 'WATER' | 'TISSUE' | 'OTHER'>('CALL_WAITER');
  const [isWaiterConfirmOpen, setIsWaiterConfirmOpen] = useState(false);
  const [isClearCartModalOpen, setIsClearCartModalOpen] = useState(false);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);

  // Phone checkout / OTP State
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Phase 5 Order Placement States
  const [customerNote, setCustomerNote] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [failedOrderDetails, setFailedOrderDetails] = useState<
    { menuItemId: string; name: string; reason: 'unavailable' | 'category_inactive' }[]
  >([]);

  // Phase 7 Waiter Call States
  const [waiterCallState, setWaiterCallState] = useState<'idle' | 'pulsing' | 'waiting'>('idle');

  // Query active waiter call on mount
  const { data: activeCallData } = useQuery({
    queryKey: ['activeWaiterCall', tableToken],
    queryFn: async () => {
      const res = await apiClient.get(`/public/tables/${tableToken}/waiter-call/active`);
      return res.data;
    },
    enabled: !!tableToken,
  });

  // Sync initial waiter call state
  useEffect(() => {
    if (activeCallData?.success) {
      if (activeCallData.data) {
        setWaiterCallState('waiting');
      } else {
        setWaiterCallState('idle');
      }
    }
  }, [activeCallData]);

  // Bottom Sheet States for Item Detail
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [detailSelectedAddOns, setDetailSelectedAddOns] = useState<AddOn[]>([]);
  const [detailSpecialInstructions, setDetailSpecialInstructions] = useState('');

  // Navigation refs
  const categoryNavRef = useRef<HTMLDivElement>(null);
  const activePillRef = useRef<HTMLButtonElement>(null);
  const isScrollingRef = useRef(false);

  // Debouncing Search Query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Query table resolution (Theme and Core Details)
  const { data: tableData, error: tableError, isLoading: isTableLoading } = useQuery({
    queryKey: ['publicTable', restaurantSlug, tableToken],
    queryFn: () => publicService.resolveTable(restaurantSlug!, tableToken!),
    enabled: !!restaurantSlug && !!tableToken,
    retry: false,
  });

  // Query public menu
  const { data: menuData, isLoading: isMenuLoading } = useQuery({
    queryKey: ['publicMenu', restaurantSlug, tableToken],
    queryFn: () => publicService.getPublicMenu(restaurantSlug!, tableToken!),
    enabled: !!restaurantSlug && !!tableToken,
    retry: false,
  });

  // Verify and clear cart if tableToken is changed
  useEffect(() => {
    if (tableData?.success && tableToken && restaurantSlug) {
      setTable(restaurantSlug, tableToken);
    }
  }, [tableData, tableToken, restaurantSlug, setTable]);

  // Handle active category auto-scroll into horizontal nav view
  useEffect(() => {
    if (activeCategoryId && activePillRef.current && categoryNavRef.current) {
      const activePill = activePillRef.current;
      const navContainer = categoryNavRef.current;
      const containerWidth = navContainer.offsetWidth;
      const pillOffsetLeft = activePill.offsetLeft;
      const pillWidth = activePill.offsetWidth;

      navContainer.scrollTo({
        left: pillOffsetLeft - containerWidth / 2 + pillWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [activeCategoryId]);

  // Scroll Spy logic
  useEffect(() => {
    if (activeTab !== 'menu') return;
    const handleScroll = () => {
      if (isScrollingRef.current) return;

      const categoryElements = document.querySelectorAll('[data-category-section]');
      let currentActiveId = '';

      for (let i = 0; i < categoryElements.length; i++) {
        const el = categoryElements[i] as HTMLElement;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 140) {
          currentActiveId = el.getAttribute('data-category-section') || '';
        }
      }

      if (currentActiveId && currentActiveId !== activeCategoryId) {
        setActiveCategoryId(currentActiveId);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeCategoryId, activeTab]);

  if (isTableLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const isError = !!tableError || !tableData?.success;
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
        </div>
      </div>
    );
  }

  const { restaurant, table } = tableData.data;
  const { theme, currency } = restaurant;

  // CSS variables for white-label styling
  const cssVariables = {
    '--theme-primary': theme.primaryColor || '#111827',
    '--theme-secondary': theme.secondaryColor || '#FFFFFF',
    '--theme-accent': theme.accentColor || '#F59E0B',
  } as React.CSSProperties;

  const rawCategories: PublicCategory[] = menuData?.success ? menuData.data : [];

  // Filter and sort items dynamically for menu and search tabs
  const getFilteredMenu = () => {
    return rawCategories
      .map((category) => {
        let matchedItems = category.menuItems.filter((item) => {
          // Search term match
          const matchesQuery = item.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

          // Diet filter
          const matchesDiet =
            dietFilter === 'all' ||
            (dietFilter === 'veg' && item.isVegetarian) ||
            (dietFilter === 'nonveg' && !item.isVegetarian);

          // Availability check
          const matchesAvailability = !showAvailableOnly || item.isAvailable;

          return matchesQuery && matchesDiet && matchesAvailability;
        });

        // Price Sorting
        if (priceSort === 'low-high') {
          matchedItems = [...matchedItems].sort((a, b) => a.price - b.price);
        } else if (priceSort === 'high-low') {
          matchedItems = [...matchedItems].sort((a, b) => b.price - a.price);
        }

        return {
          ...category,
          menuItems: matchedItems,
        };
      })
      .filter((category) => category.menuItems.length > 0);
  };

  const filteredCategories = getFilteredMenu();

  // Set initial active category once loaded
  if (!activeCategoryId && filteredCategories.length > 0) {
    setActiveCategoryId(filteredCategories[0]._id);
  }

  // Handle Category Pill Click
  const handleCategoryClick = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    const element = document.getElementById(`category-section-${categoryId}`);
    if (element) {
      isScrollingRef.current = true;
      const topOffset = element.getBoundingClientRect().top + window.pageYOffset - 120;
      window.scrollTo({
        top: topOffset,
        behavior: 'smooth',
      });
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 600);
    }
  };

  // Open item bottom sheet
  const handleItemCardClick = (item: MenuItem) => {
    if (!item.isAvailable) return;
    setSelectedItem(item);
    setDetailQuantity(1);
    setDetailSelectedAddOns([]);
    setDetailSpecialInstructions('');
  };

  // Add-on check toggler
  const handleAddOnToggle = (addOn: AddOn) => {
    setDetailSelectedAddOns((prev) => {
      const exists = prev.some((x) => x.name === addOn.name);
      if (exists) {
        return prev.filter((x) => x.name !== addOn.name);
      }
      return [...prev, addOn];
    });
  };

  const handleAddToCart = () => {
    if (!selectedItem) return;

    addItem({
      itemId: selectedItem._id,
      name: selectedItem.name,
      basePrice: selectedItem.price,
      quantity: detailQuantity,
      selectedAddOns: detailSelectedAddOns,
      specialInstructions: detailSpecialInstructions,
    });

    toast(`Added ${selectedItem.name} to cart`, 'success');
    setSelectedItem(null);
  };

  // Request SMS/OTP confirmation modal
  const handleCheckoutTrigger = () => {
    if (cartItems.length === 0) return;
    setIsOtpModalOpen(true);
  };

  const handleSendOtp = () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      toast('Please enter a valid mobile number', 'error');
      return;
    }
    setOtpSent(true);
    toast('Demo OTP sent! Type 1234 to verify.', 'info');
  };

  // Complete authenticated checkouts
  const handleVerifyOtpAndPlaceOrder = async () => {
    if (otpCode !== '1234') {
      toast('Incorrect verification code. Use dummy code 1234.', 'error');
      return;
    }

    setIsPlacingOrder(true);
    setFailedOrderDetails([]);

    try {
      const payload = {
        items: cartItems.map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          selectedAddOns: item.selectedAddOns.map((addon) => ({
            name: addon.name,
            priceDelta: addon.priceDelta,
          })),
          specialInstructions: item.specialInstructions || '',
        })),
        customerNote: customerNote.trim() || undefined,
        customerPhone: phoneNumber.trim(),
        paymentStatus: 'PENDING',
      };

      const res = await apiClient.post(
        `/public/restaurants/${restaurantSlug}/tables/${tableToken}/orders`,
        payload
      );

      if (res.data.success) {
        toast('Order verified and placed successfully!', 'success');

        // Save order ID to localStorage
        const key = `pixora_orders_${restaurantSlug}_${tableToken}`;
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        stored.push(res.data.data._id);
        localStorage.setItem(key, JSON.stringify(stored));
        setRecentOrderIds(stored);

        clearCart();
        setIsCartSheetOpen(false);
        setIsOtpModalOpen(false);
        setCustomerNote('');
        setPhoneNumber('');
        setOtpCode('');
        setOtpSent(false);
        navigate(`/r/${restaurantSlug}/t/${tableToken}/order/${res.data.data._id}`);
      }
    } catch (err: any) {
      console.error('Order placement error:', err);
      const errResponse = err.response?.data?.error;
      if (errResponse && errResponse.code === 'ITEMS_UNAVAILABLE') {
        const failed = errResponse.details || [];
        setFailedOrderDetails(failed);
        setIsOtpModalOpen(false);
        toast('Some items in your basket are no longer available. Please review.', 'error');
      } else {
        toast(errResponse?.message || 'Failed to place order. Please try again.', 'error');
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Trigger public waiter assistance request
  const handleCallWaiterConfirm = async () => {
    setIsWaiterConfirmOpen(false);
    setWaiterCallState('pulsing');

    try {
      await apiClient.post(`/public/tables/${tableToken}/waiter-call`, {
        requestType: selectedRequestType,
      });
      toast('Call successfully dispatched to staff operations board.', 'success');

      setTimeout(() => {
        setWaiterCallState('waiting');
      }, 2400);
    } catch (err: any) {
      console.error(err);
      toast('Failed to alert floor staff. Please retry.', 'error');
      setWaiterCallState('idle');
    }
  };

  // Auto badge helpers based on item pricing/names for visual fidelity
  const getItemBadge = (item: MenuItem, idx: number) => {
    if (idx % 5 === 0) return 'Chef Special';
    if (idx % 7 === 0) return 'Best Seller';
    if (item.price > 35000) return 'Recommended';
    if (idx % 4 === 0) return 'New';
    return null;
  };

  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Mock Google reviews details
  const mockReviews = [
    { author: 'Rahul Sharma', text: 'Incredibly fast checkout and the sourdough pizzas are to die for! Madras coffee on tap is spectacular.', rating: 5 },
    { author: 'Neha Gupta', text: 'Brilliant QR menu design. Tapping Call Waiter brings tissues in seconds. Exceptional service.', rating: 5 },
    { author: 'David K.', text: 'A clean, modern platform. Love the veggie filters and modifier options on sliders.', rating: 5 },
  ];

  return (
    <div style={cssVariables} className="min-h-screen bg-slate-50 font-sans antialiased pb-28 relative">

      {/* ==================== SCREEN WRAPPERS ==================== */}

      {/* -------------------- 1. LANDING TAB -------------------- */}
      {activeTab === 'landing' && (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Cover Header */}
          <div className="relative w-full h-64 overflow-hidden bg-slate-900 text-white flex flex-col justify-end p-6">
            {restaurant.coverImageUrl && (
              <img
                src={restaurant.coverImageUrl}
                alt={restaurant.name}
                className="absolute inset-0 w-full h-full object-cover opacity-45"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent" />

            <div className="relative flex items-center gap-4">
              {restaurant.logoUrl ? (
                <img
                  src={restaurant.logoUrl}
                  alt={restaurant.name}
                  className="w-16 h-16 object-contain rounded-2xl bg-white p-1 shadow"
                />
              ) : (
                <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center font-bold font-display text-3xl text-slate-950 shadow">
                  {restaurant.name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="font-display tracking-tight text-3xl font-semibold leading-tight">
                  {restaurant.name}
                </h1>
                <p className="text-xs text-amber-400 font-semibold flex items-center gap-1.5 mt-0.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Open for dine-in & checkout</span>
                </p>
              </div>
            </div>
          </div>

          <div className="max-w-md mx-auto px-4 space-y-6 pb-6">
            {/* Active Table spot info */}
            <div className="bg-white rounded-3xl p-5 border border-slate-150 shadow-sm space-y-3 animate-fade-in">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-mono">
                Active Dining Station
              </span>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg text-slate-900 leading-none">{table.displayName}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-1">Token validation active</p>
                </div>
                <span className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 font-bold font-mono">
                  #{table.tableNumber}
                </span>
              </div>
            </div>

            {/* Track Orders Banner */}
            {recentOrderIds.length > 0 && (
              <div className="bg-amber-50 border border-amber-200/65 rounded-3xl p-5 flex items-center justify-between shadow-sm animate-fade-in gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
                    <Clock className="w-5 h-5 animate-pulse" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">Track Placed Orders</h4>
                    <p className="text-[10px] text-slate-500 font-medium">You have {recentOrderIds.length} order{recentOrderIds.length > 1 ? 's' : ''} placed at this table.</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/r/${restaurantSlug}/t/${tableToken}/order/${recentOrderIds[recentOrderIds.length - 1]}`)}
                  className="px-3.5 py-2 bg-slate-950 hover:bg-slate-900 text-white font-extrabold text-[10px] rounded-xl flex items-center gap-1 transition shadow-sm shrink-0 whitespace-nowrap"
                >
                  <span>Track Status</span>
                  <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              </div>
            )}

            {/* Prompt CTA to explore */}
            <button
              onClick={() => setActiveTab('menu')}
              className="w-full py-4 bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-sm rounded-2xl transition flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-[0.99]"
            >
              <span>Explore Menu & Order</span>
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </button>

            {/* Description */}
            <div className="bg-white rounded-3xl p-5 border border-slate-150 shadow-sm space-y-2">
              <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block font-mono border-b border-slate-50 pb-1.5">
                About Restaurant
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed font-sans pt-1">
                {restaurant.description || 'Welcome to Demo Cafe! We serve gourmet delicacies, refreshing tonics, and hot baked furnace sourdoughs.'}
              </p>
            </div>

            {/* Operational Info */}
            <div className="bg-white rounded-3xl p-5 border border-slate-150 shadow-sm space-y-4">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-mono border-b border-slate-50 pb-2">
                Dine-In Information
              </span>
              <div className="space-y-3.5 text-xs text-slate-600">
                {restaurant.timings && (
                  <div className="flex items-center gap-3">
                    <Clock className="w-4.5 h-4.5 text-slate-400 shrink-0" strokeWidth={1.75} />
                    <span>Dine-In Hours: <strong className="text-slate-800">{restaurant.timings.open} - {restaurant.timings.close}</strong></span>
                  </div>
                )}
                {restaurant.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" strokeWidth={1.75} />
                    <span className="leading-relaxed">Address: <strong className="text-slate-800">{restaurant.address}</strong></span>
                  </div>
                )}
                {restaurant.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4.5 h-4.5 text-slate-400 shrink-0" strokeWidth={1.75} />
                    <span>Contact Service: <strong className="text-slate-800">{restaurant.phone}</strong></span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Methods */}
            {restaurant.paymentMethods && (
              <div className="bg-white rounded-3xl p-5 border border-slate-150 shadow-sm space-y-3.5">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-mono border-b border-slate-50 pb-2">
                  Supported Payments
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {restaurant.paymentMethods.cash && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-100">
                      <CreditCard className="w-3.5 h-3.5" strokeWidth={2} />
                      Cash
                    </span>
                  )}
                  {restaurant.paymentMethods.card && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100">
                      <CreditCard className="w-3.5 h-3.5" strokeWidth={2} />
                      Cards
                    </span>
                  )}
                  {restaurant.paymentMethods.upi && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-100">
                      ⚡ UPI
                    </span>
                  )}
                  {restaurant.paymentMethods.razorpay && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-100">
                      🛡️ Razorpay
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Quick Gourmet Jumps */}
            {rawCategories.length > 0 && (
              <div className="bg-white rounded-3xl p-5 border border-slate-150 shadow-sm space-y-3.5">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-mono border-b border-slate-50 pb-2">
                  Popular Categories
                </span>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {rawCategories.slice(0, 4).map((cat) => (
                    <button
                      key={cat._id}
                      onClick={() => {
                        setActiveTab('menu');
                        setTimeout(() => {
                          handleCategoryClick(cat._id);
                        }, 250);
                      }}
                      className="p-3 text-left bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-150 flex items-center justify-between transition-colors group"
                    >
                      <span className="font-bold text-xs text-slate-700 truncate">{cat.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" strokeWidth={2.5} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* -------------------- 2. MENU TAB -------------------- */}
      {activeTab === 'menu' && (
        <motion.div
          key="menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Integrated Search & Filter Controls */}
          <div className="max-w-md mx-auto px-4 pt-4 space-y-3">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" strokeWidth={1.75} />
              <input
                type="text"
                placeholder="Search dishes, drinks, pizzas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-white rounded-2xl border border-slate-150 shadow-sm focus:outline-none focus:border-slate-400 transition-all text-sm placeholder:text-slate-400 text-slate-800 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                </button>
              )}
            </div>

            <div className="flex gap-2.5 items-center justify-between">
              {/* Diet filter group */}
              <div className="flex gap-1">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'veg', label: 'Veg' },
                  { key: 'nonveg', label: 'Non-Veg' },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setDietFilter(opt.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      dietFilter === opt.key
                        ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                        : 'bg-white border-slate-150 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Price Sort Dropdown */}
              <select
                value={priceSort}
                onChange={(e) => setPriceSort(e.target.value as any)}
                className="border border-slate-150 rounded-xl px-2.5 py-1.5 bg-white focus:outline-none font-bold text-xs text-slate-600"
              >
                <option value="default">Sort Price</option>
                <option value="low-high">Low to High</option>
                <option value="high-low">High to Low</option>
              </select>
            </div>
          </div>

          {/* Track Orders Banner */}
          {recentOrderIds.length > 0 && (
            <div className="max-w-md mx-auto px-4">
              <div className="bg-amber-50 border border-amber-200/65 rounded-3xl p-4 flex items-center justify-between shadow-sm animate-fade-in gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                    <Clock className="w-5 h-5 animate-pulse" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">Track Placed Orders</h4>
                    <p className="text-[10px] text-slate-500 font-medium">You have {recentOrderIds.length} order{recentOrderIds.length > 1 ? 's' : ''} placed at this table.</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/r/${restaurantSlug}/t/${tableToken}/order/${recentOrderIds[recentOrderIds.length - 1]}`)}
                  className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-white font-extrabold text-[10px] rounded-xl flex items-center gap-1 transition shadow-sm shrink-0 whitespace-nowrap"
                >
                  <span>Track Status</span>
                  <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* Horizontal category sub nav */}
          {filteredCategories.length > 0 && (
            <div className="sticky top-0 z-20 py-2.5 bg-slate-50/90 backdrop-blur-md border-b border-slate-150">
              <div
                ref={categoryNavRef}
                className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth px-4"
              >
                {filteredCategories.map((category) => {
                  const isActive = activeCategoryId === category._id;
                  return (
                    <button
                      key={category._id}
                      ref={isActive ? activePillRef : null}
                      onClick={() => handleCategoryClick(category._id)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap tracking-wide transition-all ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-white text-slate-600 border border-slate-150 hover:bg-slate-50'
                      }`}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="max-w-md mx-auto px-4 space-y-8">
            {isMenuLoading ? (
              <MenuSkeleton />
            ) : filteredCategories.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-150 p-8 space-y-3">
                <SearchIcon className="w-10 h-10 text-slate-300 mx-auto animate-pulse" strokeWidth={1.75} />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-800">No matching dishes found</h3>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">Try adjusting your query or choosing another dietary filter.</p>
                </div>
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setDietFilter('all');
                      setPriceSort('default');
                    }}
                    className="mt-2 text-xs font-bold text-amber-600 hover:underline"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {filteredCategories.map((category) => (
                  <section
                    key={category._id}
                    id={`category-section-${category._id}`}
                    data-category-section={category._id}
                    className="space-y-4 pt-2 scroll-mt-24"
                  >
                    <h3 className="font-display text-2xl font-normal text-slate-900 tracking-tight pl-1 border-l-2 border-amber-500">
                      {category.name}
                    </h3>

                    <div className="grid grid-cols-1 gap-4">
                      {category.menuItems.map((item, idx) => {
                        const badge = getItemBadge(item, idx);
                        return (
                          <div
                            key={item._id}
                            onClick={() => handleItemCardClick(item)}
                            className={`flex gap-4 p-4 bg-white rounded-3xl border transition-all ${
                              item.isAvailable
                                ? 'border-slate-150 hover:border-slate-300 shadow-sm cursor-pointer active:scale-[0.99]'
                                : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                            }`}
                          >
                            {/* Image with featured badges */}
                            <div className="w-20 h-20 bg-slate-100 rounded-2xl overflow-hidden shrink-0 relative">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">
                                  <Sparkles className="w-5 h-5 opacity-40" strokeWidth={1.75} />
                                </div>
                              )}
                              {badge && item.isAvailable && (
                                <div className="absolute top-1 left-1">
                                  <span className="text-[8px] font-bold text-white uppercase tracking-wider px-1.5 py-0.5 bg-slate-950/85 rounded-full backdrop-blur-sm">
                                    {badge}
                                  </span>
                                </div>
                              )}
                              {!item.isAvailable && (
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
                                  <span className="text-[9px] font-bold text-white uppercase tracking-wider px-1.5 py-0.5 bg-black/60 rounded">
                                    Sold Out
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Details */}
                            <div className="flex-1 flex flex-col justify-between py-0.5">
                              <div className="space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-sm font-bold text-slate-900 line-clamp-1">
                                    {item.name}
                                  </h4>
                                  <div className="flex gap-1 shrink-0">
                                    {item.isVegetarian && <MenuBadge variant="veg" />}
                                    {item.isSpicy && <MenuBadge variant="spicy" />}
                                  </div>
                                </div>
                                {item.description && (
                                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-2.5">
                                <span className="text-sm font-extrabold text-slate-900 font-mono">
                                  {formatPrice(item.price, currency)}
                                </span>
                                {item.isAvailable ? (
                                  <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1 rounded-xl transition-colors font-sans uppercase tracking-wider">
                                    Add
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-slate-400">
                                    Sold Out
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* -------------------- 4. CALL WAITER TAB -------------------- */}
      {activeTab === 'waiter' && (
        <motion.div
          key="waiter"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto px-4 py-4 space-y-6 flex flex-col"
        >
          <div className="text-center space-y-1">
            <h3 className="font-display text-3xl font-semibold text-slate-900">How can we help you?</h3>
            <p className="text-xs text-slate-500">Select an assistance request type to notify the server staff.</p>
          </div>

          <div className="grid grid-cols-2 gap-3.5 pt-4">
            {([
              { key: 'CALL_WAITER', label: 'Call Server Waiter' },
              { key: 'REQUEST_BILL', label: 'Request the Bill' },
              { key: 'WATER', label: 'Bring Drinking Water' },
              { key: 'TISSUE', label: 'Bring Tissue Paper' },
              { key: 'OTHER', label: 'Other Requests' },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setSelectedRequestType(t.key)}
                className={`p-4 rounded-2xl border text-center font-bold text-xs transition flex flex-col items-center justify-center gap-2 shadow-sm ${
                  selectedRequestType === t.key
                    ? 'bg-slate-950 border-slate-950 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="text-base leading-none">🛎️</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {waiterCallState === 'idle' && (
            <button
              onClick={() => setIsWaiterConfirmOpen(true)}
              className="w-full py-4 mt-6 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm rounded-2xl transition flex items-center justify-center gap-2 shadow-md"
            >
              <BellRing className="w-5 h-5 animate-bounce" strokeWidth={1.75} />
              <span>Dispatch Assistance Alert</span>
            </button>
          )}

          {waiterCallState === 'pulsing' && (
            <button
              disabled
              className="w-full py-4 mt-6 bg-amber-100 text-amber-800 text-sm font-semibold rounded-2xl cursor-not-allowed select-none flex items-center justify-center gap-2"
            >
              <Loader className="w-4 h-4 animate-spin text-amber-600" />
              <span>Contacting operations...</span>
            </button>
          )}

          {waiterCallState === 'waiting' && (
            <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-150 text-emerald-800 text-center space-y-2 mt-6">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" strokeWidth={2.2} />
              <div className="space-y-0.5">
                <h4 className="font-bold text-sm">Assistance Alert Active</h4>
                <p className="text-xs text-emerald-600 leading-normal">
                  Staff operations board has been notified. A server is heading to your spot.
                </p>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* -------------------- 5. REVIEWS TAB -------------------- */}
      {activeTab === 'reviews' && (
        <motion.div
          key="reviews"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto px-4 py-4 space-y-6 overflow-x-hidden"
        >
          <div className="text-center space-y-1">
            <h3 className="font-display text-3xl font-semibold text-slate-900">What Our Guests Say</h3>
            <p className="text-xs text-slate-500">Verified platform testimonials from our guests.</p>
          </div>

          {/* Ratings Overview Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-150 shadow-sm space-y-4">
            <div className="flex items-center gap-4">
              <div className="text-center bg-amber-50/50 border border-amber-100 p-4 rounded-2xl shrink-0">
                <span className="text-3xl font-black text-slate-900 block font-mono leading-none">4.9</span>
                <div className="flex gap-0.5 text-amber-500 justify-center mt-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-current" strokeWidth={1.5} />
                  ))}
                </div>
                <span className="text-[9px] text-slate-400 font-semibold block mt-1 font-mono">148 reviews</span>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="w-2 font-bold font-mono text-slate-400">5</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: '92%' }} />
                  </div>
                  <span className="w-6 text-right font-bold text-slate-400 font-mono">92%</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="w-2 font-bold font-mono text-slate-400">4</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: '6%' }} />
                  </div>
                  <span className="w-6 text-right font-bold text-slate-400 font-mono">6%</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="w-2 font-bold font-mono text-slate-400">3</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: '2%' }} />
                  </div>
                  <span className="w-6 text-right font-bold text-slate-400 font-mono">2%</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-2.5 flex items-center justify-center gap-1.5 border border-slate-100">
              <span className="text-xs">🛡️</span>
              <span className="text-[10px] text-slate-500 font-bold leading-relaxed text-center">
                100% Authentic Dine-In Feedback verified via platform checkout.
              </span>
            </div>
          </div>

          <div className="w-full overflow-hidden">
            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-4 pb-4 px-1 pt-1">
              {mockReviews.map((rev, idx) => {
                const colors = [
                  'bg-amber-100 text-amber-800',
                  'bg-indigo-100 text-indigo-800',
                  'bg-emerald-100 text-emerald-800',
                  'bg-rose-100 text-rose-800',
                ];
                const avatarColor = colors[idx % colors.length];
                return (
                  <div
                    key={idx}
                    className="snap-center shrink-0 w-[85%] bg-white rounded-3xl p-5 border border-slate-150 shadow-sm space-y-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${avatarColor}`}>
                        {rev.author.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-slate-900 text-xs block truncate">{rev.author}</span>
                        <div className="flex gap-0.5 text-amber-500 mt-0.5">
                          {Array.from({ length: rev.rating }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-current" strokeWidth={1.5} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed italic font-sans min-h-[48px]">
                      "{rev.text}"
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <a
            href={restaurant.googleReviewUrl || `https://www.google.com/search?q=${encodeURIComponent(restaurant.name + ' reviews')}`}
            target="_blank"
            rel="noreferrer"
            className="w-full py-4 bg-white border-2 border-slate-950 text-slate-950 hover:bg-slate-50 font-extrabold text-sm rounded-2xl transition flex items-center justify-center gap-2 shadow-sm text-center"
          >
            <MessageSquare className="w-5 h-5 text-amber-500 fill-current" strokeWidth={1.75} />
            <span>Submit Google Review</span>
          </a>
        </motion.div>
      )}

      {/* ==========================================
          FLOATING CART BAR
          ========================================== */}
      <AnimatePresence>
        {cartItems.length > 0 && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed bottom-20 left-4 right-4 z-30 max-w-md mx-auto"
          >
            <button
              onClick={() => setIsCartSheetOpen(true)}
              className="w-full bg-slate-950 hover:bg-slate-900 text-white py-3.5 px-5 rounded-2xl font-bold text-sm tracking-wide transition-all shadow-xl flex items-center justify-between border border-slate-800 active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <span className="bg-amber-500 text-slate-950 font-black font-mono text-xs px-2.5 py-0.5 rounded-full flex items-center justify-center">
                  {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
                <span className="font-sans">View Basket</span>
              </div>
              <span className="font-mono font-black">{formatPrice(cartSubtotal, currency)}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==========================================
          UNIFIED BOTTOM NAVIGATION (STICKY FIXED)
          ========================================== */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-150 flex items-center justify-around px-4 pb-safe z-40 shadow-lg select-none">

        {/* Landing */}
        <button
          onClick={() => setActiveTab('landing')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${
            activeTab === 'landing' ? 'text-slate-950 font-black' : 'text-slate-400 font-semibold'
          }`}
        >
          <Compass className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] leading-none">Home</span>
        </button>

        {/* Menu & Search */}
        <button
          onClick={() => setActiveTab('menu')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${
            activeTab === 'menu' ? 'text-slate-950 font-black' : 'text-slate-400 font-semibold'
          }`}
        >
          <Sparkles className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] leading-none">Menu & Search</span>
        </button>

        {/* Call Waiter */}
        <button
          onClick={() => setActiveTab('waiter')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full relative transition-all ${
            activeTab === 'waiter' ? 'text-slate-950 font-black' : 'text-slate-400 font-semibold'
          }`}
        >
          <BellRing className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] leading-none">Assistance</span>
          {waiterCallState === 'waiting' && (
            <span className="absolute top-2 right-1/4 h-2 w-2 bg-amber-500 rounded-full animate-ping" />
          )}
        </button>

        {/* Reviews */}
        <button
          onClick={() => setActiveTab('reviews')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${
            activeTab === 'reviews' ? 'text-slate-950 font-black' : 'text-slate-400 font-semibold'
          }`}
        >
          <Star className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] leading-none">Reviews</span>
        </button>

      </nav>

      {/* ==========================================
          WAITER ASSISTANCE CONFIRM MODAL
          ========================================== */}
      <ConfirmModal
        isOpen={isWaiterConfirmOpen}
        title="Confirm Assistance Call?"
        message={`Would you like to request "${selectedRequestType.replace('_', ' ').toLowerCase()}" for Table ${table.tableNumber}?`}
        confirmText="Confirm Request"
        cancelText="Cancel"
        onConfirm={handleCallWaiterConfirm}
        onCancel={() => setIsWaiterConfirmOpen(false)}
      />

      {/* ==========================================
          CLEAR CART CONFIRM MODAL
          ========================================== */}
      <ConfirmModal
        isOpen={isClearCartModalOpen}
        title="Clear Basket?"
        message="Remove all items from your review list?"
        confirmText="Clear Basket"
        cancelText="Keep Items"
        onConfirm={() => {
          clearCart();
          setIsClearCartModalOpen(false);
          setIsCartSheetOpen(false);
          toast('Basket cleared', 'info');
        }}
        onCancel={() => setIsClearCartModalOpen(false)}
      />

      {/* ==========================================
          ITEM DETAIL BOTTOM SHEET
          ========================================== */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setSelectedItem(null)}
            />

            {/* Bottom Drawer Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 24, stiffness: 240 }}
              className="relative bg-white w-full max-w-xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto font-sans flex flex-col"
            >
              <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 shrink-0" />

              <button
                onClick={() => setSelectedItem(null)}
                className="absolute right-4 top-4 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full text-slate-500 hover:text-slate-700 z-10"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>

              <div className="flex-1 overflow-y-auto p-5 pb-8 space-y-6">
                <div className="w-full h-56 bg-slate-50 rounded-2xl overflow-hidden relative border border-slate-100">
                  {selectedItem.imageUrl ? (
                    <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                      <Sparkles className="w-12 h-12" strokeWidth={1} />
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 flex gap-1.5">
                    {selectedItem.isVegetarian && <MenuBadge variant="veg" />}
                    {selectedItem.isSpicy && <MenuBadge variant="spicy" />}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-display text-3xl font-normal text-slate-900 leading-tight">{selectedItem.name}</h3>
                  {selectedItem.description && <p className="text-slate-500 text-sm leading-relaxed">{selectedItem.description}</p>}
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-slate-900">{formatPrice(selectedItem.price, currency)}</span>
                    {selectedItem.prepTimeMinutes && <span className="text-xs text-slate-400 font-medium">• {selectedItem.prepTimeMinutes} mins prep</span>}
                  </div>
                </div>

                {/* Add-Ons Customizations */}
                {selectedItem.addOns && selectedItem.addOns.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-950 uppercase tracking-wide">Customize Item</h4>
                    <div className="space-y-2.5">
                      {selectedItem.addOns.map((addOn) => {
                        const isChecked = detailSelectedAddOns.some((x) => x.name === addOn.name);
                        return (
                          <label
                            key={addOn.name}
                            className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                              isChecked
                                ? 'bg-amber-50/50 border-[var(--theme-accent)]/40 text-slate-950'
                                : 'border-slate-150 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleAddOnToggle(addOn)}
                                className="w-4.5 h-4.5 accent-[var(--theme-accent)] rounded border-slate-300"
                              />
                              <span className="text-sm font-semibold">{addOn.name}</span>
                            </div>
                            <span className="text-sm font-bold">+ {formatPrice(addOn.priceDelta, currency)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Cooking instructions */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-950 uppercase tracking-wide">Special Cooking Instructions</h4>
                  <textarea
                    rows={2}
                    placeholder="E.g., Extra hot, sugar-free, less ice..."
                    value={detailSpecialInstructions}
                    onChange={(e) => setDetailSpecialInstructions(e.target.value)}
                    className="w-full p-3.5 border border-slate-150 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/30 focus:border-[var(--theme-accent)] text-sm placeholder:text-slate-400"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                  <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1 shrink-0">
                    <button
                      onClick={() => setDetailQuantity((q) => Math.max(1, q - 1))}
                      className="p-2 text-slate-600 hover:text-slate-800 transition-colors rounded-lg hover:bg-white active:scale-95"
                    >
                      <Minus className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                    <span className="px-4 font-bold text-slate-900 text-sm font-mono w-8 text-center">{detailQuantity}</span>
                    <button
                      onClick={() => setDetailQuantity((q) => q + 1)}
                      className="p-2 text-slate-600 hover:text-slate-800 transition-colors rounded-lg hover:bg-white active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                  </div>

                  <button
                    onClick={handleAddToCart}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide transition-colors flex items-center justify-between shadow-md"
                  >
                    <span>Add to Cart</span>
                    <span>
                      {formatPrice(
                        (selectedItem.price +
                          detailSelectedAddOns.reduce((sum, x) => sum + x.priceDelta, 0)) *
                          detailQuantity,
                        currency
                      )}
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          CART VIEW DRAWER/SHEET
          ========================================== */}
      <AnimatePresence>
        {isCartSheetOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsCartSheetOpen(false)}
            />

            {/* Cart Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 24, stiffness: 240 }}
              className="relative bg-white w-full max-w-xl rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto font-sans flex flex-col"
            >
              <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 shrink-0" />

              <button
                onClick={() => setIsCartSheetOpen(false)}
                className="absolute right-4 top-4 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full text-slate-500 hover:text-slate-700 z-10"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>

              <div className="flex-1 overflow-y-auto p-5 pb-8 flex flex-col justify-between h-full space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-display text-3xl font-normal text-slate-900 tracking-tight">Your Basket</h3>
                    <button
                      onClick={() => setIsClearCartModalOpen(true)}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Clear Basket
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 space-y-3">
                    {cartItems.map((item, _idx) => {
                      const failedCheck = failedOrderDetails.find((f) => f.menuItemId === item.itemId);
                      const isFailed = !!failedCheck;

                      return (
                        <div
                          key={_idx}
                          className={`flex gap-4 py-3 first:pt-0 rounded-xl transition-all ${
                            isFailed ? 'bg-red-50/50 p-3 border border-red-200/50' : ''
                          }`}
                        >
                          <div className="flex-1 space-y-1">
                            <h4 className="text-sm font-bold text-slate-900 leading-snug">{item.name}</h4>
                            {item.selectedAddOns.length > 0 && (
                              <p className="text-[11px] text-slate-500">+ {item.selectedAddOns.map((x) => x.name).join(', ')}</p>
                            )}
                            {item.specialInstructions && (
                              <p className="text-[11px] text-amber-600 bg-amber-50/50 rounded-lg px-2 py-1 inline-block italic font-medium">
                                Note: "{item.specialInstructions}"
                              </p>
                            )}
                            {isFailed && <p className="text-[11px] font-bold text-red-600 mt-1">⚠️ Menu item unavailable.</p>}
                            <p className="text-xs font-bold text-slate-800">{formatPrice(item.price, currency)} each</p>
                          </div>

                          <div className="flex flex-col items-end justify-between shrink-0">
                            <span className="text-sm font-black text-slate-900 font-mono">{formatPrice(item.price * item.quantity, currency)}</span>
                            <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-0.5 mt-2">
                              <button
                                onClick={() => updateQuantity(item.itemId, item.selectedAddOns, item.specialInstructions || '', -1)}
                                className="p-1 text-slate-500 hover:text-slate-800 transition-colors rounded-lg hover:bg-white active:scale-95"
                              >
                                <Minus className="w-3.5 h-3.5" strokeWidth={2} />
                              </button>
                              <span className="px-2 font-bold text-slate-900 text-xs font-mono w-6 text-center">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.itemId, item.selectedAddOns, item.specialInstructions || '', 1)}
                                className="p-1 text-slate-500 hover:text-slate-800 transition-colors rounded-lg hover:bg-white active:scale-95"
                              >
                                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-950 uppercase tracking-wide">Kitchen Cooking Notes</label>
                    <textarea
                      rows={2}
                      placeholder="Add a special note..."
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      className="w-full p-3 border border-slate-150 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/30 focus:border-[var(--theme-accent)] text-xs placeholder:text-slate-400"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium text-sm">Basket Subtotal</span>
                    <span className="text-xl font-black text-slate-900 font-mono">{formatPrice(cartSubtotal, currency)}</span>
                  </div>

                  <button
                    onClick={handleCheckoutTrigger}
                    disabled={cartItems.length === 0}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md active:scale-[0.99]"
                  >
                    Confirm & Proceed
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MOBILE NUMBER AND OTP CHECKOUT DIALOG
          ========================================== */}
      <AnimatePresence>
        {isOtpModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsOtpModalOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-6 font-sans"
            >
              <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                <h3 className="font-display text-2xl font-bold text-slate-900 flex items-center gap-1.5">
                  <Lock className="w-5 h-5 text-amber-500" strokeWidth={2} />
                  <span>Verify Checkout</span>
                </h3>
                <button
                  onClick={() => setIsOtpModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" strokeWidth={1.75} />
                </button>
              </div>

              {!otpSent ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 leading-normal">
                    Enter your mobile number to complete authentication and place your secure kitchen order.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-mono">Mobile Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={2} />
                      <input
                        type="tel"
                        placeholder="E.g., +91 98765 43210"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleSendOtp}
                    className="w-full py-3.5 bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition"
                  >
                    Send Verification SMS
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 leading-normal">
                    Enter the 4-digit verification code sent to <strong>{phoneNumber}</strong>.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-mono">OTP Code</label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="Enter 1234"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-center text-lg font-black font-mono tracking-widest focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOtpSent(false)}
                      className="w-1/3 py-3 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleVerifyOtpAndPlaceOrder}
                      disabled={isPlacingOrder || otpCode.length < 4}
                      className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 text-slate-950 font-black text-xs rounded-xl transition shadow flex items-center justify-center gap-1"
                    >
                      {isPlacingOrder && <Loader className="w-4 h-4 animate-spin" />}
                      <span>Verify & Place Order</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl border border-slate-100 space-y-6 text-center font-sans"
          >
            <div className="space-y-2">
              <h3 className="font-display text-2xl font-normal text-slate-900">{title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{message}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition shadow-sm"
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PublicTable;
