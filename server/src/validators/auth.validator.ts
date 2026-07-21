import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email format' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: 'Current password is required' }),
  newPassword: z
    .string()
    .min(8, { message: 'New password must be at least 8 characters' })
    .regex(/[A-Z]/, { message: 'New password must contain at least one uppercase letter' })
    .regex(/[0-9]/, { message: 'New password must contain at least one number' })
    .regex(/[^A-Za-z0-9]/, { message: 'New password must contain at least one special character' }),
});
