import { Schema, model, Document, Types } from 'mongoose';

export type WaiterCallStatus = 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';

export interface IWaiterCall extends Document {
  restaurantId: Types.ObjectId;
  tableId: Types.ObjectId;
  tableNumberSnapshot: string;
  status: WaiterCallStatus;
  requestType: 'CALL_WAITER' | 'REQUEST_BILL' | 'WATER' | 'TISSUE' | 'OTHER';
  createdAt: Date;
  updatedAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId; // ref 'User'
}

const waiterCallSchema = new Schema<IWaiterCall>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    tableNumberSnapshot: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED'],
      default: 'PENDING',
    },
    requestType: {
      type: String,
      required: true,
      enum: ['CALL_WAITER', 'REQUEST_BILL', 'WATER', 'TISSUE', 'OTHER'],
      default: 'CALL_WAITER',
    },
    acknowledgedAt: { type: Date },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'waiter_calls',
  }
);

// Index optimizes lookup of active waiter calls per restaurant
waiterCallSchema.index({ restaurantId: 1, status: 1 });

export const WaiterCall = model<IWaiterCall>('WaiterCall', waiterCallSchema);
export default WaiterCall;
