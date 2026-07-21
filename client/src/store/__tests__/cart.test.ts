import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../useCartStore';

describe('Zustand Cart Store Math & State Management', () => {
  beforeEach(() => {
    // Clear the cart state and mock tokens before each test
    useCartStore.getState().clearCart();
    useCartStore.setState({ tableToken: null, restaurantSlug: null });
  });

  it('should successfully set tableToken and clear cart on token mismatch', () => {
    const store = useCartStore.getState();
    store.setTable('pizza-place', 'table-15-token');

    // Add some item to cart
    store.addItem({
      itemId: 'item-1',
      name: 'Margherita Pizza',
      basePrice: 1000, // 10.00
      quantity: 1,
      selectedAddOns: [],
      specialInstructions: '',
    });

    expect(useCartStore.getState().items).toHaveLength(1);

    // Set table token to a different token
    useCartStore.getState().setTable('pizza-place', 'table-16-token');

    // Cart should be cleared on token mismatch
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().tableToken).toBe('table-16-token');
  });

  it('should correctly snapshot unit price as basePrice plus selected add-ons priceDelta', () => {
    const store = useCartStore.getState();

    store.addItem({
      itemId: 'item-pizza',
      name: 'Gourmet Sourdough Pizza',
      basePrice: 12000, // 120.00
      quantity: 2,
      selectedAddOns: [
        { name: 'Extra Cheese', priceDelta: 1500 }, // 15.00
        { name: 'Truffle Oil', priceDelta: 2500 }, // 25.00
      ],
      specialInstructions: 'Well done',
    });

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);

    // Per-unit price snapshot should be basePrice (12000) + Extra Cheese (1500) + Truffle Oil (2500) = 16000
    expect(items[0].price).toBe(16000);
    expect(items[0].quantity).toBe(2);
  });

  it('should increment quantity if the same item with identical add-ons and instructions is added', () => {
    const store = useCartStore.getState();

    // 1. Add first item
    store.addItem({
      itemId: 'item-1',
      name: 'Cola',
      basePrice: 250,
      quantity: 1,
      selectedAddOns: [],
      specialInstructions: 'With ice',
    });

    // 2. Add second identical item
    store.addItem({
      itemId: 'item-1',
      name: 'Cola',
      basePrice: 250,
      quantity: 2,
      selectedAddOns: [],
      specialInstructions: 'With ice',
    });

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
    expect(items[0].price).toBe(250);
  });

  it('should treat items with same ID but different add-ons or instructions as separate line items', () => {
    const store = useCartStore.getState();

    // 1. Margherita with extra cheese
    store.addItem({
      itemId: 'item-pizza',
      name: 'Margherita Pizza',
      basePrice: 1000,
      quantity: 1,
      selectedAddOns: [{ name: 'Extra Cheese', priceDelta: 200 }],
      specialInstructions: 'No onions',
    });

    // 2. Margherita with no extra cheese, different instruction
    store.addItem({
      itemId: 'item-pizza',
      name: 'Margherita Pizza',
      basePrice: 1000,
      quantity: 1,
      selectedAddOns: [],
      specialInstructions: 'Spicy',
    });

    // 3. Margherita with same instruction but different add-on
    store.addItem({
      itemId: 'item-pizza',
      name: 'Margherita Pizza',
      basePrice: 1000,
      quantity: 1,
      selectedAddOns: [{ name: 'Mushrooms', priceDelta: 300 }],
      specialInstructions: 'No onions',
    });

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(3);
  });

  it('should correctly calculate the total subtotal of the cart', () => {
    const store = useCartStore.getState();

    // 1. 2x Cola (base 250, unit 250) -> line total 500
    store.addItem({
      itemId: 'item-cola',
      name: 'Cola',
      basePrice: 250,
      quantity: 2,
      selectedAddOns: [],
    });

    // 2. 1x Pizza with Cheese (base 1000, Cheese 200, unit 1200) -> line total 1200
    store.addItem({
      itemId: 'item-pizza',
      name: 'Pizza',
      basePrice: 1000,
      quantity: 1,
      selectedAddOns: [{ name: 'Cheese', priceDelta: 200 }],
    });

    // Total should be (250 * 2) + (1200 * 1) = 1700
    const items = useCartStore.getState().items;
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    expect(subtotal).toBe(1700);
  });

  it('should successfully update quantity and remove item when updating quantity to 0', () => {
    const store = useCartStore.getState();

    store.addItem({
      itemId: 'item-1',
      name: 'Pasta',
      basePrice: 800,
      quantity: 2,
      selectedAddOns: [],
      specialInstructions: 'Extra spicy',
    });

    // Increment quantity
    store.updateQuantity('item-1', [], 'Extra spicy', 1);
    expect(useCartStore.getState().items[0].quantity).toBe(3);

    // Decrement quantity
    store.updateQuantity('item-1', [], 'Extra spicy', -1);
    expect(useCartStore.getState().items[0].quantity).toBe(2);

    // Decrement to 0 (should remove item)
    store.updateQuantity('item-1', [], 'Extra spicy', -2);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('should remove item directly', () => {
    const store = useCartStore.getState();

    store.addItem({
      itemId: 'item-1',
      name: 'Pasta',
      basePrice: 800,
      quantity: 2,
      selectedAddOns: [],
      specialInstructions: 'Extra spicy',
    });

    store.removeItem('item-1', [], 'Extra spicy');
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});
