import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Category } from '../models/Category';
import { MenuItem } from '../models/MenuItem';
import { CloudinaryService } from '../services/cloudinary.service';
import { sendSuccess, sendError } from '../utils/response';
import mongoose from 'mongoose';

const cloudinaryService = new CloudinaryService();

export class MenuController {
  constructor() {
    this.listCategories = this.listCategories.bind(this);
    this.createCategory = this.createCategory.bind(this);
    this.editCategory = this.editCategory.bind(this);
    this.deleteCategory = this.deleteCategory.bind(this);
    this.reorderCategories = this.reorderCategories.bind(this);

    this.listMenuItems = this.listMenuItems.bind(this);
    this.createMenuItem = this.createMenuItem.bind(this);
    this.editMenuItem = this.editMenuItem.bind(this);
    this.deleteMenuItem = this.deleteMenuItem.bind(this);
    this.toggleAvailability = this.toggleAvailability.bind(this);
    this.bulkAvailability = this.bulkAvailability.bind(this);
    this.reorderMenuItems = this.reorderMenuItems.bind(this);

    this.getUploadSignature = this.getUploadSignature.bind(this);
  }

  // ==========================================
  // CATEGORIES
  // ==========================================

  async listCategories(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const categories = await Category.find({
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      }).sort({ sortOrder: 1 });

      sendSuccess(res, categories, 'Categories retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const { name, description, imageUrl, sortOrder } = req.body;

      if (!name) {
        sendError(res, 'BAD_REQUEST', 'Category name is required', null, 400);
        return;
      }

      let finalSortOrder = sortOrder;
      if (finalSortOrder === undefined) {
        // Auto-increment sortOrder: find max
        const lastCategory = await Category.findOne({
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
        }).sort({ sortOrder: -1 });
        finalSortOrder = lastCategory ? lastCategory.sortOrder + 1 : 0;
      }

      const category = new Category({
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        name: name.trim(),
        description: description?.trim(),
        imageUrl: imageUrl?.trim(),
        sortOrder: finalSortOrder,
        isActive: true,
      });

      await category.save();
      sendSuccess(res, category, 'Category created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async editCategory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, categoryId } = req.params;
      const updateData = { ...req.body };

      // Ensure manager doesn't modify restaurantId
      delete updateData.restaurantId;

      const category = await Category.findOneAndUpdate(
        { _id: categoryId, restaurantId: new mongoose.Types.ObjectId(restaurantId) },
        updateData,
        { new: true }
      );

      if (!category) {
        sendError(res, 'CATEGORY_NOT_FOUND', 'Category not found', null, 404);
        return;
      }

      sendSuccess(res, category, 'Category updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteCategory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, categoryId } = req.params;

      const category = await Category.findOne({
        _id: categoryId,
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!category) {
        sendError(res, 'CATEGORY_NOT_FOUND', 'Category not found', null, 404);
        return;
      }

      // Check if there are any associated menu items inside this category
      const itemCount = await MenuItem.countDocuments({
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        categoryId: category.id,
      });

      if (itemCount > 0) {
        sendError(
          res,
          'CONFLICT',
          `Cannot delete category. There are ${itemCount} menu items inside this category. Please delete or move them first.`,
          null,
          409
        );
        return;
      }

      await Category.findByIdAndDelete(categoryId);
      sendSuccess(res, {}, 'Category deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async reorderCategories(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const { categoryIds } = req.body;

      if (!Array.isArray(categoryIds)) {
        sendError(res, 'BAD_REQUEST', 'categoryIds must be an array of category IDs', null, 400);
        return;
      }

      const bulkOps = categoryIds.map((id: string, index: number) => ({
        updateOne: {
          filter: {
            _id: new mongoose.Types.ObjectId(id),
            restaurantId: new mongoose.Types.ObjectId(restaurantId),
          },
          update: { sortOrder: index },
        },
      }));

      await Category.bulkWrite(bulkOps);
      sendSuccess(res, {}, 'Categories reordered successfully');
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // MENU ITEMS
  // ==========================================

  async listMenuItems(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const { categoryId } = req.query;

      const query: Record<string, any> = {
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      };

      if (categoryId) {
        query.categoryId = new mongoose.Types.ObjectId(categoryId as string);
      }

      const items = await MenuItem.find(query).sort({ sortOrder: 1 });
      sendSuccess(res, items, 'Menu items retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async createMenuItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const {
        categoryId,
        name,
        description,
        price,
        imageUrl,
        isVegetarian,
        isSpicy,
        prepTimeMinutes,
        sortOrder,
        addOns,
      } = req.body;

      if (!categoryId || !name || price === undefined) {
        sendError(res, 'BAD_REQUEST', 'categoryId, name, and price are required', null, 400);
        return;
      }

      // Check price is positive integer
      if (!Number.isInteger(price) || price < 0) {
        sendError(res, 'BAD_REQUEST', 'Price must be a non-negative integer (paise/cents)', null, 400);
        return;
      }

      // Cross-category tenant leakage validation: Ensure category belongs to this restaurant
      const category = await Category.findOne({
        _id: categoryId,
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!category) {
        sendError(
          res,
          'BAD_REQUEST',
          'Invalid categoryId. The specified category does not exist for this restaurant.',
          null,
          400
        );
        return;
      }

      let finalSortOrder = sortOrder;
      if (finalSortOrder === undefined) {
        // Auto-increment sortOrder inside this category
        const lastItem = await MenuItem.findOne({
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          categoryId: new mongoose.Types.ObjectId(categoryId),
        }).sort({ sortOrder: -1 });
        finalSortOrder = lastItem ? lastItem.sortOrder + 1 : 0;
      }

      const menuItem = new MenuItem({
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        categoryId: new mongoose.Types.ObjectId(categoryId),
        name: name.trim(),
        description: description?.trim(),
        price,
        imageUrl: imageUrl?.trim(),
        isAvailable: true,
        isVegetarian: !!isVegetarian,
        isSpicy: !!isSpicy,
        prepTimeMinutes: prepTimeMinutes ? parseInt(prepTimeMinutes) : undefined,
        sortOrder: finalSortOrder,
        addOns,
      });

      await menuItem.save();
      sendSuccess(res, menuItem, 'Menu item created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async editMenuItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, itemId } = req.params;
      const updateData = { ...req.body };

      // Prevent manager from modifying restaurantId
      delete updateData.restaurantId;

      const item = await MenuItem.findOne({
        _id: itemId,
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!item) {
        sendError(res, 'MENU_ITEM_NOT_FOUND', 'Menu item not found', null, 404);
        return;
      }

      // Cross-category tenant validation if changing category
      if (updateData.categoryId && updateData.categoryId !== item.categoryId.toString()) {
        const category = await Category.findOne({
          _id: updateData.categoryId,
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
        });

        if (!category) {
          sendError(
            res,
            'BAD_REQUEST',
            'Invalid categoryId. The specified category does not exist for this restaurant.',
            null,
            400
          );
          return;
        }
        item.categoryId = new mongoose.Types.ObjectId(updateData.categoryId);
      }

      // Check price positive integer
      if (updateData.price !== undefined) {
        if (!Number.isInteger(updateData.price) || updateData.price < 0) {
          sendError(res, 'BAD_REQUEST', 'Price must be a non-negative integer (paise/cents)', null, 400);
          return;
        }
        item.price = updateData.price;
      }

      if (updateData.name !== undefined) item.name = updateData.name.trim();
      if (updateData.description !== undefined) item.description = updateData.description.trim();
      if (updateData.imageUrl !== undefined) item.imageUrl = updateData.imageUrl.trim();
      if (updateData.isAvailable !== undefined) item.isAvailable = !!updateData.isAvailable;
      if (updateData.isVegetarian !== undefined) item.isVegetarian = !!updateData.isVegetarian;
      if (updateData.isSpicy !== undefined) item.isSpicy = !!updateData.isSpicy;
      if (updateData.prepTimeMinutes !== undefined) {
        item.prepTimeMinutes = updateData.prepTimeMinutes ? parseInt(updateData.prepTimeMinutes) : undefined;
      }
      if (updateData.sortOrder !== undefined) item.sortOrder = updateData.sortOrder;
      if (updateData.addOns !== undefined) item.addOns = updateData.addOns;

      await item.save();
      sendSuccess(res, item, 'Menu item updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteMenuItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, itemId } = req.params;

      const item = await MenuItem.findOneAndDelete({
        _id: itemId,
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!item) {
        sendError(res, 'MENU_ITEM_NOT_FOUND', 'Menu item not found', null, 404);
        return;
      }

      sendSuccess(res, {}, 'Menu item deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async toggleAvailability(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, itemId } = req.params;

      const item = await MenuItem.findOne({
        _id: itemId,
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!item) {
        sendError(res, 'MENU_ITEM_NOT_FOUND', 'Menu item not found', null, 404);
        return;
      }

      item.isAvailable = !item.isAvailable;
      await item.save();

      sendSuccess(res, item, 'Menu item availability toggled successfully');
    } catch (error) {
      next(error);
    }
  }

  async bulkAvailability(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const { itemIds, isAvailable } = req.body;

      if (!Array.isArray(itemIds) || isAvailable === undefined) {
        sendError(res, 'BAD_REQUEST', 'itemIds (array) and isAvailable (boolean) are required', null, 400);
        return;
      }

      const objectIds = itemIds.map((id: string) => new mongoose.Types.ObjectId(id));

      await MenuItem.updateMany(
        {
          _id: { $in: objectIds },
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
        },
        { isAvailable: !!isAvailable }
      );

      sendSuccess(res, {}, 'Bulk availability updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async reorderMenuItems(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const { itemIds, categoryId } = req.body;

      if (!Array.isArray(itemIds) || !categoryId) {
        sendError(res, 'BAD_REQUEST', 'itemIds (array) and categoryId are required', null, 400);
        return;
      }

      const bulkOps = itemIds.map((id: string, index: number) => ({
        updateOne: {
          filter: {
            _id: new mongoose.Types.ObjectId(id),
            categoryId: new mongoose.Types.ObjectId(categoryId),
            restaurantId: new mongoose.Types.ObjectId(restaurantId),
          },
          update: { sortOrder: index },
        },
      }));

      await MenuItem.bulkWrite(bulkOps);
      sendSuccess(res, {}, 'Menu items reordered successfully');
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // CLOUDINARY DIRECT UPLOADS
  // ==========================================

  async getUploadSignature(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const signatureDetails = cloudinaryService.generateUploadSignature(restaurantId);

      sendSuccess(res, signatureDetails, 'Upload signature generated successfully');
    } catch (error) {
      next(error);
    }
  }
}
export default MenuController;
