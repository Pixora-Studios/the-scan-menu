import { Request, Response, NextFunction } from 'express';
import { Restaurant } from '../models/Restaurant';
import { Table } from '../models/Table';
import { Category } from '../models/Category';
import { MenuItem } from '../models/MenuItem';
import { sendSuccess, sendError } from '../utils/response';

export class PublicController {
  constructor() {
    this.resolveTable = this.resolveTable.bind(this);
    this.getMenu = this.getMenu.bind(this);
  }

  async resolveTable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantSlug, tableToken } = req.params;

      if (!restaurantSlug || !tableToken) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // 1. Fetch restaurant by slug
      const restaurant = await Restaurant.findOne({ slug: restaurantSlug.toLowerCase().trim() });
      if (!restaurant || !restaurant.isActive) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // 2. Fetch table by token
      const table = await Table.findOne({ token: tableToken, restaurantId: restaurant.id });
      if (!table || !table.isActive) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // Success payload
      const responseData = {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          logoUrl: restaurant.logoUrl,
          coverImageUrl: restaurant.coverImageUrl,
          description: restaurant.description,
          theme: restaurant.theme,
          currency: restaurant.currency,
          timezone: restaurant.timezone,
        },
        table: {
          id: table.id,
          displayName: table.displayName,
          tableNumber: table.tableNumber,
          token: table.token,
        },
      };

      sendSuccess(res, responseData, 'Table resolved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantSlug, tableToken } = req.params;

      if (!restaurantSlug || !tableToken) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // 1. Fetch restaurant by slug
      const restaurant = await Restaurant.findOne({ slug: restaurantSlug.toLowerCase().trim() });
      if (!restaurant || !restaurant.isActive) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // 2. Fetch table by token (to verify the table is valid/active)
      const table = await Table.findOne({ token: tableToken, restaurantId: restaurant.id });
      if (!table || !table.isActive) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // 3. Fetch active categories for this restaurant
      const categories = await Category.find({
        restaurantId: restaurant._id,
        isActive: true,
      }).sort({ sortOrder: 1 });

      // 4. Fetch all menu items for this restaurant
      const menuItems = await MenuItem.find({
        restaurantId: restaurant._id,
      }).sort({ sortOrder: 1 });

      // 5. Group menu items inside categories
      const categoriesWithItems = categories.map((category) => {
        const items = menuItems.filter(
          (item) => item.categoryId.toString() === category._id.toString()
        );
        return {
          _id: category._id,
          name: category.name,
          description: category.description,
          imageUrl: category.imageUrl,
          sortOrder: category.sortOrder,
          menuItems: items,
        };
      });

      sendSuccess(res, categoriesWithItems, 'Public menu retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}
export default PublicController;
