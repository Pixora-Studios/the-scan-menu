import { Schema, model, Document } from 'mongoose';

export type UserRole = 'SUPER_ADMIN' | 'MANAGER' | 'STAFF';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: UserRole;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      enum: ['SUPER_ADMIN', 'MANAGER', 'STAFF'],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

export const User = model<IUser>('User', userSchema);
export default User;
