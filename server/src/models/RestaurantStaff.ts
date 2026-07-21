import { Schema, model, Document, Types } from 'mongoose';

export type StaffRole = 'MANAGER' | 'STAFF';

export interface IRestaurantStaff extends Document {
  userId: Types.ObjectId;
  restaurantId: Types.ObjectId;
  role: StaffRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const restaurantStaffSchema = new Schema<IRestaurantStaff>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    role: { type: String, required: true, enum: ['MANAGER', 'STAFF'] },
    isActive: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
    collection: 'restaurant_staff',
  }
);

// Compound unique index on userId + restaurantId
restaurantStaffSchema.index({ userId: 1, restaurantId: 1 }, { unique: true });

export const RestaurantStaff = model<IRestaurantStaff>('RestaurantStaff', restaurantStaffSchema);
export default RestaurantStaff;
