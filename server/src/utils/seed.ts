import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { logger } from './logger';

dotenv.config();

const SEED_EMAIL = 'admin@pixora.dev';
const SEED_PASSWORD = 'PixoraDemo123!';

export const seedDatabase = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pixora-qr';

  try {
    logger.info('Connecting to database for seeding...');
    await mongoose.connect(mongoURI);

    logger.info('Checking for existing SUPER_ADMIN user...');
    // Fully idempotent: Check by both role or specific seed email
    const existingAdmin = await User.findOne({
      $or: [{ role: 'SUPER_ADMIN' }, { email: SEED_EMAIL.toLowerCase() }],
    });

    if (existingAdmin) {
      logger.info(`SUPER_ADMIN already exists: ${existingAdmin.email}. Skipping seeding.`);
      return;
    }

    const hashedPassword = await bcrypt.hash(SEED_PASSWORD, 10);

    const superAdmin = new User({
      email: SEED_EMAIL,
      passwordHash: hashedPassword,
      role: 'SUPER_ADMIN',
      name: 'Super Admin',
      isActive: true,
    });

    await superAdmin.save();

    logger.info('--------------------------------------------------');
    logger.info('SEED DATA CREATED SUCCESSFULLY!');
    logger.info(`Email: ${SEED_EMAIL}`);
    logger.info(`Password: ${SEED_PASSWORD}`);
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
