import { Schema, model, Document, Types } from 'mongoose';

export interface ITable extends Document {
  restaurantId: Types.ObjectId;
  tableNumber: string;
  displayName: string;
  token: string;
  isActive: boolean;
  qrCodeUrl: string;
  isArchived: boolean;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  createdAt: Date;
  updatedAt: Date;
}

const tableSchema = new Schema<ITable>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    tableNumber: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    token: { type: String, required: true, unique: true },
    isActive: { type: Boolean, required: true, default: true },
    qrCodeUrl: { type: String, required: true },
    isArchived: { type: Boolean, required: true, default: false },
    status: {
      type: String,
      required: true,
      enum: ['AVAILABLE', 'OCCUPIED', 'RESERVED'],
      default: 'AVAILABLE',
    },
  },
  {
    timestamps: true,
    collection: 'tables',
  }
);

// Indexes
tableSchema.index({ restaurantId: 1 });
// Compound index to prevent duplicate tableNumber within the same restaurant
tableSchema.index({ restaurantId: 1, tableNumber: 1 }, { unique: true });

export const Table = model<ITable>('Table', tableSchema);
export default Table;
