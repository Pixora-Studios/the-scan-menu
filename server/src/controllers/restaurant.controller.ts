import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { Restaurant } from '../models/Restaurant';
import { Table } from '../models/Table';
import { User } from '../models/User';
import { RestaurantStaff } from '../models/RestaurantStaff';
import { TableService } from '../services/table.service';
import { sendSuccess, sendError } from '../utils/response';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const tableService = new TableService();

export class RestaurantController {
  constructor() {
    this.getRestaurantProfile = this.getRestaurantProfile.bind(this);
    this.editRestaurantProfile = this.editRestaurantProfile.bind(this);
    this.listTables = this.listTables.bind(this);
    this.createTable = this.createTable.bind(this);
    this.editTable = this.editTable.bind(this);
    this.deleteTable = this.deleteTable.bind(this);
    this.activateTable = this.activateTable.bind(this);
    this.deactivateTable = this.deactivateTable.bind(this);
    this.regenerateTableQr = this.regenerateTableQr.bind(this);
    this.getTableQr = this.getTableQr.bind(this);

    // Waiter Staff Management
    this.createStaff = this.createStaff.bind(this);
    this.listStaff = this.listStaff.bind(this);
    this.updateStaff = this.updateStaff.bind(this);
    this.deleteStaff = this.deleteStaff.bind(this);
  }

  async createStaff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const { email, name, password, pin } = req.body;

      if (!email || !name || !password) {
        sendError(res, 'BAD_REQUEST', 'Email, name, and password are required', null, 400);
        return;
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser) {
        sendError(res, 'USER_ALREADY_EXISTS', 'A user with this email already exists', null, 400);
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const staffUser = new User({
        email: email.toLowerCase().trim(),
        passwordHash,
        name: name.trim(),
        role: 'STAFF',
        isActive: true,
        pin: pin ? pin.trim() : undefined,
      });

      await staffUser.save();

      // Create RestaurantStaff row
      const staffJoin = new RestaurantStaff({
        userId: staffUser._id,
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        role: 'STAFF',
        isActive: true,
      });
      await staffJoin.save();

      sendSuccess(res, { id: staffUser._id, email: staffUser.email, name: staffUser.name, role: staffUser.role, pin: staffUser.pin }, 'Staff created and associated successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async listStaff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;

      const staffJoins = await RestaurantStaff.find({
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        role: 'STAFF',
        isActive: true,
      }).populate('userId');

      const staffUsers = staffJoins
        .map((j) => j.userId)
        .filter((u) => u !== null);

      sendSuccess(res, staffUsers, 'Staff listed successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStaff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, staffId } = req.params;
      const { name, email, password, pin, isActive } = req.body;

      const staffJoin = await RestaurantStaff.findOne({
        userId: new mongoose.Types.ObjectId(staffId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!staffJoin) {
        sendError(res, 'STAFF_NOT_FOUND', 'Staff association not found', null, 404);
        return;
      }

      const user = await User.findById(staffId);
      if (!user) {
        sendError(res, 'USER_NOT_FOUND', 'User not found', null, 404);
        return;
      }

      if (name) user.name = name.trim();
      if (email) user.email = email.toLowerCase().trim();
      if (password) user.passwordHash = await bcrypt.hash(password, 10);
      if (pin !== undefined) user.pin = pin ? pin.trim() : undefined;
      if (isActive !== undefined) {
        user.isActive = !!isActive;
        staffJoin.isActive = !!isActive;
        await staffJoin.save();
      }

      await user.save();

      sendSuccess(res, { id: user._id, email: user.email, name: user.name, role: user.role, pin: user.pin, isActive: user.isActive }, 'Staff updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteStaff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, staffId } = req.params;

      const staffJoin = await RestaurantStaff.findOneAndDelete({
        userId: new mongoose.Types.ObjectId(staffId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
      });

      if (!staffJoin) {
        sendError(res, 'STAFF_NOT_FOUND', 'Staff association not found', null, 404);
        return;
      }

      // Soft-archive user by deactivating
      await User.findByIdAndUpdate(staffId, { isActive: false });

      sendSuccess(res, {}, 'Staff association removed successfully');
    } catch (error) {
      next(error);
    }
  }

  async getRestaurantProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const restaurant = await Restaurant.findById(restaurantId);

      if (!restaurant) {
        sendError(res, 'RESTAURANT_NOT_FOUND', 'Restaurant not found', null, 404);
        return;
      }

      sendSuccess(res, restaurant, 'Restaurant profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async editRestaurantProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const updateData = { ...req.body };

      // Prevent managers from editing system-only fields
      delete updateData.slug;
      delete updateData.isActive;
      delete updateData.integrationConfig;

      // Validate orderWorkflowMode if provided
      if (updateData.orderWorkflowMode && !['FIVE_STEP', 'FOUR_STEP', 'THREE_STEP'].includes(updateData.orderWorkflowMode)) {
        sendError(res, 'BAD_REQUEST', 'Invalid orderWorkflowMode. Must be FIVE_STEP, FOUR_STEP, or THREE_STEP', null, 400);
        return;
      }

      // Validate autoAcceptConfig if provided
      if (updateData.autoAcceptConfig !== undefined) {
        const { enabled, delaySeconds } = updateData.autoAcceptConfig || {};
        if (typeof enabled !== 'boolean') {
          sendError(res, 'BAD_REQUEST', 'autoAcceptConfig.enabled must be a boolean', null, 400);
          return;
        }
        if (delaySeconds !== undefined && (typeof delaySeconds !== 'number' || delaySeconds < 1 || delaySeconds > 300)) {
          sendError(res, 'BAD_REQUEST', 'autoAcceptConfig.delaySeconds must be a number between 1 and 300', null, 400);
          return;
        }
      }

      const restaurant = await Restaurant.findByIdAndUpdate(restaurantId, updateData, { new: true });
      if (!restaurant) {
        sendError(res, 'RESTAURANT_NOT_FOUND', 'Restaurant not found', null, 404);
        return;
      }

      sendSuccess(res, restaurant, 'Restaurant profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async listTables(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const tables = await Table.find({ restaurantId: new mongoose.Types.ObjectId(restaurantId) }).sort({ tableNumber: 1 });

      sendSuccess(res, tables, 'Tables listed successfully');
    } catch (error) {
      next(error);
    }
  }

  async createTable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = req.params;
      const { tableNumber, displayName } = req.body;

      if (!tableNumber || !displayName) {
        sendError(res, 'BAD_REQUEST', 'tableNumber and displayName are required', null, 400);
        return;
      }

      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        sendError(res, 'RESTAURANT_NOT_FOUND', 'Restaurant not found', null, 404);
        return;
      }

      // Check duplicate tableNumber
      const duplicate = await Table.findOne({
        restaurantId: restaurant.id,
        tableNumber: tableNumber.trim(),
      });
      if (duplicate) {
        sendError(res, 'DUPLICATE_TABLE_NUMBER', `Table number ${tableNumber} already exists in this restaurant`, null, 400);
        return;
      }

      const token = tableService.generateSecureToken();
      const qrCodeUrl = `/api/v1/restaurants/${restaurant.id}/tables/${token}/qr`;

      const table = new Table({
        restaurantId: restaurant.id,
        tableNumber: tableNumber.trim(),
        displayName: displayName.trim(),
        token,
        qrCodeUrl,
        isActive: true,
      });

      await table.save();

      sendSuccess(res, table, 'Table created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async editTable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, tableId } = req.params;
      const { tableNumber, displayName, isActive } = req.body;

      const table = await Table.findOne({ _id: tableId, restaurantId });
      if (!table) {
        sendError(res, 'TABLE_NOT_FOUND', 'Table not found', null, 404);
        return;
      }

      if (tableNumber && tableNumber.trim() !== table.tableNumber) {
        // Check duplicates
        const duplicate = await Table.findOne({
          restaurantId,
          tableNumber: tableNumber.trim(),
          _id: { $ne: tableId },
        });
        if (duplicate) {
          sendError(res, 'DUPLICATE_TABLE_NUMBER', 'Table number already exists', null, 400);
          return;
        }
        table.tableNumber = tableNumber.trim();
      }

      if (displayName) {
        table.displayName = displayName.trim();
      }

      if (isActive !== undefined) {
        table.isActive = !!isActive;
      }

      await table.save();

      sendSuccess(res, table, 'Table updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteTable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, tableId } = req.params;
      const table = await Table.findOneAndDelete({ _id: tableId, restaurantId });

      if (!table) {
        sendError(res, 'TABLE_NOT_FOUND', 'Table not found', null, 404);
        return;
      }

      sendSuccess(res, {}, 'Table deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async activateTable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, tableId } = req.params;
      const table = await Table.findOneAndUpdate({ _id: tableId, restaurantId }, { isActive: true }, { new: true });

      if (!table) {
        sendError(res, 'TABLE_NOT_FOUND', 'Table not found', null, 404);
        return;
      }

      sendSuccess(res, table, 'Table activated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deactivateTable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, tableId } = req.params;
      const table = await Table.findOneAndUpdate({ _id: tableId, restaurantId }, { isActive: false }, { new: true });

      if (!table) {
        sendError(res, 'TABLE_NOT_FOUND', 'Table not found', null, 404);
        return;
      }

      sendSuccess(res, table, 'Table deactivated successfully');
    } catch (error) {
      next(error);
    }
  }

  async regenerateTableQr(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, tableId } = req.params;

      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        sendError(res, 'RESTAURANT_NOT_FOUND', 'Restaurant not found', null, 404);
        return;
      }

      const table = await Table.findOne({ _id: tableId, restaurantId: restaurant.id });
      if (!table) {
        sendError(res, 'TABLE_NOT_FOUND', 'Table not found', null, 404);
        return;
      }

      // Rotate token and invalidate old one
      const newToken = tableService.generateSecureToken();
      table.token = newToken;
      table.qrCodeUrl = `/api/v1/restaurants/${restaurant.id}/tables/${newToken}/qr`;

      await table.save();

      sendSuccess(res, table, 'QR code and table token regenerated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getTableQr(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId, tableId } = req.params;

      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        sendError(res, 'RESTAURANT_NOT_FOUND', 'Restaurant not found', null, 404);
        return;
      }

      // tableId in parameters could actually be the table ID or the token. Support finding by either to make it highly robust
      let table = await Table.findOne({ _id: mongoose.Types.ObjectId.isValid(tableId) ? tableId : undefined, restaurantId: restaurant.id });
      if (!table) {
        table = await Table.findOne({ token: tableId, restaurantId: restaurant.id });
      }

      if (!table) {
        sendError(res, 'TABLE_NOT_FOUND', 'Table not found', null, 404);
        return;
      }

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const tableUrl = `${clientUrl}/r/${restaurant.slug}/t/${table.token}`;

      const svg = await tableService.generateQrCodeSvg(tableUrl);
      const pngDataUri = await tableService.generateQrCodePngDataUri(tableUrl);

      sendSuccess(res, { svg, pngDataUri, url: tableUrl }, 'QR retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}
export default RestaurantController;
