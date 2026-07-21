import { Schema, model, Document, Types } from 'mongoose';

export interface IAddOn {
  name: string;
  priceDelta: number; // in cents/paise
}

export interface IMenuItem extends Document {
  restaurantId: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  description?: string;
  price: number; // Stored as integer cents/paise
  imageUrl?: string;
  isAvailable: boolean;
  isVegetarian: boolean;
  isSpicy: boolean;
  prepTimeMinutes?: number;
  sortOrder: number;
  addOns?: IAddOn[];
  createdAt: Date;
  updatedAt: Date;
}

const addOnSchema = new Schema<IAddOn>(
  {
    name: { type: String, required: true, trim: true },
    priceDelta: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const menuItemSchema = new Schema<IMenuItem>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true }, // positive integer validated via Zod
    imageUrl: { type: String, trim: true },
    isAvailable: { type: Boolean, required: true, default: true },
    isVegetarian: { type: Boolean, required: true, default: false },
    isSpicy: { type: Boolean, required: true, default: false },
    prepTimeMinutes: { type: Number },
    sortOrder: { type: Number, required: true, default: 0 },
    addOns: [addOnSchema],
  },
  {
    timestamps: true,
    collection: 'menu_items',
  }
);

// Indexes:
// 1. Optimize querying items by category inside a restaurant (Manager menu rendering)
menuItemSchema.index({ restaurantId: 1, categoryId: 1 });
// 2. Critical for public customer menu filtration (always searches active, available items)
menuItemSchema.index({ restaurantId: 1, isAvailable: 1 });

export const MenuItem = model<IMenuItem>('MenuItem', menuItemSchema);
export default MenuItem;
