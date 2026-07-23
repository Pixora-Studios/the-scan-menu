import { Schema, model, Document, Types } from 'mongoose';

export interface ITableSession extends Document {
  restaurantId: Types.ObjectId;
  tableId: Types.ObjectId;
  status: 'OPEN' | 'CLOSED';
  roundCount: number;         // increments each time a new round/order is added
  subtotal: number;           // running sum across all rounds in paise/cents
  tax: number;                // running sum in paise/cents
  total: number;              // running sum in paise/cents
  openedAt: Date;
  closedAt?: Date;
}

const tableSessionSchema = new Schema<ITableSession>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    status: {
      type: String,
      required: true,
      enum: ['OPEN', 'CLOSED'],
      default: 'OPEN',
    },
    roundCount: { type: Number, required: true, default: 0 },
    subtotal: { type: Number, required: true, default: 0 },
    tax: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
    openedAt: { type: Date, required: true, default: Date.now },
    closedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'table_sessions',
  }
);

// Index for fast lookup: "is there an open session for this table"
tableSessionSchema.index({ restaurantId: 1, tableId: 1, status: 1 });

export const TableSession = model<ITableSession>('TableSession', tableSessionSchema);
export default TableSession;
