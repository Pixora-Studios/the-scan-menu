import { Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { AuthenticatedRequest } from '../middleware/auth';
import { UserRepository } from '../repositories/user.repository';
import { RefreshTokenRepository } from '../repositories/refreshToken.repository';
import { TokenService } from '../services/token.service';
import { RestaurantStaff } from '../models/RestaurantStaff';
import { sendSuccess, sendError } from '../utils/response';

export class AuthController {
  private userRepository = new UserRepository();
  private tokenRepository = new RefreshTokenRepository();
  private tokenService = new TokenService();

  constructor() {
    this.login = this.login.bind(this);
    this.refresh = this.refresh.bind(this);
    this.logout = this.logout.bind(this);
    this.me = this.me.bind(this);
    this.changePassword = this.changePassword.bind(this);
  }

  async login(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', null, 401);
        return;
      }

      if (!user.isActive) {
        sendError(res, 'USER_INACTIVE', 'User account is deactivated', null, 401);
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', null, 401);
        return;
      }

      const payload = { id: user.id, email: user.email, role: user.role };
      const accessToken = this.tokenService.generateAccessToken(payload);

      const refreshTokenStr = this.tokenService.generateRefreshTokenString();
      const tokenHash = this.tokenService.hashToken(refreshTokenStr);
      const expiresAt = this.tokenService.getRefreshTokenExpiry();

      await this.tokenRepository.create(user.id, tokenHash, expiresAt);

      res.cookie('refreshToken', refreshTokenStr, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      const staffRecords = await RestaurantStaff.find({ userId: user.id, isActive: true });
      const assignedRestaurants = staffRecords.map((s) => s.restaurantId.toString());

      sendSuccess(
        res,
        {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isActive: user.isActive,
            restaurants: assignedRestaurants,
          },
        },
        'Login successful'
      );
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshTokenStr = req.cookies?.refreshToken;
      if (!refreshTokenStr) {
        sendError(res, 'MISSING_REFRESH_TOKEN', 'Refresh token is missing', null, 401);
        return;
      }

      const tokenHash = this.tokenService.hashToken(refreshTokenStr);
      const tokenDoc = await this.tokenRepository.findByHash(tokenHash);

      if (!tokenDoc) {
        sendError(res, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or revoked', null, 401);
        return;
      }

      if (tokenDoc.expiresAt < new Date()) {
        sendError(res, 'EXPIRED_REFRESH_TOKEN', 'Refresh token has expired', null, 401);
        return;
      }

      const user = await this.userRepository.findById(tokenDoc.userId.toString());
      if (!user || !user.isActive) {
        sendError(res, 'UNAUTHORIZED', 'Associated user is invalid or deactivated', null, 401);
        return;
      }

      // Token rotation
      await this.tokenRepository.revoke(tokenHash);

      const payload = { id: user.id, email: user.email, role: user.role };
      const newAccessToken = this.tokenService.generateAccessToken(payload);

      const newRefreshTokenStr = this.tokenService.generateRefreshTokenString();
      const newRefreshTokenHash = this.tokenService.hashToken(newRefreshTokenStr);
      const expiresAt = this.tokenService.getRefreshTokenExpiry();

      await this.tokenRepository.create(user.id, newRefreshTokenHash, expiresAt);

      res.cookie('refreshToken', newRefreshTokenStr, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      sendSuccess(
        res,
        {
          accessToken: newAccessToken,
        },
        'Token refreshed successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshTokenStr = req.cookies?.refreshToken;
      if (refreshTokenStr) {
        const tokenHash = this.tokenService.hashToken(refreshTokenStr);
        await this.tokenRepository.revoke(tokenHash);
      }

      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth',
      });

      sendSuccess(res, {}, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  async me(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'UNAUTHORIZED', 'Not authenticated', null, 401);
        return;
      }

      const user = await this.userRepository.findById(req.user.id);
      if (!user) {
        sendError(res, 'NOT_FOUND', 'User not found', null, 404);
        return;
      }

      const staffRecords = await RestaurantStaff.find({ userId: user.id, isActive: true });
      const assignedRestaurants = staffRecords.map((s) => s.restaurantId.toString());

      sendSuccess(
        res,
        {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isActive: user.isActive,
            restaurants: assignedRestaurants,
          },
        },
        'User details fetched successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        sendError(res, 'UNAUTHORIZED', 'Not authenticated', null, 401);
        return;
      }

      const { currentPassword, newPassword } = req.body;

      const user = await this.userRepository.findById(req.user.id);
      if (!user) {
        sendError(res, 'NOT_FOUND', 'User not found', null, 404);
        return;
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isPasswordValid) {
        sendError(res, 'INVALID_CURRENT_PASSWORD', 'The current password provided is incorrect', null, 400);
        return;
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      user.passwordHash = newPasswordHash;
      await user.save();

      // Revoke all refresh tokens on password change to force login on other devices
      await this.tokenRepository.revokeAllForUser(user.id);

      sendSuccess(res, {}, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }
}
export default AuthController;
