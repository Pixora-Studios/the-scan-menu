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
  taxRatePercent: number;
  integrationConfig: IIntegrationConfig;
  gstNumber?: string;
  whatsapp?: string;
  timings?: {
    open: string;
    close: string;
  };
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  paymentMethods?: {
    cash: boolean;
    card: boolean;
    upi: boolean;
    razorpay: boolean;
  };
  razorpayConfig?: {
    keyId?: string;
    keySecret?: string;
  };
  subscription?: {
    status: 'ACTIVE' | 'EXPIRED' | 'TRIAL';
    planType: 'STARTER' | 'PREMIUM' | 'ENTERPRISE';
    expiresAt: Date;
  };
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
    taxRatePercent: { type: Number, required: true, default: 0 },
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
    gstNumber: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
    timings: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '23:00' },
    },
    socialLinks: {
      facebook: { type: String, trim: true, default: '' },
      instagram: { type: String, trim: true, default: '' },
      twitter: { type: String, trim: true, default: '' },
    },
    paymentMethods: {
      cash: { type: Boolean, default: true },
      card: { type: Boolean, default: true },
      upi: { type: Boolean, default: true },
      razorpay: { type: Boolean, default: false },
    },
    razorpayConfig: {
      keyId: { type: String, trim: true, default: '' },
      keySecret: { type: String, trim: true, default: '' },
    },
    subscription: {
      status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'TRIAL'], default: 'TRIAL' },
      planType: { type: String, enum: ['STARTER', 'PREMIUM', 'ENTERPRISE'], default: 'STARTER' },
      expiresAt: { type: Date, default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) }, // 14-day default trial
    },
  },
  {
    timestamps: true,
    collection: 'restaurants',
  }
);

export const Restaurant = model<IRestaurant>('Restaurant', restaurantSchema);
export default Restaurant;
