import { Request, Response, NextFunction } from 'express';
import { Restaurant } from '../models/Restaurant';
import { Table } from '../models/Table';
import { sendSuccess, sendError } from '../utils/response';

export class PublicController {
  constructor() {
    this.resolveTable = this.resolveTable.bind(this);
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
}
export default PublicController;
