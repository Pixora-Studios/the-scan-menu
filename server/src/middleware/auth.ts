import { Request, Response, NextFunction } from 'express';
import { TokenService, TokenUserPayload } from '../services/token.service';
import { UserRepository } from '../repositories/user.repository';
import { sendError } from '../utils/response';

const tokenService = new TokenService();
const userRepository = new UserRepository();

export interface AuthenticatedRequest extends Request {
  user?: TokenUserPayload & { isActive: boolean };
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'UNAUTHORIZED', 'Access token is missing or malformed', null, 401);
      return;
    }

    const token = authHeader.split(' ')[1];
    let payload: TokenUserPayload;

    try {
      payload = tokenService.verifyAccessToken(token);
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        sendError(res, 'TOKEN_EXPIRED', 'Access token has expired', null, 401);
        return;
      }
      sendError(res, 'UNAUTHORIZED', 'Access token is invalid', null, 401);
      return;
    }

    const user = await userRepository.findById(payload.id);
    if (!user) {
      sendError(res, 'UNAUTHORIZED', 'User not found', null, 401);
      return;
    }

    if (!user.isActive) {
      sendError(res, 'USER_INACTIVE', 'User account is deactivated', null, 401);
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Authentication is required', null, 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(
        res,
        'FORBIDDEN',
        `Access denied. Requires one of these roles: [${roles.join(', ')}]`,
        null,
        403
      );
      return;
    }

    next();
  };
};
