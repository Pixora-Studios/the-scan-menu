import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartAddOn {
  name: string;
  priceDelta: number; // in cents/paise
}

export interface CartItem {
  itemId: string;
  name: string; // snapshot
  price: number; // snapshot of base + selected add-on deltas (per-unit in cents/paise)
  basePrice: number; // base price of the item
  quantity: number;
  specialInstructions?: string;
  selectedAddOns: CartAddOn[];
}

export interface CartState {
  items: CartItem[];
  tableToken: string | null;
  restaurantSlug: string | null;
  setTable: (restaurantSlug: string, tableToken: string) => void;
  addItem: (item: Omit<CartItem, 'price'> & { basePrice: number }) => void;
  updateQuantity: (itemId: string, selectedAddOns: CartAddOn[], specialInstructions: string, delta: number) => void;
  removeItem: (itemId: string, selectedAddOns: CartAddOn[], specialInstructions: string) => void;
  clearCart: () => void;
}

export const isSameItem = (
  aId: string,
  aAddOns: CartAddOn[],
  aInstructions: string | undefined,
  bId: string,
  bAddOns: CartAddOn[],
  bInstructions: string | undefined
): boolean => {
  if (aId !== bId) return false;
  if ((aInstructions || '').trim() !== (bInstructions || '').trim()) return false;
  if (aAddOns.length !== bAddOns.length) return false;

  const sortedA = [...aAddOns].sort((x, y) => x.name.localeCompare(y.name));
  const sortedB = [...bAddOns].sort((x, y) => x.name.localeCompare(y.name));

  return sortedA.every(
    (val, index) => val.name === sortedB[index].name && val.priceDelta === sortedB[index].priceDelta
  );
};

const safeSessionStorage = {
  getItem: (name: string) => {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(name);
    }
    return null;
  },
  setItem: (name: string, value: string) => {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(name, value);
    }
  },
  removeItem: (name: string) => {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(name);
    }
  },
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      tableToken: null,
      restaurantSlug: null,

      setTable: (restaurantSlug, tableToken) => {
        const currentToken = get().tableToken;
        if (currentToken !== tableToken) {
          // Clears cart on table token mismatch/change
          set({ items: [], restaurantSlug, tableToken });
        } else {
          set({ restaurantSlug, tableToken });
        }
      },

      addItem: (newItem) => {
        const calculatedPrice = newItem.basePrice + newItem.selectedAddOns.reduce((sum, addOn) => sum + addOn.priceDelta, 0);
        const snapshotItem: CartItem = {
          ...newItem,
          price: calculatedPrice,
        };

        const existingItems = get().items;
        const matchingIndex = existingItems.findIndex((item) =>
          isSameItem(
            item.itemId,
            item.selectedAddOns,
            item.specialInstructions,
            snapshotItem.itemId,
            snapshotItem.selectedAddOns,
            snapshotItem.specialInstructions
          )
        );

        if (matchingIndex > -1) {
          const updatedItems = [...existingItems];
          updatedItems[matchingIndex].quantity += snapshotItem.quantity;
          set({ items: updatedItems });
        } else {
          set({ items: [...existingItems, snapshotItem] });
        }
      },

      updateQuantity: (itemId, selectedAddOns, specialInstructions, delta) => {
        const existingItems = get().items;
        const matchingIndex = existingItems.findIndex((item) =>
          isSameItem(
            item.itemId,
            item.selectedAddOns,
            item.specialInstructions,
            itemId,
            selectedAddOns,
            specialInstructions
          )
        );

        if (matchingIndex > -1) {
          const updatedItems = [...existingItems];
          const newQty = updatedItems[matchingIndex].quantity + delta;
          if (newQty <= 0) {
            updatedItems.splice(matchingIndex, 1);
          } else {
            updatedItems[matchingIndex].quantity = newQty;
          }
          set({ items: updatedItems });
        }
      },

      removeItem: (itemId, selectedAddOns, specialInstructions) => {
        const existingItems = get().items;
        const updatedItems = existingItems.filter(
          (item) =>
            !isSameItem(
              item.itemId,
              item.selectedAddOns,
              item.specialInstructions,
              itemId,
              selectedAddOns,
              specialInstructions
            )
        );
        set({ items: updatedItems });
      },

      clearCart: () => {
        set({ items: [] });
      },
    }),
    {
      name: 'pixora-cart-storage',
      storage: createJSONStorage(() => safeSessionStorage), // persist only to session storage safely
    }
  )
);
