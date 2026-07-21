import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Order, OrderStatus } from '../models/Order';
import { validateStatusTransition } from '../utils/orderStateMachine';
import { sendSuccess, sendError } from '../utils/response';
import { SocketService } from '../sockets/socket.service';
import mongoose from 'mongoose';

export class OrderController {
  constructor() {
    this.listOrders = this.listOrders.bind(this);
    this.listActiveOrders = this.listActiveOrders.bind(this);
    this.getOrderDetails = this.getOrderDetails.bind(this);
    this.updateOrderStatus = this.updateOrderStatus.bind(this);
    this.cancelOrder = this.cancelOrder.bind(this);
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

      // Emit order:status_updated to both order:{orderId} and restaurant:{restaurantId} rooms
      try {
        const io = SocketService.getInstance().getIO();
        const payload = {
          orderId: order._id,
          status: order.status,
          updatedAt: order.updatedAt,
        };
        io.to(`order:${order._id.toString()}`).emit('order:status_updated', payload);
        io.to(`restaurant:${order.restaurantId.toString()}`).emit('order:status_updated', payload);
      } catch (err) {
        console.error('Failed to emit order:status_updated socket event:', err);
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

      // Emit order:status_updated to both order:{orderId} and restaurant:{restaurantId} rooms
      try {
        const io = SocketService.getInstance().getIO();
        const payload = {
          orderId: order._id,
          status: order.status,
          updatedAt: order.updatedAt,
        };
        io.to(`order:${order._id.toString()}`).emit('order:status_updated', payload);
        io.to(`restaurant:${order.restaurantId.toString()}`).emit('order:status_updated', payload);
      } catch (err) {
        console.error('Failed to emit order:status_updated socket event for cancellation:', err);
      }

      sendSuccess(res, order, 'Order cancelled successfully');
    } catch (error) {
      next(error);
    }
  }
}
export default OrderController;
