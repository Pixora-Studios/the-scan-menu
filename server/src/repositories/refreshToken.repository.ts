import { RefreshToken, IRefreshToken } from '../models/RefreshToken';
import { Types } from 'mongoose';

export class RefreshTokenRepository {
  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<IRefreshToken> {
    const refreshToken = new RefreshToken({
      userId: new Types.ObjectId(userId),
      tokenHash,
      expiresAt,
    });
    return refreshToken.save();
  }

  async findByHash(tokenHash: string): Promise<IRefreshToken | null> {
    return RefreshToken.findOne({ tokenHash, revokedAt: { $exists: false } });
  }

  async revoke(tokenHash: string): Promise<IRefreshToken | null> {
    return RefreshToken.findOneAndUpdate(
      { tokenHash },
      { revokedAt: new Date() },
      { new: true }
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await RefreshToken.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: { $exists: false } },
      { revokedAt: new Date() }
    );
  }
}
