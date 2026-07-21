import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Order, OrderStatus } from '../models/Order';
import { validateStatusTransition } from '../utils/orderStateMachine';
import { sendSuccess, sendError } from '../utils/response';
import { NotificationService } from '../services/notification.service';
import mongoose from 'mongoose';

export class OrderController {
  constructor() {
    this.listOrders = this.listOrders.bind(this);
    this.listActiveOrders = this.listActiveOrders.bind(this);
    this.getOrderDetails = this.getOrderDetails.bind(this);
    this.updateOrderStatus = this.updateOrderStatus.bind(this);
    this.cancelOrder = this.cancelOrder.bind(this);
    this.getAnalytics = this.getAnalytics.bind(this);
  }

  async getAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const { startDate, endDate, priorStartDate, priorEndDate } = req.query;

      if (!startDate || !endDate) {
        sendError(res, 'BAD_REQUEST', 'startDate and endDate are required query parameters', null, 400);
        return;
      }

      const currentStart = new Date(startDate as string);
      const currentEnd = new Date(endDate as string);

      if (isNaN(currentStart.getTime()) || isNaN(currentEnd.getTime())) {
        sendError(res, 'BAD_REQUEST', 'Invalid current date format', null, 400);
        return;
      }

      // Default prior range to same length as current range if not provided
      let priorStart: Date;
      let priorEnd: Date;
      if (priorStartDate && priorEndDate) {
        priorStart = new Date(priorStartDate as string);
        priorEnd = new Date(priorEndDate as string);
      } else {
        const rangeMs = currentEnd.getTime() - currentStart.getTime();
        priorStart = new Date(currentStart.getTime() - rangeMs);
        priorEnd = new Date(currentEnd.getTime() - rangeMs);
      }

      if (isNaN(priorStart.getTime()) || isNaN(priorEnd.getTime())) {
        sendError(res, 'BAD_REQUEST', 'Invalid prior date format', null, 400);
        return;
      }

      const restIdObj = new mongoose.Types.ObjectId(restaurantId);

      // Fetch current period orders
      const currentOrders = await Order.find({
        restaurantId: restIdObj,
        createdAt: { $gte: currentStart, $lte: currentEnd },
      }).populate('tableId', 'displayName tableNumber');

      // Fetch prior period orders
      const priorOrders = await Order.find({
        restaurantId: restIdObj,
        createdAt: { $gte: priorStart, $lte: priorEnd },
      });

      // Helper function to calculate metrics from an orders array
      const calculateMetrics = (orders: any[]) => {
        let revenue = 0;
        const totalCount = orders.length;
        let nonCancelledCount = 0;
        let fulfillmentSumMs = 0;
        let servedCount = 0;

        for (const order of orders) {
          if (order.status !== 'CANCELLED') {
            revenue += order.total; // total in cents/paise
            nonCancelledCount++;
          }
          if (order.status === 'SERVED') {
            const duration = order.updatedAt.getTime() - order.createdAt.getTime();
            if (duration >= 0) {
              fulfillmentSumMs += duration;
              servedCount++;
            }
          }
        }

        const aov = nonCancelledCount > 0 ? Math.round(revenue / nonCancelledCount) : 0;
        const fulfillmentTime = servedCount > 0 ? parseFloat((fulfillmentSumMs / servedCount / 60000).toFixed(2)) : 0; // minutes

        return {
          revenue,
          orderCount: totalCount,
          nonCancelledCount,
          aov,
          fulfillmentTime,
        };
      };

      const currentMetrics = calculateMetrics(currentOrders);
      const priorMetrics = calculateMetrics(priorOrders);

      // Helper for percent change
      const getPercentChange = (current: number, prior: number): number => {
        if (prior === 0) {
          return current > 0 ? 100 : 0;
        }
        return parseFloat((((current - prior) / prior) * 100).toFixed(2));
      };

      const summary = {
        revenue: {
          current: currentMetrics.revenue,
          prior: priorMetrics.revenue,
          change: getPercentChange(currentMetrics.revenue, priorMetrics.revenue),
        },
        orderCount: {
          current: currentMetrics.orderCount,
          prior: priorMetrics.orderCount,
          change: getPercentChange(currentMetrics.orderCount, priorMetrics.orderCount),
        },
        aov: {
          current: currentMetrics.aov,
          prior: priorMetrics.aov,
          change: getPercentChange(currentMetrics.aov, priorMetrics.aov),
        },
        fulfillmentTime: {
          current: currentMetrics.fulfillmentTime,
          prior: priorMetrics.fulfillmentTime,
          change: getPercentChange(currentMetrics.fulfillmentTime, priorMetrics.fulfillmentTime),
        },
      };

      // 2. Timeline aggregation (hours for < 28h range, days for larger ranges)
      const rangeMs = currentEnd.getTime() - currentStart.getTime();
      const isMultiDay = rangeMs > 28 * 60 * 60 * 1000;
      const timelineMap: Record<string, { label: string; revenue: number; orderCount: number }> = {};

      if (isMultiDay) {
        const temp = new Date(currentStart);
        while (temp <= currentEnd) {
          const dayStr = temp.toISOString().split('T')[0];
          timelineMap[dayStr] = { label: dayStr, revenue: 0, orderCount: 0 };
          temp.setDate(temp.getDate() + 1);
        }

        for (const order of currentOrders) {
          if (order.status !== 'CANCELLED') {
            const dayStr = order.createdAt.toISOString().split('T')[0];
            if (timelineMap[dayStr]) {
              timelineMap[dayStr].revenue += order.total;
              timelineMap[dayStr].orderCount += 1;
            }
          }
        }
      } else {
        for (let h = 0; h < 24; h++) {
          const label = `${String(h).padStart(2, '0')}:00`;
          timelineMap[label] = { label, revenue: 0, orderCount: 0 };
        }

        for (const order of currentOrders) {
          if (order.status !== 'CANCELLED') {
            const hour = order.createdAt.getUTCHours();
            const label = `${String(hour).padStart(2, '0')}:00`;
            if (timelineMap[label]) {
              timelineMap[label].revenue += order.total;
              timelineMap[label].orderCount += 1;
            }
          }
        }
      }

      const timeline = Object.values(timelineMap);

      // 3. Top selling items
      const itemsMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
      for (const order of currentOrders) {
        if (order.status !== 'CANCELLED') {
          for (const item of order.items) {
            const key = item.nameSnapshot;
            if (!itemsMap[key]) {
              itemsMap[key] = { name: item.nameSnapshot, quantity: 0, revenue: 0 };
            }
            itemsMap[key].quantity += item.quantity;
            itemsMap[key].revenue += item.unitPriceSnapshot * item.quantity;
          }
        }
      }

      const topSelling = Object.values(itemsMap).sort((a, b) => b.quantity - a.quantity);

      // 4. Order status breakdown
      const statusCounts: Record<string, number> = {
        PENDING: 0,
        ACCEPTED: 0,
        PREPARING: 0,
        READY: 0,
        SERVED: 0,
        CANCELLED: 0,
      };

      for (const order of currentOrders) {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
      }

      const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
      }));

      // 5. Table Turnover View
      const tableMap: Record<string, { tableId: string; displayName: string; tableNumber: string; orderCount: number; revenue: number; aov: number }> = {};
      for (const order of currentOrders) {
        const table = order.tableId as any;
        const tableIdStr = table ? table._id?.toString() || table.toString() : 'unknown';
        const displayName = table?.displayName || 'Unknown Table';
        const tableNumber = table?.tableNumber || 'N/A';

        if (!tableMap[tableIdStr]) {
          tableMap[tableIdStr] = {
            tableId: tableIdStr,
            displayName,
            tableNumber,
            orderCount: 0,
            revenue: 0,
            aov: 0,
          };
        }

        tableMap[tableIdStr].orderCount += 1;
        if (order.status !== 'CANCELLED') {
          tableMap[tableIdStr].revenue += order.total;
        }
      }

      for (const key of Object.keys(tableMap)) {
        const t = tableMap[key];
        t.aov = t.orderCount > 0 ? Math.round(t.revenue / t.orderCount) : 0;
      }

      const tables = Object.values(tableMap);

      // 6. Orders list for CSV export
      const ordersList = currentOrders.map((order) => {
        const table = order.tableId as any;
        const displayName = table?.displayName || 'Unknown Table';
        return {
          orderNumber: order.orderNumber,
          tableName: displayName,
          createdAt: order.createdAt,
          status: order.status,
          itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          total: order.total,
        };
      });

      const responseData = {
        summary,
        charts: {
          timeline,
          topSelling,
          statusBreakdown,
        },
        tables,
        ordersList,
      };

      sendSuccess(res, responseData, 'Analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async listOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const statusFilter = req.query.status as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const query: Record<string, any> = {
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      };

      if (statusFilter) {
        query.status = statusFilter;
      }

      const total = await Order.countDocuments(query);
      const orders = await Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const responseData = {
        orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };

      sendSuccess(res, responseData, 'Orders retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async listActiveOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;

      // Active orders are defined as anything not SERVED and not CANCELLED
      const query = {
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        status: { $nin: ['SERVED', 'CANCELLED'] },
      };

      const orders = await Order.find(query).sort({ createdAt: 1 }); // Oldest first for kitchen prep queues
      sendSuccess(res, orders, 'Active orders retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getOrderDetails(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, orderId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      const order = await Order.findOne({
        _id: new mongoose.Types.ObjectId(orderId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!order) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      sendSuccess(res, order, 'Order retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateOrderStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, orderId } = req.params;
      const { status: nextStatus } = req.body;
      const user = req.user!;

      if (!nextStatus) {
        sendError(res, 'BAD_REQUEST', 'Status body parameter is required', null, 400);
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      const order = await Order.findOne({
        _id: new mongoose.Types.ObjectId(orderId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!order) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      // Check transition validity using central state machine logic
      const validation = validateStatusTransition(order.status, nextStatus as OrderStatus, user.role as 'SUPER_ADMIN' | 'MANAGER' | 'STAFF');

      if (!validation.isValid) {
        if (validation.errorCode === 'FORBIDDEN') {
          sendError(res, 'FORBIDDEN', validation.errorMessage || 'Access denied.', null, 403);
        } else {
          sendError(res, 'INVALID_STATUS_TRANSITION', validation.errorMessage || 'Invalid transition.', null, 400);
        }
        return;
      }

      order.status = nextStatus as OrderStatus;
      await order.save();

      // Emit order:status_updated via central NotificationService
      try {
        NotificationService.getInstance().notifyOrderStatusUpdated(
          order.restaurantId.toString(),
          order._id.toString(),
          order.status,
          order.updatedAt
        );
      } catch (err) {
        console.error('Failed to notify order status update:', err);
      }

      sendSuccess(res, order, 'Order status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async cancelOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, orderId } = req.params;
      const user = req.user!;

      // STAFF is blocked from cancel
      if (user.role !== 'MANAGER' && user.role !== 'SUPER_ADMIN') {
        sendError(res, 'FORBIDDEN', 'Only managers can cancel orders', null, 403);
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      const order = await Order.findOne({
        _id: new mongoose.Types.ObjectId(orderId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!order) {
        sendError(res, 'ORDER_NOT_FOUND', 'Order not found', null, 404);
        return;
      }

      // Run status transition validator to check if cancelling from current state is allowed
      const validation = validateStatusTransition(order.status, 'CANCELLED', user.role);

      if (!validation.isValid) {
        sendError(res, 'INVALID_STATUS_TRANSITION', validation.errorMessage || 'Invalid transition.', null, 400);
        return;
      }

      order.status = 'CANCELLED';
      await order.save();

      // Emit order:status_updated via central NotificationService
      try {
        NotificationService.getInstance().notifyOrderStatusUpdated(
          order.restaurantId.toString(),
          order._id.toString(),
          order.status,
          order.updatedAt
        );
      } catch (err) {
        console.error('Failed to notify order status update on cancel:', err);
      }

      sendSuccess(res, order, 'Order cancelled successfully');
    } catch (error) {
      next(error);
    }
  }
}
export default OrderController;
