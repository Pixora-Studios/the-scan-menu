import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Order, OrderStatus } from '../models/Order';
import { TableSession } from '../models/TableSession';
import { validateStatusTransition, getOrderStatusRollup } from '../utils/orderStateMachine';
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
    this.updateItemStatus = this.updateItemStatus.bind(this);
    this.getTableSession = this.getTableSession.bind(this);
    this.closeTableSession = this.closeTableSession.bind(this);
  }

  async getAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;

      const start = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().setHours(0,0,0,0));
      const end = req.query.endDate ? new Date(req.query.endDate as string) : new Date(new Date().setHours(23,59,59,999));

      const durationMs = end.getTime() - start.getTime();
      const priorStart = new Date(start.getTime() - durationMs);
      const priorEnd = new Date(start.getTime() - 1);

      const rId = new mongoose.Types.ObjectId(restaurantId);

      // Helper function to get summary metrics
      const getSummaryMetrics = async (rangeStart: Date, rangeEnd: Date) => {
        const stats = await Order.aggregate([
          { $match: { restaurantId: rId, status: { $ne: 'CANCELLED' }, createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
          { $group: {
              _id: null,
              revenue: { $sum: "$total" },
              orderCount: { $sum: 1 }
            }
          }
        ]);

        const fulfillment = await Order.aggregate([
          { $match: { restaurantId: rId, status: 'SERVED', createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
          { $project: { durationMs: { $subtract: ["$updatedAt", "$createdAt"] } } },
          { $group: { _id: null, avgFulfillmentMs: { $avg: "$durationMs" } } }
        ]);

        const revenue = stats[0]?.revenue || 0;
        const orderCount = stats[0]?.orderCount || 0;
        const averageOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
        const avgFulfillmentTimeMinutes = fulfillment[0]?.avgFulfillmentMs
          ? Math.round(fulfillment[0].avgFulfillmentMs / 60000 * 10) / 10
          : 0;

        return { revenue, orderCount, averageOrderValue, avgFulfillmentTimeMinutes };
      };

      const currentMetrics = await getSummaryMetrics(start, end);
      const priorMetrics = await getSummaryMetrics(priorStart, priorEnd);

      // Time-series Chart bucketing
      const isSingleDay = durationMs <= 28 * 60 * 60 * 1000;
      const dateFormat = isSingleDay ? "%H:00" : "%Y-%m-%d";

      const timeSeriesData = await Order.aggregate([
        { $match: { restaurantId: rId, status: { $ne: 'CANCELLED' }, createdAt: { $gte: start, $lte: end } } },
        { $group: {
            _id: { $dateToString: { format: dateFormat, date: "$createdAt", timezone: "Asia/Kolkata" } },
            revenue: { $sum: "$total" },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const formattedTimeSeries = timeSeriesData.map(item => ({
        label: item._id,
        revenue: item.revenue,
        orders: item.orders
      }));

      // Top Selling Menu Items
      const topItems = await Order.aggregate([
        { $match: { restaurantId: rId, status: { $ne: 'CANCELLED' }, createdAt: { $gte: start, $lte: end } } },
        { $unwind: "$items" },
        { $group: {
            _id: "$items.nameSnapshot",
            name: { $first: "$items.nameSnapshot" },
            quantity: { $sum: "$items.quantity" },
            revenue: { $sum: { $multiply: ["$items.unitPriceSnapshot", "$items.quantity"] } }
          }
        },
        { $sort: { quantity: -1 } },
        { $limit: 10 }
      ]);

      // Order status count distribution
      const statusCounts = await Order.aggregate([
        { $match: { restaurantId: rId, createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);

      const statusMap: Record<string, number> = {
        PENDING: 0, ACCEPTED: 0, PREPARING: 0, READY: 0, SERVED: 0, CANCELLED: 0
      };
      statusCounts.forEach(item => {
        if (item._id in statusMap) {
          statusMap[item._id] = item.count;
        }
      });

      // Table Turnover
      const tableTurnoverRaw = await Order.aggregate([
        { $match: { restaurantId: rId, status: { $ne: 'CANCELLED' }, createdAt: { $gte: start, $lte: end } } },
        { $group: {
            _id: "$tableId",
            orderCount: { $sum: 1 },
            revenue: { $sum: "$total" }
          }
        },
        { $lookup: { from: "tables", localField: "_id", foreignField: "_id", as: "tableInfo" } },
        { $unwind: { path: "$tableInfo", preserveNullAndEmptyArrays: true } },
        { $project: {
            tableNumber: { $ifNull: ["$tableInfo.tableNumber", "Unknown"] },
            displayName: { $ifNull: ["$tableInfo.displayName", "Unknown Table"] },
            orderCount: 1,
            revenue: 1,
            averageOrderValue: { $cond: [{ $gt: ["$orderCount", 0] }, { $round: [{ $divide: ["$revenue", "$orderCount"] }] }, 0] }
          }
        },
        { $sort: { revenue: -1 } }
      ]);

      // Raw orders populated with table name for CSV download
      const rawOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: start, $lte: end } })
        .sort({ createdAt: -1 })
        .populate('tableId', 'displayName tableNumber');

      const csvData = rawOrders.map(order => ({
        orderNumber: order.orderNumber,
        tableName: (order.tableId as any)?.displayName || 'Unknown',
        createdAt: order.createdAt,
        status: order.status,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        total: order.total
      }));

      const analyticsData = {
        summary: {
          current: currentMetrics,
          prior: priorMetrics
        },
        charts: {
          timeSeries: formattedTimeSeries,
          topSellingItems: topItems,
          orderStatusDistribution: statusMap
        },
        tablesTurnover: tableTurnoverRaw,
        rawOrdersForCsv: csvData
      };

      sendSuccess(res, analyticsData, 'Analytics retrieved successfully');
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

  async updateItemStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, orderId, itemIndex: itemIndexStr } = req.params;
      const { itemStatus: nextItemStatus } = req.body;

      const itemIndex = parseInt(itemIndexStr, 10);

      if (isNaN(itemIndex) || !nextItemStatus) {
        sendError(res, 'BAD_REQUEST', 'Item index and itemStatus are required', null, 400);
        return;
      }

      if (!['PENDING', 'PREPARING', 'READY', 'SERVED'].includes(nextItemStatus)) {
        sendError(res, 'BAD_REQUEST', 'Invalid itemStatus value', null, 400);
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

      if (itemIndex < 0 || itemIndex >= order.items.length) {
        sendError(res, 'BAD_REQUEST', 'Invalid item index', null, 400);
        return;
      }

      const item = order.items[itemIndex];
      const currentItemStatus = item.itemStatus || 'PENDING';

      // Validate simple forward-only transitions (PENDING -> PREPARING -> READY -> SERVED), no skipping backwards.
      const statusSeverity = { PENDING: 0, PREPARING: 1, READY: 2, SERVED: 3 };
      if (statusSeverity[nextItemStatus] < statusSeverity[currentItemStatus]) {
        sendError(res, 'BAD_REQUEST', `Cannot change item status backwards from ${currentItemStatus} to ${nextItemStatus}`, null, 400);
        return;
      }

      item.itemStatus = nextItemStatus as any;
      if (nextItemStatus === 'SERVED') {
        item.servedAt = new Date();
      }

      const previousAggregateStatus = order.status;

      // This will trigger pre-save hook and save
      await order.save();

      // Emit item status updated via socket
      try {
        NotificationService.getInstance().notifyItemStatusUpdated(
          order.restaurantId.toString(),
          order._id.toString(),
          itemIndex,
          nextItemStatus,
          order.updatedAt
        );
      } catch (err) {
        console.error('Failed to notify item status update:', err);
      }

      // If aggregate status changed as a result of item update, emit order:status_updated
      if (order.status !== previousAggregateStatus) {
        try {
          NotificationService.getInstance().notifyOrderStatusUpdated(
            order.restaurantId.toString(),
            order._id.toString(),
            order.status,
            order.updatedAt
          );
        } catch (err) {
          console.error('Failed to notify order status update from item status update:', err);
        }
      }

      // Also notify session updated (as totals / rounds progress)
      if (order.sessionId) {
        try {
          const session = await TableSession.findById(order.sessionId);
          if (session) {
            NotificationService.getInstance().notifySessionUpdated(
              order.restaurantId.toString(),
              session._id.toString(),
              session
            );
          }
        } catch (err) {
          console.error('Failed to notify session update:', err);
        }
      }

      sendSuccess(res, order, 'Item status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getTableSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, sessionId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        sendError(res, 'SESSION_NOT_FOUND', 'Session not found', null, 404);
        return;
      }

      const session = await TableSession.findOne({
        _id: new mongoose.Types.ObjectId(sessionId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!session) {
        sendError(res, 'SESSION_NOT_FOUND', 'Session not found', null, 404);
        return;
      }

      const orders = await Order.find({ sessionId: session._id }).sort({ roundNumber: 1 });

      sendSuccess(res, { session, orders }, 'Session retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async closeTableSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, sessionId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        sendError(res, 'SESSION_NOT_FOUND', 'Session not found', null, 404);
        return;
      }

      const session = await TableSession.findOne({
        _id: new mongoose.Types.ObjectId(sessionId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!session) {
        sendError(res, 'SESSION_NOT_FOUND', 'Session not found', null, 404);
        return;
      }

      session.status = 'CLOSED';
      session.closedAt = new Date();
      await session.save();

      // Settle payment status on all orders inside the session to PAID
      await Order.updateMany(
        { sessionId: session._id },
        { $set: { paymentStatus: 'PAID' } }
      );

      // Notify session updated
      try {
        NotificationService.getInstance().notifySessionUpdated(
          session.restaurantId.toString(),
          session._id.toString(),
          session
        );
      } catch (err) {
        console.error('Failed to notify session update:', err);
      }

      sendSuccess(res, session, 'Table session closed and settled successfully');
    } catch (error) {
      next(error);
    }
  }
}
export default OrderController;
