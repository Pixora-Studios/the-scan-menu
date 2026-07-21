import { Schema, model, Document } from 'mongoose';

export interface IRestaurantTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl?: string;
  coverImageUrl?: string;
}

export interface IIntegrationConfig {
  provider: 'NONE' | 'OTHER';
  config: Record<string, any>;
}

export interface IRestaurant extends Document {
  name: string;
  slug: string;
  logoUrl?: string;
  coverImageUrl?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  googleReviewUrl?: string;
  currency: string;
  timezone: string;
  theme: IRestaurantTheme;
  isActive: boolean;
  integrationConfig: IIntegrationConfig;
  createdAt: Date;
  updatedAt: Date;
}

const restaurantSchema = new Schema<IRestaurant>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logoUrl: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
    description: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    address: { type: String, trim: true },
    googleReviewUrl: { type: String, trim: true },
    currency: { type: String, required: true, default: 'INR' },
    timezone: { type: String, required: true, default: 'Asia/Kolkata' },
    theme: {
      primaryColor: { type: String, required: true, default: '#111827' },
      secondaryColor: { type: String, required: true, default: '#FFFFFF' },
      accentColor: { type: String, required: true, default: '#F59E0B' },
      fontFamily: { type: String, required: true, default: 'Plus Jakarta Sans' },
      logoUrl: { type: String },
      coverImageUrl: { type: String },
    },
    isActive: { type: Boolean, required: true, default: true },
    integrationConfig: {
      provider: { type: String, required: true, default: 'NONE' },
      config: { type: Schema.Types.Mixed, required: true, default: {} },
    },
  },
  {
    timestamps: true,
    collection: 'restaurants',
  }
);

export const Restaurant = model<IRestaurant>('Restaurant', restaurantSchema);
export default Restaurant;
