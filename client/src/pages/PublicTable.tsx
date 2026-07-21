import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
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
  ShoppingCart,
  BellRing,
  CheckCircle2,
} from 'lucide-react';
import { publicService, PublicCategory, MenuItem, AddOn } from '../services/restaurant.service';
import { useCartStore } from '../store/useCartStore';
import { useToast } from '../hooks/useToast';

// ==========================================
// HELPERS
// ==========================================

const formatPrice = (amountInPaise: number, currency: string) => {
  const amount = amountInPaise / 100;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 2,
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
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors shadow-sm"
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

// ==========================================
// MAIN COMPONENT
// ==========================================

export const PublicTable: React.FC = () => {
  const { restaurantSlug, tableToken } = useParams<{ restaurantSlug: string; tableToken: string }>();
  const { toast } = useToast();

  // Zustand Cart Store
  const { items: cartItems, setTable, addItem, updateQuantity, clearCart } = useCartStore();

  // Component States
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isWaiterModalOpen, setIsWaiterModalOpen] = useState(false);
  const [isClearCartModalOpen, setIsClearCartModalOpen] = useState(false);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);

  // Bottom Sheet States for Item Detail
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [detailSelectedAddOns, setDetailSelectedAddOns] = useState<AddOn[]>([]);
  const [detailSpecialInstructions, setDetailSpecialInstructions] = useState('');

  // Ghost flying animation coordinates
  const [ghosts, setGhosts] = useState<{ id: string; x: number; y: number }[]>([]);

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
    const handleScroll = () => {
      if (isScrollingRef.current) return;

      const categoryElements = document.querySelectorAll('[data-category-section]');
      let currentActiveId = '';

      for (let i = 0; i < categoryElements.length; i++) {
        const el = categoryElements[i] as HTMLElement;
        const rect = el.getBoundingClientRect();
        // Section is active if its header is close to the top of screen
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
  }, [activeCategoryId]);

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
          <div className="border-t border-slate-50 pt-4 text-xs text-slate-400">
            Error Code: <span className="font-mono">TABLE_NOT_FOUND</span>
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

  // Filter menu data based on debounced search query
  const rawCategories: PublicCategory[] = menuData?.success ? menuData.data : [];

  const filteredCategories = rawCategories
    .map((category) => {
      const matchedItems = category.menuItems.filter((item) =>
        item.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      );
      return {
        ...category,
        menuItems: matchedItems,
      };
    })
    .filter((category) => category.menuItems.length > 0);

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
      // Release scroll-spy suppression after animation finishes (~600ms)
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 600);
    }
  };

  // Open item bottom sheet
  const handleItemCardClick = (item: MenuItem) => {
    if (!item.isAvailable) return; // Unavailable items cannot open bottom sheet
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

  // Flying Ghost animation trigger (non-gating)
  const triggerFlyingGhost = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ghostId = Math.random().toString(36).substring(2, 9);
    setGhosts((prev) => [...prev, { id: ghostId, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }]);
    setTimeout(() => {
      setGhosts((prev) => prev.filter((g) => g.id !== ghostId));
    }, 700);
  };

  // Perform add to cart
  const handleAddToCart = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!selectedItem) return;

    triggerFlyingGhost(e);

    // Immediate state update
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

  // Call Waiter confirm
  const handleCallWaiterConfirm = () => {
    setIsWaiterModalOpen(false);
    // Phase 7 TODO: Emit "waiter_call" socket event / database mutation
    toast('Calling waiter... Staff has been notified.', 'info');
  };

  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartTotalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div style={cssVariables} className="min-h-screen bg-slate-50 font-sans antialiased pb-28">
      {/* ==========================================
          HEADER
          ========================================== */}
      <header className="relative w-full overflow-hidden bg-[var(--theme-primary)] text-[var(--theme-secondary)] py-10 px-6 shadow-sm">
        {restaurant.coverImageUrl && (
          <div
            className="absolute inset-0 opacity-25 bg-cover bg-center"
            style={{ backgroundImage: `url(${restaurant.coverImageUrl})` }}
          />
        )}
        <div className="relative max-w-xl mx-auto flex flex-col items-center text-center space-y-4">
          {restaurant.logoUrl ? (
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              className="w-20 h-20 object-contain rounded-2xl shadow-md border border-[var(--theme-secondary)]/10 bg-white/10 p-1"
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
              <p className="text-xs opacity-85 max-w-xs">{restaurant.description}</p>
            )}
          </div>
        </div>
      </header>

      {/* ==========================================
          DYNAMIC TABLE BANNER
          ========================================== */}
      <div className="max-w-xl mx-auto px-4 -mt-4 relative z-10">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center text-[var(--theme-accent)]">
              <CheckCircle2 className="w-5 h-5 animate-pulse" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{table.displayName}</h2>
              <p className="text-[11px] text-slate-500 font-mono">Table Code: {table.tableNumber}</p>
            </div>
          </div>
          {/* Waiter call */}
          <button
            onClick={() => setIsWaiterModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 text-[var(--theme-accent)] hover:bg-amber-100/70 text-xs font-semibold tracking-wide transition-colors"
          >
            <BellRing className="w-4 h-4 animate-bounce" strokeWidth={1.75} />
            Call Waiter
          </button>
        </div>
      </div>

      {/* ==========================================
          SEARCH BAR
          ========================================== */}
      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search our delicious menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white rounded-2xl border border-slate-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/30 focus:border-[var(--theme-accent)] transition-all text-sm placeholder:text-slate-400 text-slate-800 font-medium"
          />
        </div>

        {/* ==========================================
            STICKY CATEGORY NAV
            ========================================== */}
        {isMenuLoading ? (
          <MenuSkeleton />
        ) : filteredCategories.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 p-8 space-y-3">
            <HelpCirclePlaceholder className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">No items found</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              We couldn't find any menu items matching "{searchQuery}". Try searching for something else.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Sticky categories horizontal navigation */}
            <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-slate-50/90 backdrop-blur-md border-b border-slate-100">
              <div
                ref={categoryNavRef}
                className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth"
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

            {/* ==========================================
                MENU ITEM LIST GROUPED
                ========================================== */}
            <div className="space-y-10">
              {filteredCategories.map((category) => (
                <section
                  key={category._id}
                  id={`category-section-${category._id}`}
                  data-category-section={category._id}
                  className="space-y-4 pt-4 scroll-mt-24"
                >
                  <div className="space-y-0.5">
                    <h3 className="font-display text-2xl font-normal text-slate-900 tracking-tight">
                      {category.name}
                    </h3>
                    {category.description && (
                      <p className="text-xs text-slate-500">{category.description}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {category.menuItems.map((item) => (
                      <div
                        key={item._id}
                        onClick={() => handleItemCardClick(item)}
                        className={`flex gap-4 p-4 bg-white rounded-2xl border transition-all ${
                          item.isAvailable
                            ? 'border-slate-150 hover:border-slate-300 shadow-sm cursor-pointer active:scale-[0.99]'
                            : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        {/* Image */}
                        <div className="w-20 h-20 bg-slate-100 rounded-xl overflow-hidden shrink-0 relative">
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
                          {!item.isAvailable && (
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
                              <span className="text-[9px] font-bold text-white uppercase tracking-wider px-1 py-0.5 bg-black/60 rounded">
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
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm font-bold text-slate-900">
                              {formatPrice(item.price, currency)}
                            </span>
                            {item.isAvailable ? (
                              <span className="text-[10px] font-bold text-[var(--theme-accent)] bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors">
                                Add
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400">
                                Unavailable
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ==========================================
          STICKY CART BAR
          ========================================== */}
      <AnimatePresence>
        {cartTotalItems >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 20, stiffness: 260 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4"
          >
            <div
              onClick={() => setIsCartSheetOpen(true)}
              className="bg-slate-900 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform border border-white/10"
            >
              <div className="flex items-center gap-3">
                <div className="relative bg-white/10 p-2.5 rounded-xl">
                  <ShoppingCart className="w-5 h-5 text-white" strokeWidth={1.75} />
                  <motion.span
                    key={cartTotalItems}
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 12 }}
                    className="absolute -top-1.5 -right-1.5 bg-[var(--theme-accent)] text-slate-950 font-mono font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow"
                  >
                    {cartTotalItems}
                  </motion.span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white/70">Review Basket</h4>
                  <p className="text-sm font-semibold tracking-wide text-white">
                    {formatPrice(cartSubtotal, currency)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold tracking-wider text-[var(--theme-accent)] bg-white/5 py-1.5 px-3 rounded-lg border border-white/5">
                View Cart
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==========================================
          FLYING GHOSTS ANIMATIONS CONTAINER
          ========================================== */}
      <AnimatePresence>
        {ghosts.map((g) => (
          <motion.div
            key={g.id}
            initial={{ left: g.x, top: g.y, opacity: 1, scale: 1.2 }}
            animate={{
              left: window.innerWidth / 2,
              top: window.innerHeight - 80,
              opacity: 0,
              scale: 0.5,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-[120] pointer-events-none bg-amber-500 text-slate-950 p-2.5 rounded-full shadow-lg"
          >
            <ShoppingCart className="w-4 h-4" strokeWidth={2.5} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ==========================================
          WAITER CALL CONFIRM MODAL
          ========================================== */}
      <ConfirmModal
        isOpen={isWaiterModalOpen}
        title="Call a Waiter?"
        message={`Would you like to call a waiter to Table ${table.tableNumber}? A service staff member will assist you shortly.`}
        confirmText="Yes, Call Waiter"
        cancelText="Cancel"
        onConfirm={handleCallWaiterConfirm}
        onCancel={() => setIsWaiterModalOpen(false)}
      />

      {/* ==========================================
          CLEAR CART CONFIRM MODAL
          ========================================== */}
      <ConfirmModal
        isOpen={isClearCartModalOpen}
        title="Clear Cart?"
        message="Are you sure you want to remove all items from your basket? This action cannot be undone."
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
              {/* Drag Handle Indicator */}
              <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 shrink-0" />

              {/* Close Button */}
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute right-4 top-4 bg-slate-100 hover:bg-slate-200 transition-colors p-1.5 rounded-full text-slate-500 hover:text-slate-700 z-10"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>

              <div className="flex-1 overflow-y-auto p-5 pb-8 space-y-6">
                {/* Hero Image */}
                <div className="w-full h-56 bg-slate-50 rounded-2xl overflow-hidden relative border border-slate-100">
                  {selectedItem.imageUrl ? (
                    <img
                      src={selectedItem.imageUrl}
                      alt={selectedItem.name}
                      className="w-full h-full object-cover"
                    />
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

                {/* Info */}
                <div className="space-y-2">
                  <h3 className="font-display text-3xl font-normal text-slate-900 leading-tight">
                    {selectedItem.name}
                  </h3>
                  {selectedItem.description && (
                    <p className="text-slate-500 text-sm leading-relaxed">
                      {selectedItem.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-slate-900">
                      {formatPrice(selectedItem.price, currency)}
                    </span>
                    {selectedItem.prepTimeMinutes && (
                      <span className="text-xs text-slate-400 font-medium">
                        • {selectedItem.prepTimeMinutes} mins prep
                      </span>
                    )}
                  </div>
                </div>

                {/* Add-Ons */}
                {selectedItem.addOns && selectedItem.addOns.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-950 uppercase tracking-wide">
                      Customize Item (Add-ons)
                    </h4>
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
                            <span className="text-sm font-bold">
                              + {formatPrice(addOn.priceDelta, currency)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Special Instructions */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-950 uppercase tracking-wide">
                    Special Instructions
                  </h4>
                  <textarea
                    rows={2}
                    placeholder="E.g., No onions, extra cheese, gluten-free crust..."
                    value={detailSpecialInstructions}
                    onChange={(e) => setDetailSpecialInstructions(e.target.value)}
                    className="w-full p-3.5 border border-slate-150 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/30 focus:border-[var(--theme-accent)] text-sm placeholder:text-slate-400"
                  />
                </div>

                {/* CTA Action Bar inside detail sheet */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                  {/* Quantity Selector */}
                  <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1 shrink-0">
                    <button
                      onClick={() => setDetailQuantity((q) => Math.max(1, q - 1))}
                      className="p-2 text-slate-600 hover:text-slate-800 transition-colors rounded-lg hover:bg-white active:scale-95"
                    >
                      <Minus className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <span className="px-4 font-bold text-slate-900 text-sm font-mono w-8 text-center">
                      {detailQuantity}
                    </span>
                    <button
                      onClick={() => setDetailQuantity((q) => q + 1)}
                      className="p-2 text-slate-600 hover:text-slate-800 transition-colors rounded-lg hover:bg-white active:scale-95"
                    >
                      <Plus className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>

                  {/* Add Button */}
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
              {/* Drag Handle Indicator */}
              <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 shrink-0" />

              {/* Close Button */}
              <button
                onClick={() => setIsCartSheetOpen(false)}
                className="absolute right-4 top-4 bg-slate-100 hover:bg-slate-200 transition-colors p-1.5 rounded-full text-slate-500 hover:text-slate-700 z-10"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>

              <div className="flex-1 overflow-y-auto p-5 pb-8 flex flex-col justify-between h-full space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-display text-3xl font-normal text-slate-900 tracking-tight">
                      Your Basket
                    </h3>
                    <button
                      onClick={() => setIsClearCartModalOpen(true)}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Clear All
                    </button>
                  </div>

                  {/* Line Items List */}
                  <div className="divide-y divide-slate-100 space-y-3">
                    {cartItems.map((item, idx) => (
                      <div key={idx} className="flex gap-4 py-3 first:pt-0">
                        <div className="flex-1 space-y-1">
                          <h4 className="text-sm font-bold text-slate-900 leading-snug">
                            {item.name}
                          </h4>
                          {item.selectedAddOns.length > 0 && (
                            <p className="text-[11px] text-slate-500">
                              + {item.selectedAddOns.map((x) => x.name).join(', ')}
                            </p>
                          )}
                          {item.specialInstructions && (
                            <p className="text-[11px] text-amber-600 bg-amber-50/50 rounded-lg px-2 py-1 inline-block italic font-medium">
                              Note: "{item.specialInstructions}"
                            </p>
                          )}
                          <p className="text-xs font-bold text-slate-800">
                            {formatPrice(item.price, currency)} each
                          </p>
                        </div>

                        {/* Quantity Counter & Line total */}
                        <div className="flex flex-col items-end justify-between shrink-0">
                          <span className="text-sm font-black text-slate-900 font-mono">
                            {formatPrice(item.price * item.quantity, currency)}
                          </span>

                          <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-0.5 mt-2">
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.itemId,
                                  item.selectedAddOns,
                                  item.specialInstructions || '',
                                  -1
                                )
                              }
                              className="p-1 text-slate-500 hover:text-slate-800 transition-colors rounded-lg hover:bg-white active:scale-95"
                            >
                              <Minus className="w-3.5 h-3.5" strokeWidth={2} />
                            </button>
                            <span className="px-2 font-bold text-slate-900 text-xs font-mono w-6 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.itemId,
                                  item.selectedAddOns,
                                  item.specialInstructions || '',
                                  1
                                )
                              }
                              className="p-1 text-slate-500 hover:text-slate-800 transition-colors rounded-lg hover:bg-white active:scale-95"
                            >
                              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subtotal & Call To Action */}
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium text-sm">Basket Subtotal</span>
                    <span className="text-xl font-black text-slate-900 font-mono">
                      {formatPrice(cartSubtotal, currency)}
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 flex items-start gap-2.5">
                    <Sparkles className="w-5 h-5 text-[var(--theme-accent)] shrink-0 mt-0.5" strokeWidth={1.75} />
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      This is a preview of your order. Once you are ready, you can submit this to our kitchen in the next phase!
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      toast('Order submission coming soon in Phase 5!', 'info');
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md active:scale-[0.99]"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// HelpCircle placeholder icon (to keep it completely Lucide React and custom)
const HelpCirclePlaceholder = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export default PublicTable;
