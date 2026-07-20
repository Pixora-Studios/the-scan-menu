import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  logger.error(err, `Unhandled error on ${req.method} ${req.url}`);

  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';
  const details = process.env.NODE_ENV === 'development' ? err.stack : null;

  return sendError(res, code, message, details, status);
};
