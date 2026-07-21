import { Schema, model, Document, Types } from 'mongoose';

export type IntegrationSyncStatus = 'ORDER_SYNC_PENDING' | 'ORDER_SYNCED' | 'ORDER_SYNC_FAILED';

export interface IIntegrationSyncLog extends Document {
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  provider: string;
  status: IntegrationSyncStatus;
  syncAttempts: number;
  errorLog?: string;
  createdAt: Date;
  updatedAt: Date;
}

const integrationSyncLogSchema = new Schema<IIntegrationSyncLog>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    provider: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['ORDER_SYNC_PENDING', 'ORDER_SYNCED', 'ORDER_SYNC_FAILED'],
      default: 'ORDER_SYNC_PENDING',
    },
    syncAttempts: { type: Number, required: true, default: 1 },
    errorLog: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'integration_sync_logs',
  }
);

// Indexes
integrationSyncLogSchema.index({ restaurantId: 1, status: 1 });
integrationSyncLogSchema.index({ orderId: 1 });

export const IntegrationSyncLog = model<IIntegrationSyncLog>('IntegrationSyncLog', integrationSyncLogSchema);
export default IntegrationSyncLog;
