import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required'),
  description: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createMenuItemSchema = z.object({
  categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid category ID'),
  name: z.string().trim().min(1, 'Menu item name is required'),
  description: z.string().trim().optional(),
  price: z.number().int().positive('Price must be a positive integer (paise/cents)'),
  imageUrl: z.string().trim().optional(),
  isVegetarian: z.boolean().default(false),
  isSpicy: z.boolean().default(false),
  prepTimeMinutes: z.number().int().positive().optional(),
  addOns: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Add-on name is required'),
        priceDelta: z.number().int().nonnegative('Price delta must be a non-negative integer'),
      })
    )
    .optional(),
});

export const updateMenuItemSchema = createMenuItemSchema.partial();
