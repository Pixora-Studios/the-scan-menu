import { Schema, model, Document, Types } from 'mongoose';
import { getOrderStatusRollup } from '../utils/orderStateMachine';
import { TableSession } from './TableSession';

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
  prepTimeMinutesSnapshot?: number;
  itemStatus: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';
  servedAt?: Date;
}

export interface IOrder extends Document {
  restaurantId: Types.ObjectId;
  tableId: Types.ObjectId;
  sessionId: Types.ObjectId;
  roundNumber: number;
  isMerged: boolean;
  orderNumber: number; // sequential per restaurant
  items: IOrderItem[];
  subtotal: number; // in cents/paise
  tax: number; // in cents/paise
  total: number; // in cents/paise
  customerNote?: string;
  status: OrderStatus;
  source: OrderSource;
  customerPhone?: string;
  paymentStatus: 'PENDING' | 'PAID';
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
    prepTimeMinutesSnapshot: { type: Number },
    itemStatus: {
      type: String,
      required: true,
      enum: ['PENDING', 'PREPARING', 'READY', 'SERVED'],
      default: 'PENDING',
    },
    servedAt: { type: Date },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'TableSession', required: true },
    roundNumber: { type: Number, required: true },
    isMerged: { type: Boolean, required: true, default: false },
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
    customerPhone: { type: String, trim: true },
    paymentStatus: {
      type: String,
      required: true,
      enum: ['PENDING', 'PAID'],
      default: 'PENDING',
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

// Pre-validate hook to auto-heal missing sessionId and roundNumber for legacy or unmigrated orders
orderSchema.pre('validate', async function (this: any, next) {
  try {
    if ((!this.sessionId || !this.roundNumber) && this.restaurantId && this.tableId) {
      let session = await TableSession.findOne({
        restaurantId: this.restaurantId,
        tableId: this.tableId,
        status: 'OPEN',
      });
      if (!session) {
        session = new TableSession({
          restaurantId: this.restaurantId,
          tableId: this.tableId,
          status: 'OPEN',
          roundCount: 1,
          subtotal: this.subtotal || 0,
          tax: this.tax || 0,
          total: this.total || 0,
          openedAt: this.createdAt || new Date(),
        });
        await session.save();
      }
      if (!this.sessionId) {
        this.sessionId = session._id;
      }
      if (!this.roundNumber) {
        this.roundNumber = session.roundCount || 1;
      }
    }
  } catch (err) {
    console.error('Error in order pre-validate hook for sessionId auto-heal:', err);
  }
  next();
});

// Pre-save hook to automatically compute and update aggregate status
orderSchema.pre('save', function (this: any, next) {
  try {
    this.status = getOrderStatusRollup(this);
  } catch (err) {
    console.error('Error in order pre-save hook:', err);
  }
  next();
});

// Indexes
// 1. Unique index: Ensure orderNumber is strictly sequential and unique per restaurant tenant
orderSchema.index({ restaurantId: 1, orderNumber: 1 }, { unique: true });

// 2. Query compound index on restaurantId + status (critical for active order list filters)
orderSchema.index({ restaurantId: 1, status: 1 });

// 3. Query compound index on restaurantId + createdAt (critical for paginated histories and reports)
orderSchema.index({ restaurantId: 1, createdAt: -1 });

export const Order = model<IOrder>('Order', orderSchema);
export default Order;
