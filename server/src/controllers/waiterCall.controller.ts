import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Restaurant } from '../models/Restaurant';
import { Table } from '../models/Table';
import { WaiterCall } from '../models/WaiterCall';
import { validateWaiterCallTransition } from '../utils/waiterCallStateMachine';
import { NotificationService } from '../services/notification.service';
import { sendSuccess, sendError } from '../utils/response';
import mongoose from 'mongoose';

export class WaiterCallController {
  constructor() {
    this.createWaiterCall = this.createWaiterCall.bind(this);
    this.getActiveWaiterCall = this.getActiveWaiterCall.bind(this);
    this.listWaiterCalls = this.listWaiterCalls.bind(this);
    this.acknowledgeWaiterCall = this.acknowledgeWaiterCall.bind(this);
    this.resolveWaiterCall = this.resolveWaiterCall.bind(this);
  }

  // ==========================================
  // PUBLIC ENDPOINTS
  // ==========================================

  async createWaiterCall(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tableToken } = req.params;

      if (!tableToken) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // 1. Resolve table and restaurant
      const table = await Table.findOne({ token: tableToken });
      if (!table || !table.isActive) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      const restaurant = await Restaurant.findById(table.restaurantId);
      if (!restaurant || !restaurant.isActive) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // 2. Deduplication rate limit check: Check for existing active PENDING/ACKNOWLEDGED call
      const existingCall = await WaiterCall.findOne({
        tableId: table._id,
        status: { $in: ['PENDING', 'ACKNOWLEDGED'] },
      });

      if (existingCall) {
        // Return existing open call rather than creating duplicate
        sendSuccess(res, existingCall, 'An active waiter call already exists for this table');
        return;
      }

      // 3. Create Waiter Call
      const waiterCall = new WaiterCall({
        restaurantId: restaurant._id,
        tableId: table._id,
        tableNumberSnapshot: table.tableNumber,
        status: 'PENDING',
      });

      await waiterCall.save();

      // Emit waiter_call:created to restaurant:{restaurantId} room via central NotificationService
      try {
        const payload = {
          _id: waiterCall._id,
          restaurantId: waiterCall.restaurantId,
          tableId: waiterCall.tableId,
          tableNumberSnapshot: waiterCall.tableNumberSnapshot,
          status: waiterCall.status,
          createdAt: waiterCall.createdAt,
        };
        NotificationService.getInstance().notifyWaiterCallCreated(restaurant._id.toString(), payload);
      } catch (err) {
        console.error('Failed to notify waiter call creation:', err);
      }

      sendSuccess(res, waiterCall, 'Waiter called successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getActiveWaiterCall(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tableToken } = req.params;

      if (!tableToken) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // Resolve table
      const table = await Table.findOne({ token: tableToken });
      if (!table || !table.isActive) {
        sendError(res, 'TABLE_NOT_FOUND', 'The specified table or restaurant was not found', null, 404);
        return;
      }

      // Find any PENDING or ACKNOWLEDGED call
      const activeCall = await WaiterCall.findOne({
        tableId: table._id,
        status: { $in: ['PENDING', 'ACKNOWLEDGED'] },
      });

      sendSuccess(res, activeCall, 'Active waiter call retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // STAFF/MANAGER ENDPOINTS (Requires Auth)
  // ==========================================

  async listWaiterCalls(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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

      const total = await WaiterCall.countDocuments(query);
      const waiterCalls = await WaiterCall.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const responseData = {
        waiterCalls,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };

      sendSuccess(res, responseData, 'Waiter calls retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async acknowledgeWaiterCall(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, callId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(callId)) {
        sendError(res, 'WAITER_CALL_NOT_FOUND', 'Waiter call record not found', null, 404);
        return;
      }

      const waiterCall = await WaiterCall.findOne({
        _id: new mongoose.Types.ObjectId(callId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!waiterCall) {
        sendError(res, 'WAITER_CALL_NOT_FOUND', 'Waiter call record not found', null, 404);
        return;
      }

      // Check transition in state machine
      const validation = validateWaiterCallTransition(waiterCall.status, 'ACKNOWLEDGED');
      if (!validation.isValid) {
        sendError(
          res,
          'INVALID_STATUS_TRANSITION',
          validation.errorMessage || 'Invalid status transition.',
          null,
          400
        );
        return;
      }

      waiterCall.status = 'ACKNOWLEDGED';
      waiterCall.acknowledgedAt = new Date();
      await waiterCall.save();

      // Emit status updated to keep all staff clients in sync
      try {
        NotificationService.getInstance().notifyWaiterCallResolved(
          restaurantId,
          waiterCall._id.toString(),
          'ACKNOWLEDGED',
          waiterCall.acknowledgedAt
        );
      } catch (err) {
        console.error('Failed to notify waiter call status update:', err);
      }

      sendSuccess(res, waiterCall, 'Waiter call acknowledged successfully');
    } catch (error) {
      next(error);
    }
  }

  async resolveWaiterCall(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, callId } = req.params;
      const user = req.user!;

      if (!mongoose.Types.ObjectId.isValid(callId)) {
        sendError(res, 'WAITER_CALL_NOT_FOUND', 'Waiter call record not found', null, 404);
        return;
      }

      const waiterCall = await WaiterCall.findOne({
        _id: new mongoose.Types.ObjectId(callId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!waiterCall) {
        sendError(res, 'WAITER_CALL_NOT_FOUND', 'Waiter call record not found', null, 404);
        return;
      }

      // Check transition in state machine
      const validation = validateWaiterCallTransition(waiterCall.status, 'RESOLVED');
      if (!validation.isValid) {
        sendError(
          res,
          'INVALID_STATUS_TRANSITION',
          validation.errorMessage || 'Invalid status transition.',
          null,
          400
        );
        return;
      }

      waiterCall.status = 'RESOLVED';
      waiterCall.resolvedAt = new Date();
      waiterCall.resolvedBy = new mongoose.Types.ObjectId(user.id);
      await waiterCall.save();

      // Emit waiter_call:resolved to restaurant:{restaurantId} room via central NotificationService
      try {
        NotificationService.getInstance().notifyWaiterCallResolved(
          restaurantId,
          waiterCall._id.toString(),
          'RESOLVED',
          waiterCall.resolvedAt
        );
      } catch (err) {
        console.error('Failed to notify waiter call resolution:', err);
      }

      sendSuccess(res, waiterCall, 'Waiter call resolved successfully');
    } catch (error) {
      next(error);
    }
  }
}
export default WaiterCallController;
