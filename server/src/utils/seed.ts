import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { Restaurant } from '../models/Restaurant';
import { Category } from '../models/Category';
import { MenuItem } from '../models/MenuItem';
import { Table } from '../models/Table';
import { RestaurantStaff } from '../models/RestaurantStaff';
import { logger } from './logger';

dotenv.config();

const ADMIN_EMAIL = 'admin@pixora.dev';
const ADMIN_PASSWORD = 'PixoraDemo123!';

const MANAGER_EMAIL = 'manager@democafe.com';
const STAFF1_EMAIL = 'staff1@democafe.com';
const STAFF2_EMAIL = 'staff2@democafe.com';
const DEMO_PASSWORD = 'PixoraDemo123!';

export const seedDatabase = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pixora-qr';

  try {
    logger.info('Connecting to database for seeding...');
    await mongoose.connect(mongoURI);

    // 1. Seed SUPER_ADMIN idempotently
    logger.info('Checking for existing SUPER_ADMIN user...');
    let superAdmin = await User.findOne({
      $or: [{ role: 'SUPER_ADMIN' }, { email: ADMIN_EMAIL.toLowerCase() }],
    });

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    if (!superAdmin) {
      superAdmin = new User({
        email: ADMIN_EMAIL,
        passwordHash: hashedPassword,
        role: 'SUPER_ADMIN',
        name: 'Super Admin',
        isActive: true,
      });
      await superAdmin.save();
      logger.info('SUPER_ADMIN created successfully.');
    } else {
      logger.info(`SUPER_ADMIN already exists: ${superAdmin.email}.`);
    }

    // 2. Seed "Demo Cafe" Restaurant idempotently
    logger.info('Checking for existing "Demo Cafe" restaurant...');
    let restaurant = await Restaurant.findOne({ slug: 'demo-cafe' });
    if (!restaurant) {
      restaurant = new Restaurant({
        name: 'Demo Cafe',
        slug: 'demo-cafe',
        description: 'A charming, high-performance coffee and dining spot.',
        phone: '+91 9999999999',
        email: 'info@democafe.com',
        address: '123 Espresso Boulevard, Bangalore, Karnataka',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        taxRatePercent: 5.0, // 5% tax
        theme: {
          primaryColor: '#111827',
          secondaryColor: '#FFFFFF',
          accentColor: '#F59E0B',
          fontFamily: 'Plus Jakarta Sans',
        },
      });
      await restaurant.save();
      logger.info('Restaurant "Demo Cafe" created successfully.');
    } else {
      logger.info('"Demo Cafe" restaurant already exists.');
    }

    // 3. Seed Manager & Staff users idempotently
    const demoHashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

    // Manager
    let manager = await User.findOne({ email: MANAGER_EMAIL });
    if (!manager) {
      manager = new User({
        email: MANAGER_EMAIL,
        passwordHash: demoHashedPassword,
        role: 'MANAGER',
        name: 'Demo Manager',
        isActive: true,
      });
      await manager.save();
      logger.info(`Manager account created: ${MANAGER_EMAIL}`);
    }

    // RestaurantStaff Manager join row
    const existingStaffManager = await RestaurantStaff.findOne({
      userId: manager._id,
      restaurantId: restaurant._id,
    });
    if (!existingStaffManager) {
      await RestaurantStaff.create({
        userId: manager._id,
        restaurantId: restaurant._id,
        role: 'MANAGER',
        isActive: true,
      });
      logger.info('Linked Manager to "Demo Cafe".');
    }

    // Staff 1
    let staff1 = await User.findOne({ email: STAFF1_EMAIL });
    if (!staff1) {
      staff1 = new User({
        email: STAFF1_EMAIL,
        passwordHash: demoHashedPassword,
        role: 'STAFF',
        name: 'Demo Staff One',
        isActive: true,
      });
      await staff1.save();
      logger.info(`Staff 1 account created: ${STAFF1_EMAIL}`);
    }

    const existingStaff1Join = await RestaurantStaff.findOne({
      userId: staff1._id,
      restaurantId: restaurant._id,
    });
    if (!existingStaff1Join) {
      await RestaurantStaff.create({
        userId: staff1._id,
        restaurantId: restaurant._id,
        role: 'STAFF',
        isActive: true,
      });
      logger.info('Linked Staff One to "Demo Cafe".');
    }

    // Staff 2
    let staff2 = await User.findOne({ email: STAFF2_EMAIL });
    if (!staff2) {
      staff2 = new User({
        email: STAFF2_EMAIL,
        passwordHash: demoHashedPassword,
        role: 'STAFF',
        name: 'Demo Staff Two',
        isActive: true,
      });
      await staff2.save();
      logger.info(`Staff 2 account created: ${STAFF2_EMAIL}`);
    }

    const existingStaff2Join = await RestaurantStaff.findOne({
      userId: staff2._id,
      restaurantId: restaurant._id,
    });
    if (!existingStaff2Join) {
      await RestaurantStaff.create({
        userId: staff2._id,
        restaurantId: restaurant._id,
        role: 'STAFF',
        isActive: true,
      });
      logger.info('Linked Staff Two to "Demo Cafe".');
    }

    // 4. Seed 5 Tables idempotently
    logger.info('Seeding tables...');
    const tablesData = [
      { num: '1', name: 'Table 1 (Window Side)' },
      { num: '2', name: 'Table 2 (Lounge)' },
      { num: '3', name: 'Table 3 (Terrace)' },
      { num: '4', name: 'Table 4 (Bar Side)' },
      { num: '5', name: 'Table 5 (VIP Cabin)' },
    ];

    for (const t of tablesData) {
      const existingTable = await Table.findOne({
        restaurantId: restaurant._id,
        tableNumber: t.num,
      });
      if (!existingTable) {
        await Table.create({
          restaurantId: restaurant._id,
          tableNumber: t.num,
          displayName: t.name,
          token: `secureTableTokenDemoCafeNumber${t.num}XYZ`,
          qrCodeUrl: `/api/v1/restaurants/${restaurant._id}/tables/secureTableTokenDemoCafeNumber${t.num}XYZ/qr`,
          isActive: true,
        });
        logger.info(`Table ${t.num} seeded.`);
      }
    }

    // 5. Seed 5 Categories idempotently
    logger.info('Seeding categories...');
    const catsData = [
      { name: 'Coffee Specialties', order: 0 },
      { name: 'House Baked Pizzas', order: 1 },
      { name: 'Gourmet Sliders', order: 2 },
      { name: 'Artisanal Desserts', order: 3 },
      { name: 'Refreshing Tonics', order: 4 },
    ];

    const categoryMap: Record<string, any> = {};

    for (const c of catsData) {
      let cat = await Category.findOne({
        restaurantId: restaurant._id,
        name: c.name,
      });
      if (!cat) {
        cat = new Category({
          restaurantId: restaurant._id,
          name: c.name,
          sortOrder: c.order,
          isActive: true,
        });
        await cat.save();
        logger.info(`Category "${c.name}" seeded.`);
      }
      categoryMap[c.name] = cat._id;
    }

    // 6. Seed 20 Menu Items (4 per category) idempotently
    logger.info('Seeding menu items...');
    const itemsData = [
      // 1. Coffee
      { cat: 'Coffee Specialties', name: 'Madras Filter Coffee', price: 12000, veg: true, spicy: false, prep: 4 },
      { cat: 'Coffee Specialties', name: 'Nutella Mocha Latte', price: 21000, veg: true, spicy: false, prep: 5 },
      { cat: 'Coffee Specialties', name: 'Single Origin Espresso', price: 15000, veg: true, spicy: false, prep: 3 },
      { cat: 'Coffee Specialties', name: 'Cold Brew on Draft', price: 18000, veg: true, spicy: false, prep: 3 },
      // 2. Pizzas
      { cat: 'House Baked Pizzas', name: 'Classic Margherita Sourdough', price: 44900, veg: true, spicy: false, prep: 12 },
      { cat: 'House Baked Pizzas', name: 'Spicy Paneer Tikka Furnace Pizza', price: 54900, veg: true, spicy: true, prep: 15 },
      { cat: 'House Baked Pizzas', name: 'Garden Pesto & Mushroom Pizza', price: 49900, veg: true, spicy: false, prep: 14 },
      { cat: 'House Baked Pizzas', name: 'Hot Chili Pepper Double Cheese Pizza', price: 52900, veg: true, spicy: true, prep: 13 },
      // 3. Sliders
      { cat: 'Gourmet Sliders', name: 'Crispy Veg Patty Brioche Slider', price: 29900, veg: true, spicy: false, prep: 10 },
      { cat: 'Gourmet Sliders', name: 'Spiced Potato Masala Slider', price: 19900, veg: true, spicy: true, prep: 8 },
      { cat: 'Gourmet Sliders', name: 'Paneer Firecracker Melt Slider', price: 32900, veg: true, spicy: true, prep: 11 },
      { cat: 'Gourmet Sliders', name: 'Portobello Truffle Cheese Slider', price: 34900, veg: true, spicy: false, prep: 12 },
      // 4. Desserts
      { cat: 'Artisanal Desserts', name: 'Woodfired Hot Fudge Skillet Cookie', price: 26000, veg: true, spicy: false, prep: 10 },
      { cat: 'Artisanal Desserts', name: 'Saffron Pistachio Tres Leches', price: 32000, veg: true, spicy: false, prep: 6 },
      { cat: 'Artisanal Desserts', name: 'Classic Tiramisu on Espresso Soak', price: 29000, veg: true, spicy: false, prep: 5 },
      { cat: 'Artisanal Desserts', name: 'Salted Caramel Pecan Tart', price: 28000, veg: true, spicy: false, prep: 5 },
      // 5. Tonics
      { cat: 'Refreshing Tonics', name: 'Cold Pressed Orange Zest Mojito', price: 16000, veg: true, spicy: false, prep: 4 },
      { cat: 'Refreshing Tonics', name: 'Ginger Lemongrass Herbal Fizz', price: 14000, veg: true, spicy: false, prep: 4 },
      { cat: 'Refreshing Tonics', name: 'Wild Berries Iced Hibiscus Tea', price: 15000, veg: true, spicy: false, prep: 3 },
      { cat: 'Refreshing Tonics', name: 'Cucumber Cooler Basil Tonic', price: 13000, veg: true, spicy: false, prep: 4 },
    ];

    for (const [idx, item] of itemsData.entries()) {
      const catId = categoryMap[item.cat];
      if (!catId) continue;

      const existingItem = await MenuItem.findOne({
        restaurantId: restaurant._id,
        name: item.name,
      });

      if (!existingItem) {
        await MenuItem.create({
          restaurantId: restaurant._id,
          categoryId: catId,
          name: item.name,
          description: `Signature delicious house specialty ${item.name.toLowerCase()} prepared fresh.`,
          price: item.price,
          isAvailable: true,
          isVegetarian: item.veg,
          isSpicy: item.spicy,
          prepTimeMinutes: item.prep,
          sortOrder: idx,
          addOns: [
            { name: 'Extra Portion', priceDelta: 4000 },
          ],
        });
        logger.info(`Menu Item "${item.name}" seeded.`);
      }
    }

    logger.info('--------------------------------------------------');
    logger.info('IDEMPOTENT SEED DATA CREATED SUCCESSFULLY!');
    logger.info(`SUPER ADMIN Email: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    logger.info(`DEMO RESTAURANT SLUG: demo-cafe`);
    logger.info(`DEMO MANAGER Email: ${MANAGER_EMAIL} / ${DEMO_PASSWORD}`);
    logger.info(`DEMO STAFF 1 Email: ${STAFF1_EMAIL} / ${DEMO_PASSWORD}`);
    logger.info(`DEMO STAFF 2 Email: ${STAFF2_EMAIL} / ${DEMO_PASSWORD}`);
    logger.info('--------------------------------------------------');
  } catch (error) {
    logger.error(error, 'Error seeding database');
    throw error;
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from database.');
  }
};

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
export default seedDatabase;
