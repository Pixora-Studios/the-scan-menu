import { Schema, model, Document, Types } from 'mongoose';

// ==========================================
// ORDER COUNTER MODEL (for atomic order numbering)
// ==========================================

export interface IOrderCounter extends Document {
  restaurantId: Types.ObjectId;
  seq: number;
}

const orderCounterSchema = new Schema<IOrderCounter>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'order_counters' }
);

export const OrderCounter = model<IOrderCounter>('OrderCounter', orderCounterSchema);

// ==========================================
// ORDER MODEL
// ==========================================

export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
export type OrderSource = 'QR' | 'POS' | 'API' | 'MANUAL';

export interface IOrderAddOn {
  name: string;
  priceDelta: number; // in cents/paise
}

export interface IOrderItem {
  menuItemId: Types.ObjectId;
  nameSnapshot: string;
  unitPriceSnapshot: number; // in cents/paise (base item price + add-on deltas at unit level)
  quantity: number;
  selectedAddOns: IOrderAddOn[];
  specialInstructions?: string;
}

export interface IOrder extends Document {
  restaurantId: Types.ObjectId;
  tableId: Types.ObjectId;
  orderNumber: number; // sequential per restaurant
  items: IOrderItem[];
  subtotal: number; // in cents/paise
  tax: number; // in cents/paise
  total: number; // in cents/paise
  customerNote?: string;
  status: OrderStatus;
  source: OrderSource;
  integrationMetadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const orderAddOnSchema = new Schema<IOrderAddOn>(
  {
    name: { type: String, required: true, trim: true },
    priceDelta: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const orderItemSchema = new Schema<IOrderItem>(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    nameSnapshot: { type: String, required: true, trim: true },
    unitPriceSnapshot: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    selectedAddOns: [orderAddOnSchema],
    specialInstructions: { type: String, trim: true },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    orderNumber: { type: Number, required: true },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    customerNote: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'],
      default: 'PENDING',
    },
    source: {
      type: String,
      required: true,
      enum: ['QR', 'POS', 'API', 'MANUAL'],
      default: 'QR',
    },
    integrationMetadata: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'orders',
  }
);

// Indexes
// 1. Unique index: Ensure orderNumber is strictly sequential and unique per restaurant tenant
orderSchema.index({ restaurantId: 1, orderNumber: 1 }, { unique: true });

// 2. Query compound index on restaurantId + status (critical for active order list filters)
orderSchema.index({ restaurantId: 1, status: 1 });

// 3. Query compound index on restaurantId + createdAt (critical for paginated histories and reports)
orderSchema.index({ restaurantId: 1, createdAt: -1 });

export const Order = model<IOrder>('Order', orderSchema);
export default Order;
