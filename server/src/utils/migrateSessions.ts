import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Order } from '../models/Order';
import { TableSession } from '../models/TableSession';
import { logger } from './logger';

dotenv.config();

export const runMigration = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pixora-qr';

  try {
    logger.info('Connecting to database for session migration...');
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoURI);
    }

    // Find all orders that do not have a sessionId or roundNumber
    const unmigratedOrders = await Order.find({
      $or: [
        { sessionId: { $exists: false } },
        { sessionId: null },
        { roundNumber: { $exists: false } },
        { roundNumber: null },
      ],
    });
    logger.info(`Found ${unmigratedOrders.length} unmigrated orders.`);

    if (unmigratedOrders.length === 0) {
      logger.info('No migration needed.');
      return;
    }

    // Group unmigrated orders by tableId
    const tableOrdersMap = new Map<string, any[]>();
    for (const order of unmigratedOrders) {
      const tableIdStr = order.tableId.toString();
      if (!tableOrdersMap.has(tableIdStr)) {
        tableOrdersMap.set(tableIdStr, []);
      }
      tableOrdersMap.get(tableIdStr)!.push(order);
    }

    logger.info(`Migrating orders across ${tableOrdersMap.size} unique tables...`);

    for (const [tableIdStr, orders] of tableOrdersMap.entries()) {
      // Sort orders by createdAt ascending
      orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const firstOrder = orders[0];
      const lastOrder = orders[orders.length - 1];

      // Calculate totals
      const subtotal = orders.reduce((sum, o) => sum + o.subtotal, 0);
      const tax = orders.reduce((sum, o) => sum + o.tax, 0);
      const total = orders.reduce((sum, o) => sum + o.total, 0);

      // Create a closed table session for this table
      const session = new TableSession({
        restaurantId: firstOrder.restaurantId,
        tableId: firstOrder.tableId,
        status: 'CLOSED',
        roundCount: orders.length,
        subtotal,
        tax,
        total,
        openedAt: firstOrder.createdAt,
        closedAt: lastOrder.updatedAt || lastOrder.createdAt,
      });

      await session.save();
      logger.info(`Created closed session ${session._id} for Table ${tableIdStr} with ${orders.length} rounds.`);

      // Update each order in this table session
      for (let idx = 0; idx < orders.length; idx++) {
        const order = orders[idx];
        order.sessionId = session._id;
        order.roundNumber = idx + 1;
        order.isMerged = false;

        // Map itemStatus from order status
        for (const item of order.items) {
          if (!item.itemStatus || item.itemStatus === 'PENDING') {
            if (order.status === 'SERVED') {
              item.itemStatus = 'SERVED';
              item.servedAt = order.updatedAt;
            } else if (order.status === 'READY') {
              item.itemStatus = 'READY';
            } else if (order.status === 'PREPARING') {
              item.itemStatus = 'PREPARING';
            } else {
              item.itemStatus = 'PENDING';
            }
          }
          if (!item.prepTimeMinutesSnapshot) {
            item.prepTimeMinutesSnapshot = 10; // default safe fallback
          }
        }

        // We bypass validation here because the pre-save hook might expect getOrderStatusRollup
        // which matches standard saves, but let's do a standard save since we populated everything perfectly.
        await order.save();
      }
    }

    logger.info('Migration completed successfully!');
  } catch (err) {
    logger.error('Error executing migration:', err);
    throw err;
  }
};

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default runMigration;
