import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Restaurant } from './models/Restaurant';
import { Table } from './models/Table';
import { Category } from './models/Category';
import { MenuItem } from './models/MenuItem';

async function run() {
  const mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  console.log(`Starting MongoMemoryServer at ${mongoUri}`);

  // Setup env variables before importing app
  process.env.JWT_ACCESS_SECRET = 'dev_access_secret_key_123_abc_456_def';
  process.env.JWT_REFRESH_SECRET = 'dev_refresh_secret_key_123_abc_456_def';
  process.env.MONGODB_URI = mongoUri;
  process.env.CLOUDINARY_CLOUD_NAME = 'mock_cloud_name';
  process.env.CLOUDINARY_API_KEY = '123456789012345';
  process.env.CLOUDINARY_API_SECRET = 'mock_api_secret_abc123';
  process.env.PORT = '5000';
  process.env.CLIENT_URL = 'http://localhost:5173';

  await mongoose.connect(mongoUri);
  console.log('Connected to dev in-memory database.');

  // Create Restaurant (with 12% GST/tax)
  const restaurant = await Restaurant.create({
    name: 'Woodfired Pizza Place',
    slug: 'woodfired-pizza',
    description: 'Authentic sourdough pizzas cooked in a wood-fired brick oven.',
    currency: 'INR',
    taxRatePercent: 12.0,
    isActive: true,
    theme: {
      primaryColor: '#111827',
      secondaryColor: '#FFFFFF',
      accentColor: '#F59E0B',
      fontFamily: 'Plus Jakarta Sans',
    },
  });

  // Create Table
  const table = await Table.create({
    restaurantId: restaurant._id,
    tableNumber: '15',
    displayName: 'Table 15 (Terrace)',
    token: 'secureToken21CharactersLongXYZ',
    isActive: true,
    qrCodeUrl: '/api/v1/restaurants/60d0fe/tables/secureToken21CharactersLongXYZ/qr',
  });

  // Create Categories
  const categoryPizza = await Category.create({
    restaurantId: restaurant._id,
    name: 'Sourdough Pizzas',
    description: 'Hand-stretched sourdough pizzas',
    sortOrder: 1,
    isActive: true,
  });

  const categoryDrinks = await Category.create({
    restaurantId: restaurant._id,
    name: 'Beverages',
    description: 'Refreshing craft drinks',
    sortOrder: 2,
    isActive: true,
  });

  // Create Menu Items
  await MenuItem.create({
    restaurantId: restaurant._id,
    categoryId: categoryPizza._id,
    name: 'Margherita Sourdough',
    description: 'San San Marzano tomatoes, fresh mozzarella, organic basil, extra virgin olive oil.',
    price: 49900, // 499.00 INR
    isAvailable: true,
    isVegetarian: true,
    isSpicy: false,
    sortOrder: 1,
    addOns: [
      { name: 'Extra Mozzarella', priceDelta: 6000 }, // 60.00 INR
      { name: 'Truffle Oil', priceDelta: 12000 },
    ],
  });

  await MenuItem.create({
    restaurantId: restaurant._id,
    categoryId: categoryPizza._id,
    name: 'Diavola Pizza',
    description: 'Spicy calabrian salami, red onions, fresh mozzarella, hot honey drizzle.',
    price: 69900,
    isAvailable: true,
    isVegetarian: false,
    isSpicy: true,
    sortOrder: 2,
  });

  console.log('Seed database filled successfully!');

  // Now import and start Express server
  const { httpServer } = require('./index');
  httpServer.listen(5000, () => {
    console.log('Dev server running on http://localhost:5000');
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
