import { Request, Response, NextFunction } from 'express';
import { Restaurant } from '../models/Restaurant';
import { Table } from '../models/Table';
import { Category } from '../models/Category';
import { MenuItem } from '../models/MenuItem';
import { Order, OrderCounter } from '../models/Order';
import { IntegrationSyncLog } from '../models/IntegrationSyncLog';
import { IntegrationFactory } from '../integrations/core/IntegrationFactory';
import { sendSuccess, sendError } from '../utils/response';
import { NotificationService } from '../services/notification.service';
import mongoose from 'mongoose';

export class PublicController {
  constructor() {
    this.resolveTable = this.resolveTable.bind(this);
    this.getMenu = this.getMenu.bind(this);
    this.createOrder = this.createOrder.bind(this);
    this.getOrder = this.getOrder.bind(this);
    this.getOrderStatus = this.getOrderStatus.bind(this);
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
          taxRatePercent: restaurant.taxRatePercent,
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

  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantSlug, tableToken } = req.params;
      const { items, customerNote, customerPhone, paymentStatus } = req.body;

      if (!restaurantSlug || !tableToken) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // 1. Resolve table & restaurant
      const restaurant = await Restaurant.findOne({ slug: restaurantSlug.toLowerCase().trim() });
      if (!restaurant || !restaurant.isActive) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      const table = await Table.findOne({ token: tableToken, restaurantId: restaurant.id });
      if (!table || !table.isActive) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        sendError(res, 'BAD_REQUEST', 'Order items are required and must be a non-empty array', null, 400);
        return;
      }

      // 2. Preload categories to verify active state quickly
      const categories = await Category.find({ restaurantId: restaurant._id });
      const categoryMap = new Map(categories.map((c) => [c._id.toString(), c]));

      // 3. Validate items
      const failedItems: { menuItemId: string; name: string; reason: 'unavailable' | 'category_inactive' }[] = [];
      const validatedItems = [];

      for (const item of items) {
        if (!item.itemId) {
          sendError(res, 'BAD_REQUEST', 'Each order item must specify an itemId', null, 400);
          return;
        }

        const menuItem = await MenuItem.findById(item.itemId);
        if (!menuItem || menuItem.restaurantId.toString() !== restaurant._id.toString()) {
          failedItems.push({
            menuItemId: item.itemId,
            name: item.name || 'Unknown Item',
            reason: 'unavailable',
          });
          continue;
        }

        const category = categoryMap.get(menuItem.categoryId.toString());

        // Check isAvailable
        if (!menuItem.isAvailable) {
          failedItems.push({
            menuItemId: item.itemId,
            name: menuItem.name,
            reason: 'unavailable',
          });
          continue;
        }

        // Check Category isActive
        if (!category || !category.isActive) {
          failedItems.push({
            menuItemId: item.itemId,
            name: menuItem.name,
            reason: 'category_inactive',
          });
          continue;
        }

        // 4. Re-calculate prices server-side
        let unitPriceSnapshot = menuItem.price;
        const selectedAddOns = [];

        if (item.selectedAddOns && Array.isArray(item.selectedAddOns)) {
          for (const selected of item.selectedAddOns) {
            const match = menuItem.addOns?.find((addon) => addon.name === selected.name);
            if (match) {
              unitPriceSnapshot += match.priceDelta;
              selectedAddOns.push({
                name: match.name,
                priceDelta: match.priceDelta,
              });
            }
          }
        }

        validatedItems.push({
          menuItemId: menuItem._id,
          nameSnapshot: menuItem.name,
          unitPriceSnapshot,
          quantity: item.quantity || 1,
          selectedAddOns,
          specialInstructions: item.specialInstructions || '',
        });
      }

      // If any item failed validation, reject the whole order with ITEMS_UNAVAILABLE
      if (failedItems.length > 0) {
        sendError(
          res,
          'ITEMS_UNAVAILABLE',
          'Some items in your basket are currently unavailable.',
          failedItems,
          400
        );
        return;
      }

      // 5. Calculate Subtotal, Tax, Total
      const subtotal = validatedItems.reduce((sum, item) => sum + item.unitPriceSnapshot * item.quantity, 0);
      const tax = Math.round(subtotal * ((restaurant.taxRatePercent || 0) / 100));
      const total = subtotal + tax;

      // 6. Generate sequential orderNumber atomically
      const counter = await OrderCounter.findOneAndUpdate(
        { restaurantId: restaurant._id },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      const orderNumber = counter.seq;

      // 7. Create the Order
      const order = new Order({
        restaurantId: restaurant._id,
        tableId: table._id,
        orderNumber,
        items: validatedItems,
        subtotal,
        tax,
        total,
        customerNote: customerNote || '',
        status: 'PENDING',
        source: 'QR',
        customerPhone: customerPhone || undefined,
        paymentStatus: paymentStatus || 'PENDING',
        integrationMetadata: {},
      });

      await order.save();

      // Trigger POS integration push as an asynchronous, non-blocking side-effect
      try {
        const providerName = restaurant.integrationConfig?.provider || 'NONE';
        const syncLog = new IntegrationSyncLog({
          restaurantId: restaurant._id,
          orderId: order._id,
          provider: providerName,
          status: 'ORDER_SYNC_PENDING',
          syncAttempts: 1,
        });
        await syncLog.save();

        const adapter = IntegrationFactory.getAdapter(providerName);
        adapter.pushOrder(order)
          .then(async () => {
            syncLog.status = 'ORDER_SYNCED';
            await syncLog.save();
          })
          .catch(async (err: any) => {
            syncLog.status = 'ORDER_SYNC_FAILED';
            syncLog.errorLog = err.message || 'Unknown integration error';
            await syncLog.save();
          });
      } catch (integrationErr) {
        console.error('Failed to trigger POS integration sync:', integrationErr);
      }

      // Emit order:created via central NotificationService
      try {
        const orderSummary = {
          _id: order._id,
          restaurantId: order.restaurantId,
          tableId: {
            _id: table._id,
            displayName: table.displayName,
            tableNumber: table.tableNumber,
          },
          orderNumber: order.orderNumber,
          items: order.items,
          subtotal: order.subtotal,
          tax: order.tax,
          total: order.total,
          customerNote: order.customerNote,
          status: order.status,
          source: order.source,
          createdAt: order.createdAt,
        };
        NotificationService.getInstance().notifyOrderCreated(order.restaurantId.toString(), orderSummary);
      } catch (err) {
        console.error('Failed to notify order creation:', err);
      }

      sendSuccess(res, order, 'Order placed successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      const order = await Order.findById(orderId);
      if (!order) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      sendSuccess(res, order, 'Order retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      const order = await Order.findById(orderId).select('status');
      if (!order) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      sendSuccess(res, { status: order.status }, 'Order status retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}
export default PublicController;
