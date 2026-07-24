import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { Restaurant } from '../models/Restaurant';
import { RestaurantStaff } from '../models/RestaurantStaff';
import { Category } from '../models/Category';
import { MenuItem } from '../models/MenuItem';
import { Table } from '../models/Table';
import { TableSession } from '../models/TableSession';
import { Order, OrderCounter } from '../models/Order';
import { WaiterCall } from '../models/WaiterCall';
import { IntegrationSyncLog } from '../models/IntegrationSyncLog';
import { RefreshToken } from '../models/RefreshToken';

dotenv.config();

export const cleanDatabase = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pixora-qr';

  try {
    console.log('Connecting to database for cleanup...');
    await mongoose.connect(mongoURI);

    console.log('--- Database Count Before Cleanup ---');
    console.log(`Users: ${await User.countDocuments()}`);
    console.log(`Restaurants: ${await Restaurant.countDocuments()}`);
    console.log(`RestaurantStaff: ${await RestaurantStaff.countDocuments()}`);
    console.log(`Categories: ${await Category.countDocuments()}`);
    console.log(`MenuItems: ${await MenuItem.countDocuments()}`);
    console.log(`Tables: ${await Table.countDocuments()}`);
    console.log(`TableSessions: ${await TableSession.countDocuments()}`);
    console.log(`Orders: ${await Order.countDocuments()}`);
    console.log(`OrderCounters: ${await OrderCounter.countDocuments()}`);
    console.log(`WaiterCalls: ${await WaiterCall.countDocuments()}`);
    console.log(`IntegrationSyncLogs: ${await IntegrationSyncLog.countDocuments()}`);
    console.log(`RefreshTokens: ${await RefreshToken.countDocuments()}`);

    console.log('\nCleaning operational data (Orders, Sessions, Menus, Categories, Tables, Logs)...');
    
    // Delete operational data
    await Order.deleteMany({});
    await OrderCounter.deleteMany({});
    await TableSession.deleteMany({});
    await MenuItem.deleteMany({});
    await Category.deleteMany({});
    await Table.deleteMany({});
    await WaiterCall.deleteMany({});
    await IntegrationSyncLog.deleteMany({});
    await RefreshToken.deleteMany({});

    console.log('\n--- Database Count After Cleanup ---');
    console.log(`Users: ${await User.countDocuments()}`);
    console.log(`Restaurants: ${await Restaurant.countDocuments()}`);
    console.log(`RestaurantStaff: ${await RestaurantStaff.countDocuments()}`);
    console.log(`Categories: ${await Category.countDocuments()}`);
    console.log(`MenuItems: ${await MenuItem.countDocuments()}`);
    console.log(`Tables: ${await Table.countDocuments()}`);
    console.log(`TableSessions: ${await TableSession.countDocuments()}`);
    console.log(`Orders: ${await Order.countDocuments()}`);
    console.log(`OrderCounters: ${await OrderCounter.countDocuments()}`);
    console.log(`WaiterCalls: ${await WaiterCall.countDocuments()}`);
    console.log(`IntegrationSyncLogs: ${await IntegrationSyncLog.countDocuments()}`);

    console.log('\nCleanup completed successfully! Users and Restaurants preserved.');
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  cleanDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
